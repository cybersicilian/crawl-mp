const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function fixture(fail = false, inherited = false, withSurface = false) {
    const originals = { floor: {}, wall: {} }, painted = { floor: {}, wall: {} }, canvas = {};
    const operations = { drawImage() {}, fillRect() {} };
    const ctx = inherited ? Object.assign(Object.create(operations), { canvas }) : { canvas, ...operations };
    const calls = { drawImage: ctx.drawImage, fillRect: ctx.fillRect };
    const borders = { draw(view) { view.ctx.fillRect(0, 0, 32, 1); } }; calls.border = borders.draw;
    const surface = { draw(view) { view.ctx.drawImage({}, 0, 0, 32, 32); return true; } }; calls.surface = surface.draw;
    const renderer = { ctx, view: { x: 0, y: 0 }, rows: 1, cols: 2, render_view() {
        ctx.drawImage(painted.floor, 16, 32, 32, 32, 0, 0, 32, 32);
        borders.draw(renderer, 0, 0, 0, 0);
        if (withSurface) surface.draw(renderer, 4, 0, 0, 0, 0);
        if (fail) throw new Error('Native repaint failed');
    } };
    const modules = { dungeon_renderer: renderer, 'terrain-edges': borders,
        'map_knowledge': { get: x => ({ t: { bg: x ? 8 : 4 } }), visible: () => true },
        'tile-art-direction': { image: id => painted[id] },
        'terrain-materials': { floor: [{ tile: 4, x: 16, y: 32 }], wall: [{ tile: 8, x: 64, y: 96 }] },
        'tileinfo-dngn': { get_img: idx => idx === 4 ? 'floor' : 'wall' },
        enums: { prepare_bg_flags: value => ({ value }) } };
    if (withSurface) modules['environment-ground'] = surface;
    const require = name => modules[name.split('/').at(-1)];
    require.s = { contexts: { _: { defined: Object.fromEntries(Object.keys(modules).map(name => ['game/' + name, true])) } } };
    const context = { require, module: { exports: {} }, document: { getElementById: id => id === 'dungeon' ? canvas : originals[id] },
        performance: { now: () => 1 }, Set, Object, Number };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'helpers/native-art-observation.cjs'), 'utf8'), context);
    return { run: context.module.exports.observeNativePaint, ctx, borders, surface, calls };
}
test('native observer distinguishes actual painted draws, visible cells and connected edge painting', () => {
    const f = fixture(), result = f.run();
    assert.equal(result.materialDraws.floor, 1); assert.equal(result.materialDraws.wall, 0);
    assert.equal(result.visibleMaterialCells.floor, 1); assert.equal(result.visibleMaterialCells.wall, 1);
    assert.equal(result.connectedBorderRectangles, 1); assert.equal(result.borderCallsWithNativeCoordinates, 1);
    assert(result.observerRestored); assert.equal(f.ctx.drawImage, f.calls.drawImage);
    assert.equal(f.ctx.fillRect, f.calls.fillRect); assert.equal(f.borders.draw, f.calls.border);
});
test('native observer restores all methods when the real renderer fails', () => {
    const f = fixture(true);
    assert.throws(f.run, /Native repaint failed/);
    assert.equal(f.ctx.drawImage, f.calls.drawImage); assert.equal(f.ctx.fillRect, f.calls.fillRect);
    assert.equal(f.borders.draw, f.calls.border);
});
test('native observer leaves inherited canvas methods on their original prototype', () => {
    const f = fixture(false, true); f.run();
    assert(!Object.hasOwn(f.ctx, 'drawImage')); assert(!Object.hasOwn(f.ctx, 'fillRect'));
    assert.equal(f.ctx.drawImage, f.calls.drawImage); assert.equal(f.ctx.fillRect, f.calls.fillRect);
});
test('native observer binds world-surface draws to the real dungeon context and restores its adapter', () => {
    const f = fixture(false, false, true), result = f.run();
    assert.equal(result.worldSurfaceDraws, 1); assert.equal(result.surfaceCallsWithNativeCoordinates, 1);
    assert.equal(result.materialDraws.floor, 2); assert.equal(f.surface.draw, f.calls.surface);
    const failed = fixture(true, false, true);
    assert.throws(failed.run, /Native repaint failed/); assert.equal(failed.surface.draw, failed.calls.surface);
    assert.equal(failed.ctx.drawImage, failed.calls.drawImage);
});
