/* Creature light and shadow, the hero lantern and regional atmosphere. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const noop = () => {};
function load(file, deps, globals = {}) {
    let value;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { Math, ...globals, define(names, factory) {
        if (typeof names === 'function') { factory = names; names = []; }
        value = factory(...names.map(name => { assert(name in deps, 'Missing ' + name); return deps[name]; }));
    } });
    return value;
}
const sampling = load('static/scripts/light-field-sampling.js', {});
const weighted = load('static/scripts/weighted-cache.js', {});
function context(canvas) {
    const calls = [];
    return { canvas, calls, globalAlpha: 1, imageSmoothingEnabled: false, globalCompositeOperation: 'source-over', fillStyle: '',
        current_sy: 0, save: () => calls.push('save'), restore: () => calls.push('restore'), translate: noop, setTransform: noop, clearRect: noop,
        beginPath: noop, rect: noop, clip: noop, arc: noop, fill: noop, putImageData: noop,
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }),
        fillRect(...rect) { calls.push({ fill: rect, op: this.globalCompositeOperation }); },
        drawImage(...args) { calls.push({ draw: args, op: this.globalCompositeOperation, alpha: this.globalAlpha }); } };
}
const document = { hidden: false, createElement() {
    const canvas = { width: 0, height: 0, dataset: {}, style: {} };
    const ctx = context(canvas); canvas.getContext = () => ctx;
    return canvas;
} };
const shading = () => load('static/scripts/figure-shading.js', { 'light-field-sampling': sampling, 'weighted-cache': weighted }, { document });

test('light gathers into one direction and colour, and blocked sources add nothing', () => {
    const figures = shading(), torch = { x: 3, y: 0, radius: 6, strength: .2, colour: [255, 180, 100] };
    assert.equal(figures.gather([], 0, 0), null); assert.equal(figures.gather(undefined, 0, 0), null);
    const one = figures.gather([torch], 0, 0);
    assert.equal(one.x, 1); assert.equal(one.y, 0); assert.equal(one.focus, 1); assert.deepEqual(Array.from(one.colour), [255, 180, 100]);
    const opposed = figures.gather([torch, { ...torch, x: -3 }], 0, 0);
    assert(opposed.focus < .001 && opposed.energy > one.energy, 'balanced sources wash evenly with no rim direction');
    assert.equal(figures.gather([{ ...torch, visibility: new Array(9).fill(0) }], 0, 0), null, 'occluded light never reaches a figure');
    const mixed = figures.gather([torch, { ...torch, x: 0, y: 2, colour: [0, 100, 255] }], 0, 0);
    assert(mixed.x > 0 && mixed.y > 0 && mixed.colour[2] > 100, 'nearby sources blend their direction and hue');
    assert.equal(figures.gather([{ ...torch, x: 0 }], 0, 0).focus, 0, 'a source on the same tile gives no direction');
});

test('ground shadows stay inside their own tile and restore drawing state', () => {
    const figures = shading(), size = { width: 64, height: 64 };
    for (const posture of ['standing', 'hovering', 'resting', undefined]) for (let angle = 0; angle < 16; angle++) for (const energy of [.01, .2, 2]) {
        const ctx = context({}), light = { energy, focus: 1, x: Math.cos(angle * Math.PI / 8), y: Math.sin(angle * Math.PI / 8) };
        ctx.globalAlpha = .7;
        figures.shadow(ctx, 128, 64, size, light, posture);
        const [, x, y, w, h] = ctx.calls.find(call => call.draw).draw;
        assert(x >= 128 && y >= 64 && x + w <= 192 + 1e-9 && y + h <= 128 + 1e-9, 'a neighbour repaint can never leave residue');
        assert.equal(ctx.globalAlpha, .7); assert.equal(ctx.imageSmoothingEnabled, false);
    }
});

test('dressed figures draw once at the native position, then come from the retained sprite', () => {
    const figures = shading().create(), size = { width: 64, height: 64 };
    const main = context({}), view = { ctx: main, current_sy: 0, current_left_overlap: 0 };
    let paints = 0;
    const paint = () => { paints++; assert.notEqual(view.ctx, main, 'native paint is redirected'); view.current_sy = -16; view.current_left_overlap = -2; };
    const light = { energy: .1, focus: 1, x: 1, y: 0, colour: [255, 180, 100] };
    assert.equal(figures.dress(view, 128, 64, size, paint, light, 'orc'), true);
    assert.equal(view.ctx, main); assert.equal(paints, 1);
    assert.equal(view.current_sy, -16, 'tall sprites keep native overlap bookkeeping'); assert.equal(view.current_left_overlap, -2);
    const first = main.calls.find(call => call.draw).draw;
    assert.deepEqual([first[1], first[2]], [96, 0], 'the retained picture sits where the native sprite would');
    view.current_sy = view.current_left_overlap = 0;
    assert.equal(figures.dress(view, 256, 64, size, paint, light, 'orc'), true);
    assert.equal(paints, 1, 'an identical figure in identical light needs no repaint');
    assert.equal(view.current_sy, -16, 'a retained sprite replays its overlap');
    figures.dress(view, 256, 64, size, paint, { ...light, x: -1 }, 'orc'); assert.equal(paints, 2, 'new light needs a new picture');
    figures.dress(view, 256, 64, size, paint, light, 'orc'); assert.equal(paints, 2);
    figures.dress(view, 256, 64, size, paint, light, undefined); figures.dress(view, 256, 64, size, paint, light, undefined);
    assert.equal(paints, 4, 'a figure without a stable identity is never retained');
    view.current_sy = view.current_left_overlap = 0;
    figures.dress(view, 256, 64, size, paint, light, undefined);
    assert.equal(view.current_sy, -16, 'an unretained sprite still reports its overlap');
    assert.equal(view.current_left_overlap, -2);
    assert(figures.portrait(size, light, 'orc'), 'reflections reuse the retained picture');
    assert.equal(figures.portrait(size, light, 'elf'), null); assert.equal(figures.portrait(size, light, undefined), null);
    figures.clear(); assert.equal(figures.stats().entries, 0);
    assert.throws(() => figures.dress(view, 0, 0, size, () => { throw Error('boom'); }, null, 'bad'), /boom/);
    assert.equal(view.ctx, main, 'a failed sprite cannot strand the renderer on the scratch layer');
});

test('rim light stays on the figure and only faces the source', () => {
    const figures = shading().create(), size = { width: 32, height: 32 };
    const main = context({}), view = { ctx: main, current_sy: 0, current_left_overlap: 0 };
    let scratch;
    figures.dress(view, 0, 0, size, () => { scratch = view.ctx; }, { energy: .2, focus: 1, x: 0, y: -1, colour: [255, 0, 0] }, 'lit');
    const ops = scratch.calls.filter(call => call.op).map(call => call.op);
    assert(ops.includes('lighter') && ops.includes('source-atop'));
    assert(!scratch.calls.some(call => call.fill && call.op === 'source-over'), 'nothing is painted outside native alpha');
    const dim = context({}), other = { ctx: dim, current_sy: 0, current_left_overlap: 0 };
    let unlit;
    figures.dress(other, 0, 0, size, () => { unlit = other.ctx; }, null, 'dark');
    assert(!unlit.calls.slice(unlit.calls.length - 2).some(call => call.op === 'lighter'), 'no source means no rim');
});

test('reflections are masked to the liquid and fade with depth', () => {
    const figures = shading().create(), size = { width: 32, height: 32 }, target = context({});
    const picture = { canvas: { width: 64, height: 64 } }, mask = { id: 'mask' };
    assert.equal(figures.reflect(target, 96, 32, size, picture, mask, 7, 0), true);
    const [water, x, y] = target.calls.find(call => call.draw).draw;
    assert.deepEqual([x, y], [96, 32]);
    const calls = water.getContext('2d').calls, rows = calls.filter(call => call.draw && call.draw[0] === picture.canvas);
    assert(rows.length >= 15);
    assert(rows[0].alpha > rows.at(-1).alpha, 'the image fades toward the far edge');
    assert.equal(rows[0].draw[6], 7, 'the mirror starts at the waterline');
    assert(calls.some(call => call.draw && call.draw[0] === mask && call.op === 'destination-in'), 'a bank never shows a reflection');
});

function figureAdapter(flags = ['figures', 'reflections']) {
    const enabled = new Set(flags), mapping = new Map(), shaders = [], painters = [];
    const shared = { gather: () => ({ energy: .1, focus: 1, x: 1, y: 0, colour: [255, 200, 120] }), shadows: [],
        shadow(ctx, x, y, size, light, posture) { this.shadows.push(posture); },
        create: () => ({ dress(view, x, y, size, paint) { paint(); return true; }, portrait: () => null, reflect: noop, clear: noop }) };
    const module = load('game_data/static/premium-figures.js', {
        jquery: () => ({ on() { return this; } }),
        './cell-renderer-layers': { addActorShader: fn => shaders.push(fn), addTerrainPainter: fn => painters.push(fn) },
        './map_knowledge': { get: (x, y) => mapping.get(x + ':' + y) || {} },
        './options': { ready: () => true, get: key => key === 'tile_display_mode' ? 'tiles' : true },
        './game-context': { get_ui_state: () => 0 },
        './enums': { ui: { NORMAL: 0 }, prepare_bg_flags: value => value && value.bg ? value.bg : { UNSEEN: value === 'unseen' }, prepare_fg_flags: value => value || {} },
        './premium-light-field': { forView: () => ({ at: () => [] }) },
        './premium-terrain-model': { describe: entry => entry.own === undefined ? {} : entry.own },
        './premium-terrain': { snapshot: () => null },
        'visual-presentation': { enabled: key => enabled.has(key), animated: () => true },
        'figure-shading': shared, './shell-animation': { posed: () => false }, 'shore-field': { surface: noop }
    }, { window: { matchMedia: () => ({ matches: false }) }, JSON, document: {} });
    return { module, shared, enabled, shader: shaders[0], reflect: painters[0], mapping };
}
const renderer = { view: {}, ctx: {}, scaled_size: () => ({ width: 32, height: 32 }) };

test('the creature shader leaves native painting alone whenever it does not apply', () => {
    const { shader, enabled, shared } = figureAdapter(), paint = noop, figure = { mon: { id: 1 }, t: { fg: { value: 9 } } };
    assert.notEqual(shader(renderer, 0, 0, 0, 0, figure, paint), paint);
    assert.equal(shader(renderer, 0, 0, 0, 0, figure, paint, false), paint, 'an empty half of a native paint stays empty');
    assert.equal(shader(renderer, 0, 0, 0, 0, {}, paint), paint);
    assert.equal(shader(renderer, 0, 0, 0, 0, { ...figure, t: { bg: 'unseen' } }, paint), paint, 'remembered cells keep native art');
    assert.equal(shader(renderer, 0, 0, 0, 0, { ...figure, own: { solid: true } }, paint), paint, 'creatures in walls keep native art');
    assert.equal(shader(renderer, 0, 0, 0, 0, { ...figure, own: null }, paint), paint);
    enabled.delete('figures');
    assert.equal(shader(renderer, 0, 0, 0, 0, figure, paint), paint, 'Classic and a disabled switch restore native painting');
    assert.equal(shared.shadows.length, 0);
});

test('figures rest, stand or hover on their surface, and never cast a shadow on liquid', () => {
    const { shader, shared } = figureAdapter();
    const run = entry => { shared.shadows.length = 0; shader(renderer, 0, 0, 0, 0, entry, noop)(); return [...shared.shadows]; };
    assert.deepEqual(run({ t: { fg: { value: 3 } } }), ['resting'], 'floor items cast a small shadow');
    assert.deepEqual(run({ mon: { id: 2 }, t: { fg: { value: 9 } } }), ['standing']);
    assert.deepEqual(run({ mon: { id: 2 }, t: { fg: { value: 9, FLYING: true } } }), ['hovering']);
    assert.deepEqual(run({ t: { fg: { value: 9 }, doll: [[1, 32]] } }), ['standing'], 'heroes are figures');
    assert.deepEqual(run({ mon: { id: 2 }, own: { surface: 'water' }, t: { fg: { value: 9 } } }), [], 'waders have no ground to shade');
    assert.deepEqual(run({ mon: { id: 2 }, own: { surface: 'lava' }, t: { fg: { value: 9 } } }), []);
    assert.deepEqual(run({ mon: { id: 2 }, own: { surface: 'water' }, t: { fg: { value: 9, FLYING: true } } }), ['hovering']);
});

test('lantern pools add light only through the visibility mask and keep monsters legible', () => {
    const pools = load('static/scripts/lantern-pool.js', {}, { document });
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 64;
    const ctx = canvas.getContext(), style = { shade: .36, inner: 1, outer: 8, warmth: 5, glow: 'rgba(255,186,112', intensity: .1 };
    const mask = { id: 'mask' };
    pools.paint(ctx, { pools: [{ x: 5, y: 4 }], clear: [{ x: 1, y: 1 }, { x: 8, y: 6 }], mask }, 8, style);
    const fills = ctx.calls.filter(call => call.fill);
    assert.equal(fills[0].op, 'source-over'); assert.deepEqual(fills[0].fill, [0, 0, 80, 64]);
    assert.equal(fills.filter(call => call.op === 'destination-out').length, 3, 'one pool and two legible monsters');
    const composite = ctx.calls.find(call => call.draw);
    assert.equal(composite.op, 'lighter');
    assert(composite.draw[0].getContext().calls.some(call => call.draw && call.draw[0] === mask && call.op === 'destination-in'), 'unknown space stays unlit');
    assert.equal(ctx.globalCompositeOperation, 'source-over');
});

const motes = load('static/scripts/ambient-motes.js', {}, {});
const grid = (x, y, w, h) => { const cells = []; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells.push({ x: i, y: j }); return cells; };

test('motes are a pure function of their home cell and the clock', () => {
    const cells = grid(-20, -20, 60, 60);
    const first = motes.scatter(cells, 'snow');
    assert(first.length > 100 && first.length < cells.length, 'only some cells keep a mote');
    assert.equal(JSON.stringify(motes.scatter([...cells].reverse(), 'snow').reverse()), JSON.stringify(first), 'the same cells are chosen in any order');
    assert.equal(motes.scatter(cells, 'nothing').length, 0);
    const trace = origin => { const out = [];
        const ctx = { ...context({}), arc(x, y) { out.push([x + origin.x * 24, y + origin.y * 24, this.globalAlpha]); } };
        motes.paint(ctx, first, 'snow', 24, origin, 12.5); return out; };
    const here = trace({ x: 0, y: 0 }), there = trace({ x: 7, y: -3 });
    assert.equal(here.length, first.length);
    here.forEach((mote, index) => mote.forEach((value, axis) => assert(Math.abs(value - there[index][axis]) < 1e-6, 'panning neither moves nor restarts a mote')));
    assert.notDeepEqual(trace({ x: 0, y: 0 }), (() => { const out = [];
        motes.paint({ ...context({}), arc(x, y) { out.push([x, y, this.globalAlpha]); } }, first, 'snow', 24, { x: 0, y: 0 }, 13); return out; })(), 'time moves them');
});

test('motes never drift over closed or unknown ground, and every kind is complete', () => {
    const list = motes.scatter(grid(0, 0, 30, 30), 'embers'), seen = [];
    const drawn = motes.paint(context({}), list, 'embers', 24, { x: 0, y: 0 }, 3, (x, y) => { seen.push([x, y]); return x < 10; });
    assert(seen.length === list.length && drawn < list.length && drawn > 0);
    assert.equal(motes.paint(context({}), list, 'embers', 24, { x: 0, y: 0 }, 3, () => false), 0);
    assert.equal(motes.paint(context({}), list, 'unknown', 24, { x: 0, y: 0 }, 3), 0);
    for (const [name, style] of Object.entries(motes.kinds)) {
        assert(/^\d+,\d+,\d+$/.test(style.colour), name); assert(style.share > 0 && style.share < 1, name);
        assert(style.alpha > 0 && style.alpha <= 1 && style.size > 0, name);
    }
});

function viewLayer(flags) {
    const handlers = new Map(), frames = [], timers = [], listeners = [], state = { hidden: false, reduced: false, ...flags };
    const created = [];
    const doc = { get hidden() { return state.hidden; }, createElement() {
        const canvas = { dataset: {}, style: {}, setAttribute: noop, remove() { canvas.removed = true; }, getContext: () => ({ canvas }) };
        created.push(canvas); return canvas;
    } };
    const element = { style: { width: '100px', height: '80px', left: '0px', top: '0px' }, isConnected: true, parentElement: { id: 'dungeon_viewport', appendChild: noop } };
    const jquery = target => ({ on(events, fn) { if (target === doc) events.split(' ').forEach(name => handlers.set(name, fn)); return this; } });
    const module = load('game_data/static/premium-view-layer.js', { jquery, './dungeon_renderer': { element, cols: 10, rows: 8, ui_state: 0 },
        './options': { ready: () => true, get: key => key === 'tile_display_mode' ? 'tiles' : true, add_listener: fn => listeners.push(fn) },
        './enums': { ui: { NORMAL: 0 } }, 'visual-presentation': { animated: () => !state.reduced } },
    { document: doc, window: { matchMedia: () => ({ matches: false, addEventListener: noop }), requestAnimationFrame: fn => frames.push(fn), cancelAnimationFrame: id => { frames[id - 1] = null; },
        setTimeout: fn => timers.push(fn), clearTimeout: id => { timers[id - 1] = null; } } });
    return { module, handlers, frames, timers, created, state, element };
}

test('a view layer lives only with an allowed game and stops when it is hidden or still', () => {
    const fixture = viewLayer(), painted = [];
    let allowed = true;
    const layer = fixture.module.create({ name: 'test', className: 'test-layer', resolution: 8, cadence: 90, allowed: () => allowed,
        paint(ctx, scale, now, moving) { painted.push({ scale, moving }); return true; } });
    layer.invalidate();
    assert.equal(fixture.frames.length, 0, 'nothing runs before a game starts');
    fixture.handlers.get('game_init.test')();
    fixture.frames.splice(0).forEach(frame => frame && frame(0));
    assert.equal(fixture.created.length, 1); assert.equal(fixture.created[0].width, 80); assert.equal(fixture.created[0].height, 64);
    assert.deepEqual(painted[0], { scale: 8, moving: true }); assert.equal(fixture.timers.length, 1, 'animated layers schedule their next frame');
    fixture.state.reduced = true; layer.invalidate();
    fixture.frames.splice(0).forEach(frame => frame && frame(0));
    assert.equal(painted[1].moving, false, 'reduced motion paints a still frame');
    fixture.element.style.width = '200px'; fixture.handlers.get('dungeon_tiles_changed.test')();
    fixture.frames.splice(0).forEach(frame => frame && frame(0));
    assert.equal(fixture.created[0].style.width, '200px', 'a resized viewport moves even a still layer');
    fixture.handlers.get('dungeon_tiles_changed.test')();
    assert.equal(fixture.frames.filter(Boolean).length, 0, 'ordinary tile repaints never redraw the layer');
    assert.equal(fixture.timers.filter(Boolean).length, 0, 'a still frame schedules nothing');
    allowed = false; layer.invalidate();
    assert(fixture.created[0].removed, 'a disabled effect removes its canvas');
    allowed = true; fixture.state.hidden = true; layer.invalidate();
    assert.equal(fixture.frames.filter(Boolean).length, 0, 'hidden pages do no work');
    fixture.state.hidden = false; layer.invalidate();
    fixture.handlers.get('game_cleanup.test')(); layer.invalidate();
    assert.equal(fixture.frames.filter(Boolean).length, 0, 'cleanup stops the layer for good');
});

test('every branch mood names a real kind of mote and a valid wash', () => {
    const atmosphere = load('game_data/static/premium-atmosphere.js', { jquery: () => ({ on() { return this; } }), './map_knowledge': {}, './player': { place: 'Geh' },
        './premium-terrain-model': {}, './premium-view-layer': { create: () => ({}) }, 'visual-presentation': {}, 'ambient-motes': motes }, { document: {} });
    assert.equal(atmosphere.mood()[0], 'embers');
    for (const [place, mood] of Object.entries(atmosphere.moods)) {
        assert(motes.kinds[mood[0]], place);
        assert([1, 5].includes(mood.length), place);
        if (mood.length === 5) { assert(mood.slice(1, 4).every(value => value >= 0 && value <= 255), place); assert(mood[4] > 0 && mood[4] < .4, place); }
    }
    const missing = load('game_data/static/premium-atmosphere.js', { jquery: () => ({ on() { return this; } }), './map_knowledge': {}, './player': { place: 'Elsewhere' },
        './premium-terrain-model': {}, './premium-view-layer': { create: () => ({}) }, 'visual-presentation': {}, 'ambient-motes': motes }, { document: {} });
    assert.equal(missing.mood()[0], 'dust', 'an unknown place falls back to plain dungeon air');
});
