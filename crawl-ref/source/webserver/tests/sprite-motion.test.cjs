const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function load(file, deps = {}, globals = {}) {
    let value;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
        ...globals, define(names, factory) { value = factory(...names.map(name => deps[name])); }
    });
    return value;
}
const motion = load('static/scripts/sprite-motion.js');
const actor = (x, y = 1, extra = {}) => ({ key: 'hero:0', x, y, identity: 'hero', ...extra });
test('initial snapshots, teleports, changed identities and unavailable paths snap without walking', () => {
    const tracker = motion.create();
    assert.equal(tracker.update([actor(1)], 0, () => true).length, 0);
    assert.equal(tracker.update([actor(5)], 10, () => true).length, 0);
    assert.equal(tracker.update([actor(6, 1, { identity: 'replacement' })], 20, () => true).length, 0);
    assert.equal(tracker.update([actor(7, 1, { identity: 'replacement' })], 30, () => false).length, 0);
    assert.equal(tracker.poses.size, 0);
});
test('adjacent steps glide, lift, settle and reach the exact confirmed position', () => {
    const tracker = motion.create(); tracker.update([actor(1)], 0, () => true);
    const pose = tracker.update([actor(2)], 10, () => true)[0];
    const early = tracker.sample(pose, 45), landing = tracker.sample(pose, 155), final = tracker.sample(pose, 180);
    assert(early.x > 1 && early.x < 2 && early.lift > 0);
    assert(landing.squash > 0);
    assert.equal(final.x, 2); assert.equal(final.y, 1); assert.equal(final.done, true);
    assert(Math.abs(final.lift) < 1e-9 && Math.abs(final.squash) < 1e-9);
});
test('rapid updates retarget the displayed pose without queueing or a position jump', () => {
    const tracker = motion.create(); tracker.update([actor(1)], 0, () => true);
    const first = tracker.update([actor(2)], 10, () => true)[0], before = tracker.sample(first, 45);
    const next = tracker.update([actor(3)], 45, () => true)[0], after = tracker.sample(next, 45);
    assert.equal(before.x, after.x); assert.equal(before.y, after.y);
    assert.equal(tracker.poses.size, 1);
    tracker.update([], 50, () => true); assert.equal(tracker.poses.size, 0);
    tracker.reset(); assert.equal(tracker.update([actor(4)], 60, () => true).length, 0);
});
test('native actor hooks leave status icons in their original pass and can be removed', () => {
    const calls = [], $ = { each: (items, fn) => items.forEach((item, i) => fn(i, item)) };
    const layers = load('game_data/static/cell-renderer-layers.js', { jquery: $,
        './tileinfo-main': { MAIN_MAX: 100, PARCHMENT_LOW: 80, PARCHMENT_HIGH: 90 }, './tileinfo-icons': { TRAP_NET: 8 },
        './tileinfo-dngn': {}, './enums': {}, './options': { get: () => 'tiles' },
        './terrain-edges': {}, './environment-ground': {} });
    let capture = false;
    const remove = layers.addActorPainter((renderer, cx, cy, x, y, cell, paint) => {
        capture = true; paint(); capture = false; return true;
    });
    const renderer = { draw_main: () => calls.push(capture ? 'moving-sprite' : 'native-sprite'),
        draw_icon: () => calls.push(capture ? 'moving-icon' : 'native-icon') };
    const cell = { x: 2, y: 1, t: { bg: {}, fg: { value: 10, NET: true }, icons: [] } };
    layers.methods.draw_foreground.call(renderer, 64, 32, cell);
    assert.deepEqual(calls, ['moving-sprite', 'native-icon']);
    remove(); calls.length = 0; layers.methods.draw_foreground.call(renderer, 64, 32, cell);
    assert.deepEqual(calls, ['native-sprite', 'native-icon']);
});

test('sprite capture restores the native context, tracks scale and returns the actor before removing its overlay', () => {
    const tracker = motion.create(), frames = new Map(), canvases = [], calls = [], dirty = [];
    let serial = 0, enabled = true;
    function context(name) { return { globalAlpha: 1, save() {}, restore() {}, translate() {}, scale() {},
        clearRect() {}, beginPath() {}, rect() {}, clip() {}, drawImage() { calls.push(name); } }; }
    const document = { body: { appendChild(canvas) { canvases.push(canvas); } }, createElement() {
        const canvas = { style: {}, dataset: {}, setAttribute() {}, remove() { canvases.splice(canvases.indexOf(this), 1); } };
        const ctx = context('captured'); canvas.getContext = () => ctx; return canvas;
    } };
    const window = { performance: { now: () => 20 }, requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; },
        cancelAnimationFrame(id) { frames.delete(id); } };
    const renderer = { ctx: context('native'), frame_time: 10, scaled_size: () => ({ width: 32, height: 32 }),
        element: { isConnected: true, width: 96, height: 96, getBoundingClientRect: () => ({ left: 2, top: 3, width: 48, height: 48 }) },
        canvas_coords: (x, y) => ({ x: x * 32, y: y * 32, width: 32, height: 32 }) };
    const layer = load('static/scripts/sprite-motion-layer.js', {}, { document, window }).create({
        className: 'motion', poses: tracker.poses, sample: tracker.sample, allowed: () => enabled,
        visible: () => true, current: () => true, cells: () => [{ x: 1, y: 1 }], key: () => 'hero:0', redraw: pos => dirty.push(pos)
    });
    layer.attach(renderer); tracker.update([actor(0)], 0, () => true); tracker.update([actor(1)], 10, () => true);
    const original = renderer.ctx;
    assert.equal(layer.capture(renderer, 1, 1, 32, 32, {}, () => renderer.ctx.drawImage()), true);
    assert.equal(renderer.ctx, original); assert(!calls.includes('native'));
    assert.equal(canvases[0].style.pointerEvents, 'none'); assert.equal(canvases[0].style.width, '48px');
    const tick = time => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); };
    tick(200); assert.equal(dirty.length, 1); assert.equal(canvases.length, 1, 'hold the last sprite until native paint returns');
    layer.capture(renderer, 1, 1, 32, 32, {}, () => renderer.ctx.drawImage());
    assert(calls.includes('native')); assert.equal(canvases.length, 0); assert.equal(tracker.poses.size, 0);
    tracker.update([actor(2)], 210, () => true); layer.request(); enabled = false; tick(220);
    assert.equal(tracker.poses.size, 0); assert.equal(frames.size, 0); assert.equal(canvases.length, 0);
    enabled = true; tracker.update([actor(3)], 230, () => true); layer.request(); renderer.element.isConnected = false; tick(240);
    assert.equal(tracker.poses.size, 0); assert.equal(frames.size, 0);
});

test('native doll capture includes both submerged passes while cursors remain on the native canvas', () => {
    const calls = [], $ = () => ({ off() { return this; }, on() { return this; } });
    Object.assign($, { extend: Object.assign, toJSON: JSON.stringify,
        each: (items, fn) => items.forEach((item, index) => fn(index, item)) });
    const options = { get: () => 'tiles' }, main = { MAIN_MAX: 100 };
    const enums = { prepare_bg_flags: value => typeof value === 'object' ? value : { value },
        prepare_fg_flags: value => typeof value === 'object' ? value : { value } };
    const layers = load('game_data/static/cell-renderer-layers.js', { jquery: $, './tileinfo-main': main,
        './tileinfo-icons': {}, './tileinfo-dngn': {}, './enums': enums, './options': options,
        './terrain-edges': {}, './environment-ground': {} });
    function context(name) { const stack = []; return { name, globalAlpha: 1, fillRect() {},
        save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
        beginPath() {}, rect() {}, clip() { calls.push(['clip', name]); } }; }
    const original = context('native'), captured = context('captured');
    layers.addActorPainter((renderer, cx, cy, x, y, cell, paint) => {
        const previous = renderer.ctx; renderer.ctx = captured;
        try { paint(); } finally { renderer.ctx = previous; }
        return true;
    });
    const Cell = load('game_data/static/cell_renderer.js', { jquery: $, './view_data': {}, './tileinfo-main': main,
        './tileinfo-player': { MCACHE_START: 1000 }, './tileinfo-icons': {}, './tileinfo-dngn': {},
        './enums': enums, './map_knowledge': {}, './player': { pos: { x: 0, y: 0 } }, './options': options,
        './cell-renderer-glyphs': { methods: {} }, './cell-renderer-overlays': {}, './cell-renderer-layers': layers,
        './cell-renderer-textures': {}, './shell-animation': { draw: () => false } }, { document: {}, window: { devicePixelRatio: 1 } }).DungeonCellRenderer;
    const renderer = new Cell(); renderer.ctx = original; renderer.element = { width: 128, height: 128 };
    renderer.draw_background = () => {};
    renderer.draw_player = () => calls.push(['doll', renderer.ctx.name, renderer.ctx.globalAlpha]);
    renderer.render_cursors = () => calls.push(['cursor', renderer.ctx.name]);
    renderer.render_party_overlays = () => {};
    renderer.do_render_cell(2, 1, 64, 32, { x: 2, y: 1, t: { bg: { value: 20, WATER: true }, fg: 200, doll: [[5, 0]] } });
    assert.deepEqual(calls.filter(call => call[0] === 'doll'), [['doll', 'captured', 1], ['doll', 'captured', .3]]);
    assert.deepEqual(calls.filter(call => call[0] === 'clip'), [['clip', 'captured'], ['clip', 'captured']]);
    assert.deepEqual(calls.filter(call => call[0] === 'cursor'), [['cursor', 'native']]);
    assert.equal(renderer.ctx, original);
});
