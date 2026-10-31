const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}, globals = {}) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
        ...globals, define(names, factory) { result = factory(...names.map(name => dependencies[name])); }
    });
    return result;
}
const lighting = load('static/scripts/tile-lighting.js');
const emitter = { radius: 6, colour: [255, 165, 73], strength: .19 };
function scene(overrides = {}, view = { x: 0, y: 0, cols: 7, rows: 7 }) {
    return lighting.create(view, (x, y) => ({ visible: true, ...overrides[`${x}:${y}`] }));
}
const receives = (light, x, y) => light.receivers.some(cell => cell.x === x && cell.y === y);

test('hidden cells emit no light and cannot receive light or create contact shadows', () => {
    const result = scene({ '1:1': { light: emitter }, '2:2': { visible: false, light: emitter, solid: true },
        '4:3': { visible: false }, '5:4': { visible: false, solid: true } });
    assert.equal(result.lights.length, 1);
    assert(!result.cells.some(cell => cell.x === 2 && cell.y === 2));
    assert(!receives(result.lights[0], 2, 2));
    assert(!receives(result.lights[0], 3, 3), 'unknown space blocks rays');
    assert.equal(result.floors.find(cell => cell.x === 5 && cell.y === 5).north, false);
});

test('walls and diagonal corners block rays; wall torches still illuminate adjacent floors', () => {
    const walls = Object.fromEntries(Array.from({ length: 7 }, (_, y) => [`3:${y}`, { solid: true }]));
    let result = scene({ ...walls, '1:3': { light: emitter } });
    assert(receives(result.lights[0], 2, 3));
    assert(!receives(result.lights[0], 4, 3));
    result = scene({ '1:1': { light: emitter }, '2:1': { solid: true }, '1:2': { solid: true } });
    assert(!receives(result.lights[0], 2, 2));
    result = scene({ '1:1': { light: emitter, solid: true } });
    assert(receives(result.lights[0], 2, 1));
    assert.equal(result.floors.find(cell => cell.x === 1 && cell.y === 2).north, true);
    result = scene({ '0:0': { solid: true }, '1:0': { solid: true, light: emitter }, '2:0': { solid: true } });
    assert(receives(result.lights[0], 2, 1), 'an exposed wall face spreads light across the adjacent floor');
    assert(receives(result.lights[0], 0, 0), 'adjacent visible wall artwork receives light at its exposed face');
});

test('scene is viewport bounded, source capped, density normalized, and does not mutate input', () => {
    const input = Object.freeze({ visible: true, light: Object.freeze({ ...emitter }) });
    let reads = 0;
    const result = lighting.create({ x: 20, y: 30, cols: 40, rows: 25 }, (x, y) => {
        assert(x >= 20 && x < 60 && y >= 30 && y < 55); reads++; return input;
    });
    assert.equal(reads, 1000);
    assert.equal(result.lights.length, 24);
    assert(result.lights.every(light => light.strength < emitter.strength));
    assert.equal(input.light.strength, .19);
    assert.equal(input.visible, true);
    assert(!Object.hasOwn(input, 'x'));
});

// Account persistence and identity boundaries live in graphics-preferences.test.cjs.

function overlayFixture() {
    const callbacks = {}, frames = new Map(), timers = new Map(), canvases = [];
    let serial = 0, enabled = true, ready = true;
    const motion = { matches: false, addEventListener(name, fn) { this.change = fn; } };
    const document = { hidden: false, getElementById: () => null,
        createElement() { return { style: {}, dataset: {}, setAttribute() {},
            getContext: () => ({ clearRect() {} }),
            remove() { const index = canvases.indexOf(this); if (index >= 0) canvases.splice(index, 1); } }; } };
    const window = { matchMedia: () => motion,
        requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); } };
    const viewport = { id: 'dungeon_viewport', appendChild: canvas => canvases.push(canvas) };
    const renderer = { view: { x: 0, y: 0 }, cols: 3, rows: 3, ui_state: 0,
        element: { isConnected: true, width: 192, height: 192, style: { left: '-12px', top: '-12px',
            width: '96px', height: '96px' }, parentElement: viewport },
        canvas_coords(x, y) { return { x: (x - this.view.x) * 64, y: (y - this.view.y) * 64, width: 64, height: 64 }; } };
    const settings = { tile_display_mode: 'tiles', tile_realtime_anim: true };
    let builds = 0, painted;
    const dependencies = { jquery: () => ({ on(names, fn) {
        names.split(' ').forEach(name => { callbacks[name.split('.')[0]] = fn; }); return this;
    } }), './dungeon_renderer': renderer, './map_knowledge': {}, './tileinfo-dngn': {},
        './options': { ready: () => ready, get: key => settings[key], add_listener: fn => { callbacks.options = fn; } },
        './enums': { ui: { NORMAL: 0 } }, 'visual-presentation': { premium: () => enabled, enabled: () => enabled, animated: () => true },
        './premium-light-field': { animate: () => [], forView: () => { builds++; return { cells: [], floors: [], lights: [{}] }; } },
        'tile-lighting-paint': { paint(ctx, scene, coords, now, animated) { painted = { point: coords(2, 2), animated }; } } };
    load('game_data/static/premium-dungeon.js', dependencies, { document, window });
    return { callbacks, frames, timers, canvases, motion, document, renderer, settings,
        enable(value) { enabled = value; callbacks.visual_presentation_changed(); },
        ready(value) { ready = value; callbacks.options(); },
        paint() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(100)); return painted; },
        builds: () => builds };
}

test('overlay tracks camera/backing pixels, caches scenes, and cancels classic/hidden/disconnected work', () => {
    const f = overlayFixture();
    f.callbacks.game_init(); f.callbacks.map_knowledge_changed(); f.paint();
    assert.equal(f.canvases[0].width, 192);
    assert.equal(f.canvases[0].style.width, '96px');
    assert.equal(f.canvases[0].style.left, '-12px');
    assert.equal(f.builds(), 1);
    [...f.timers.values()][0](); f.timers.clear(); f.paint();
    assert.equal(f.builds(), 1, 'ambient frames reuse geometry');
    f.renderer.view.x = 1; f.callbacks.game_camera_changed();
    assert.equal(f.paint().point.x, 64);
    assert.equal(f.builds(), 2);
    f.enable(false); assert.equal(f.canvases.length, 0); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
    f.enable(true); f.paint(); f.document.hidden = true; f.callbacks.visibilitychange();
    assert.equal(f.canvases.length, 0); assert.equal(f.timers.size, 0);
    f.document.hidden = false; f.callbacks.visibilitychange(); f.paint();
    f.callbacks.game_connection_lost(); assert.equal(f.canvases.length, 0); assert.equal(f.frames.size, 0);
});

test('reduced motion and native animation preference keep static light without an idle loop; map/glyph modes stay clean', () => {
    const f = overlayFixture(); f.motion.matches = true;
    f.callbacks.game_init(); f.callbacks.map_knowledge_changed();
    assert.equal(f.paint().animated, false); assert.equal(f.timers.size, 0);
    f.motion.matches = false; f.settings.tile_realtime_anim = false; f.callbacks.options();
    assert.equal(f.paint().animated, false); assert.equal(f.timers.size, 0);
    f.renderer.ui_state = 2; f.callbacks.game_ui_changed(); assert.equal(f.canvases.length, 0);
    f.renderer.ui_state = 0; f.settings.tile_display_mode = 'glyphs'; f.callbacks.options();
    assert.equal(f.frames.size, 0);
    f.settings.tile_display_mode = 'tiles'; f.ready(false); assert.equal(f.frames.size, 0);
    f.ready(true); f.paint(); f.callbacks.game_cleanup();
    assert.equal(f.canvases.length, 0); assert.equal(f.timers.size, 0);
});
