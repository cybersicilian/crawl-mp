const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.join(__dirname, '../game_data/static');

function load(name, dependencies = {}, globals = {}) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
        ...globals, define(names, factory) { result = factory(...names.map(key => dependencies[key])); }
    });
    return result;
}
const status = load('party-status-model');
const model = () => load('hero-feedback-model', { './party-status-model': status }).create();
const hero = (extra = {}) => ({ slot: 0, name: 'Aster', place: 'D:1', alive: true,
    pos: { x: 2, y: 3 }, hp: 20, hp_max: 30, real_hp_max: 30, xl: 2, statuses: [], ...extra });
const state = (members, extra = {}) => ({ floor: 'D:1', members, ...extra });
const kinds = changes => Array.from(changes.events, event => event.kind);

test('only confirmed changes animate; snapshots cannot alias subsequent packet mutations', () => {
    const tracker = model(), member = hero();
    assert.deepEqual(kinds(tracker.update(state([member]))), []);
    member.hp = 15; member.pos.x++;
    const changes = tracker.update(state([member]));
    assert.deepEqual(kinds(changes), ['step', 'damage']);
    const delta = changes.events[1];
    assert.equal(delta.amount, -5);
    assert.equal(delta.from, 100 * 20 / 30);
    assert.equal(delta.to, 50);
    assert.equal(delta.echo, true);
    assert.deepEqual(kinds(tracker.update(state([member], { controlled_slot: 1 }))), [],
        'duplicate packets and a camera/control switch do not invent events');
    assert.deepEqual(kinds(tracker.update(state([hero({ hp: 18, pos: member.pos, xl: 3 })]))), ['heal', 'level']);
});

test('joins, identities, unknown health, capacity changes and other floors are baselines', () => {
    for (const update of [
        hero({ name: 'Replacement', hp: 4 }), hero({ hp: undefined }),
        hero({ hp: 25, hp_max: 40 }), hero({ hp: 4, place: 'D:2' }),
        hero({ hp: 4, on_same_level: false })
    ]) {
        const tracker = model(); tracker.update(state([hero()]));
        assert.deepEqual(kinds(tracker.update(state([update]))), []);
    }
    const tracker = model(); tracker.update(state([hero()]));
    const floorChange = tracker.update(state([hero({ hp: 4, pos: { x: 3, y: 3 } })], { floor: 'D:2' }));
    assert.equal(floorChange.reset, true);
    assert.deepEqual(kinds(floorChange), []);
    tracker.reset();
    assert.deepEqual(kinds(tracker.update(state([hero({ hp: 2 })]))), []);
    tracker.update(state([]));
    assert.deepEqual(kinds(tracker.update(state([hero()]))), [], 'rejoining a removed slot starts fresh');
});

test('teleports, downed heroes and unavailable positions never create walking trails', () => {
    for (const pos of [{ x: 8, y: 3 }, null, { x: '3', y: 3 }]) {
        const tracker = model(); tracker.update(state([hero()]));
        assert.deepEqual(kinds(tracker.update(state([hero({ pos })]))), []);
    }
    const tracker = model(); tracker.update(state([hero()]));
    assert.deepEqual(kinds(tracker.update(state([hero({ hp: 0, alive: false, pos: { x: 3, y: 3 } })]))), ['damage']);
    assert.deepEqual(kinds(tracker.update(state([hero()]))), [], 'revival starts a new baseline');
});

test('health echoes preserve poison forecasts and drained capacity; party deltas remain distinct', () => {
    const tracker = model();
    tracker.update(state([hero({ poison_survival: 15, real_hp_max: 40 }), hero({ slot: 1 })]));
    const changes = tracker.update(state([
        hero({ hp: 17, poison_survival: 12, real_hp_max: 40 }), hero({ slot: 1, hp: 22 })
    ]));
    assert.deepEqual(kinds(changes), ['damage', 'heal']);
    assert.equal(changes.events[0].slot, 0);
    assert.equal(changes.events[0].echo, false);
    assert.equal(changes.events[0].to, 30, 'fill reuses the canonical health projection');
    assert.equal(changes.events[1].slot, 1);
    assert.equal(changes.events[1].amount, 2);
});

function layerFixture() {
    let serial = 0, now = 0;
    const frames = new Map(), canvases = [], painted = [], events = {};
    const motion = { matches: false, addEventListener(name, handler) { this.change = handler; } };
    const document = { hidden: false, addEventListener(name, handler) { events[name] = handler; },
        body: { appendChild(node) { canvases.push(node); } },
        createElement() { return { style: {}, dataset: {}, setAttribute() {},
            getContext: () => ({ clearRect() {}, save() {}, restore() {} }),
            remove() { canvases.splice(canvases.indexOf(this), 1); } }; } };
    const window = { matchMedia: () => motion, performance: { now: () => now },
        requestAnimationFrame(callback) { frames.set(++serial, callback); return serial; },
        cancelAnimationFrame(id) { frames.delete(id); } };
    const renderer = { viewX: 0, element: { width: 640, height: 480, isConnected: true,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 240 }) },
        in_view: x => x >= 0 && x < 10,
        canvas_coords(x, y) { return { x: (x - this.viewX) * 64, y: y * 64, width: 64, height: 64 }; } };
    const layer = load('map-effect-layer', {}, { document, window }).create({ className: 'test-effects', limit: 4,
        visible: pos => pos.x !== 9, paint: (ctx, effect, point, progress) => painted.push({ effect, point, progress }) });
    layer.attach(renderer);
    const effect = (key, x = 2, extra = {}) => ({ key, pos: { x, y: 3 }, duration: 500, ...extra });
    return { layer, document, motion, frames, canvases, painted, renderer, effect, events,
        tick(time = 100) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); } };
}

test('overlay follows camera, scale and visibility without capturing input or retaining idle work', () => {
    const f = layerFixture();
    f.layer.play([f.effect('before-init')]); assert.equal(f.frames.size, 0);
    f.layer.setEnabled(true);
    f.layer.play([f.effect('visible'), f.effect('hidden', 9), f.effect('outside', 20),
        f.effect('hidden-origin', 3, { origin: { x: 9, y: 3 } })]);
    f.tick();
    assert.equal(f.painted.length, 1);
    assert.equal(f.canvases[0].width, 640);
    assert.equal(f.canvases[0].style.width, '320px');
    assert.equal(f.canvases[0].style.pointerEvents, 'none');
    assert.equal(f.painted[0].point.x, 128);
    f.renderer.viewX = 1; f.renderer.element.width = 1280;
    f.tick(150);
    assert.equal(f.painted.at(-1).point.x, 64);
    assert.equal(f.canvases[0].width, 1280);
    f.tick(501);
    assert.equal(f.frames.size, 0);
    assert.equal(f.canvases.length, 0);
});

test('rapid feedback is bounded, coalesces matching keys and obeys lifecycle and motion preference', () => {
    const f = layerFixture(); f.layer.setEnabled(true);
    for (let i = 0; i < 100; i++) f.layer.play([f.effect('cue-' + i)]);
    f.layer.play([f.effect('cue-99')]); f.tick();
    assert.equal(f.canvases[0].dataset.effects, '4');
    f.document.hidden = true; f.events.visibilitychange();
    assert.equal(f.frames.size, 0); assert.equal(f.canvases.length, 0);
    f.layer.play([f.effect('hidden')]); assert.equal(f.frames.size, 0);
    f.document.hidden = false;
    f.layer.play([f.effect('visible')]); f.tick(200);
    f.motion.matches = true; f.motion.change();
    assert.equal(f.canvases.length, 0); assert.equal(f.frames.size, 0);
    f.layer.play([f.effect('reduced')]); assert.equal(f.frames.size, 0);
    f.motion.matches = false;
    f.layer.play([f.effect('again')]); f.tick(250);
    f.layer.setEnabled(false);
    assert.equal(f.canvases.length, 0); assert.equal(f.frames.size, 0);
});

test('removing one transient preserves others and immediately releases an empty layer', () => {
    const f = layerFixture(); f.layer.setEnabled(true);
    f.layer.play([f.effect('target'), f.effect('impact')]); f.tick();
    f.layer.remove('target'); f.tick(150);
    assert.equal(f.canvases[0].dataset.effects, '1');
    f.layer.remove('impact');
    assert.equal(f.canvases.length, 0); assert.equal(f.frames.size, 0);
});
