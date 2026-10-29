const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture() {
    const events = new Map(), handlers = {}, frames = new Map(), canvases = [], draws = [], shellCalls = [];
    let module, serial = 0;
    const document = { hidden: false, body: { appendChild: canvas => canvases.push(canvas) },
        createElement() {
            return { style: {}, dataset: {}, setAttribute() {},
                remove() { canvases.splice(canvases.indexOf(this), 1); },
                getContext: () => ({ clearRect() {}, fillRect: (...args) => draws.push(args) }) };
        } };
    const motion = { matches: false, addEventListener(event, handler) { this.change = handler; } };
    const window = { matchMedia: () => motion, performance: { now: () => 0 },
        requestAnimationFrame(handler) { frames.set(++serial, handler); return serial; },
        cancelAnimationFrame(id) { frames.delete(id); } };
    function $(element) {
        assert.equal(element, document);
        return { on(names, handler) {
            for (const name of names.split(' ')) events.set(name, handler);
            return this;
        } };
    }
    const map = { get: (x, y) => ({ x, y }), visible: cell => cell.x !== 9 };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,
        '../game_data/static/traversal-effects.js'), 'utf8'), {
        window, document, define(dependencies, factory) {
            module = factory($, { register_handlers: values => Object.assign(handlers, values) }, map,
                { paint: (...args) => shellCalls.push(['paint', ...args.slice(1)]),
                    roll: (...args) => shellCalls.push(['roll', ...args]) });
        }
    });
    const renderer = { viewX: 0, element: { width: 640, height: 480, isConnected: true,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 240 }) },
        in_view: x => x >= 0 && x < 10,
        canvas_coords(x, y) { return { x: (x - this.viewX) * 64, y: y * 64, width: 64, height: 64 }; } };
    module.attach(renderer);
    return { events, handlers, frames, canvases, draws, document, motion, renderer, shellCalls,
        init: () => events.get('game_init.traversalEffects')(),
        tick(time = 100) {
            const pending = Array.from(frames.values());
            frames.clear();
            pending.forEach(callback => callback(time));
        } };
}

test('particles use actual paths, skip hidden tiles and never capture input', () => {
    const f = fixture();
    f.handlers.traversal_effect({ path: [{ x: 2, y: 1 }] });
    assert.equal(f.frames.size, 0);
    f.init();
    f.handlers.traversal_effect({ path: [{ x: 2, y: 1 }, { x: 9, y: 1 }], impact: true });
    f.tick();
    assert.equal(f.canvases.length, 1);
    assert.equal(f.draws.length, 6, 'hidden endpoint contributes no visible particles');
    assert.equal(f.canvases[0].style.pointerEvents, 'none');
    assert.equal(f.canvases[0].width, 640, 'device pixels match the renderer on retina displays');
    assert.equal(f.canvases[0].style.width, '320px');
    f.renderer.viewX = 1;
    f.draws.length = 0;
    f.tick();
    assert(f.draws.every(draw => draw[0] < 140), 'anchors follow the camera');
    f.tick(1000);
    assert.equal(f.canvases.length, 0);
    assert.equal(f.frames.size, 0);
});

test('rolling shells animate to the landing cell and stop before the victim', () => {
    const f = fixture();
    f.init();
    f.handlers.traversal_effect({ path: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
        impact: true, sprite: 'shell', actor_slot: 2 });
    assert.deepEqual(f.shellCalls[0], ['roll', 2, 186]);
    f.tick(170);
    const paint = f.shellCalls.find(call => call[0] === 'paint');
    assert(paint[1] >= 64 && paint[1] <= 128, 'spinning sprite never enters the struck creature tile');
    assert(paint[5] > 0, 'sprite rotates through the dash');
});

test('particles are bounded and tolerate malformed packets', () => {
    const f = fixture();
    f.init();
    for (const packet of [{}, { path: null }, { path: [null, {}, { x: '1', y: 1 }] }])
        f.handlers.traversal_effect(packet);
    assert.equal(f.frames.size, 0);
    f.handlers.traversal_effect({ path: Array.from({ length: 1000 }, () => ({ x: 2, y: 1 })), impact: true });
    f.tick(200);
    assert.equal(f.canvases[0].dataset.particles, '240');
    assert.equal(f.draws.length, 240);
});

test('reduced motion and lifecycle changes clear every frame and canvas', () => {
    const f = fixture();
    const packet = { path: [{ x: 2, y: 1 }] };
    f.init();
    f.motion.matches = true;
    f.handlers.traversal_effect(packet);
    assert.equal(f.frames.size, 0);
    f.motion.matches = false;
    f.handlers.traversal_effect(packet);
    f.tick();
    f.events.get('party_state_rendered.traversalEffects')({}, { floor: 'D:1' });
    f.events.get('party_state_rendered.traversalEffects')({}, { floor: 'D:2' });
    assert.equal(f.canvases.length, 0);
    assert.equal(f.frames.size, 0);
    f.handlers.traversal_effect(packet);
    f.tick();
    f.document.hidden = true;
    f.events.get('visibilitychange.traversalEffects')();
    assert.equal(f.canvases.length, 0);
    f.document.hidden = false;
    f.handlers.traversal_effect(packet);
    f.tick();
    f.motion.matches = true;
    f.motion.change();
    assert.equal(f.canvases.length, 0);
    f.events.get('game_cleanup.traversalEffects')();
    f.motion.matches = false;
    f.handlers.traversal_effect(packet);
    assert.equal(f.frames.size, 0);
});
