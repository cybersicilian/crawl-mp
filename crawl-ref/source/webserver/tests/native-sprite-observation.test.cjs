const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture({ fail = false, inherited = false, wrongCanvas = false } = {}) {
    const canvas = {}, raw = {}, detail = { width: 128, height: 112 }, unused = { width: 96, height: 96 };
    const operations = { drawImage() {} };
    const ctx = inherited ? Object.assign(Object.create(operations), { canvas }) : { canvas, ...operations };
    const art = { tile(atlas, index) { return index === 1 ? detail : index === 2 ? unused : null; } };
    const originals = { draw: ctx.drawImage, tile: art.tile };
    const renderer = { ctx, render_view() {
        ctx.drawImage(raw, 0, 0, 32, 32);
        art.tile('feat', 2); // A prepared source that never reaches the dungeon is not a draw.
        art.tile('feat', 3); // A mapped sheet is still pending.
        art.tile('feat', 999); // Unmapped native tiles are not authored replacements.
        ctx.drawImage(art.tile('player', 1), 0, 0, 128, 112);
        ctx.drawImage(art.tile('player', 1), 0, 16, 128, 96);
        if (fail) throw new Error('Native repaint failed');
    } };
    const modules = { dungeon_renderer: renderer, 'tile-art-direction': art, 'environment-sprites': {
        feat: [{ tile: 2, sheet: 'woodland', w: 24, h: 24 }],
        dungeon: [{ tile: 3, sheet: 'thresholds', w: 32, h: 32 }],
        player: [{ tile: 1, sheet: 'equipment', w: 32, h: 28 }]
    } };
    const require = name => modules[name.split('/').at(-1)];
    require.s = { contexts: { _: { defined: Object.fromEntries(Object.keys(modules).map(name => ['game/' + name, true])) } } };
    const context = { require, module: { exports: {} }, document: { getElementById: () => wrongCanvas ? {} : canvas } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'helpers/native-sprite-observation.cjs'), 'utf8'), context);
    return { run: context.module.exports.observeNativeSprites, ctx, art, originals };
}

test('native sprite observer counts actual detailed dungeon draws, including clipping', () => {
    const f = fixture(), result = f.run();
    assert.equal(result.entries.length, 1);
    const entry = result.entries[0];
    assert.equal(entry.atlas, 'player'); assert.equal(entry.sheet, 'equipment');
    assert.equal(entry.draws, 2); assert.equal(entry.clippedDraws, 1);
    assert.equal(entry.sourceWidth, entry.nativeWidth * 4);
    assert.equal(entry.sourceHeight, entry.nativeHeight * 4);
    assert.equal(result.pendingTileCalls, 1); assert.equal(result.unmappedTileCalls, 1);
    assert(result.observerRestored); assert.equal(f.ctx.drawImage, f.originals.draw); assert.equal(f.art.tile, f.originals.tile);
});

test('native sprite observer restores instrumentation after a repaint exception', () => {
    const f = fixture({ fail: true });
    assert.throws(f.run, /Native repaint failed/);
    assert.equal(f.ctx.drawImage, f.originals.draw); assert.equal(f.art.tile, f.originals.tile);
});

test('native sprite observer preserves inherited methods and rejects another canvas', () => {
    const f = fixture({ inherited: true }); f.run();
    assert(!Object.hasOwn(f.ctx, 'drawImage')); assert.equal(f.ctx.drawImage, f.originals.draw);
    const other = fixture({ wrongCanvas: true });
    assert.throws(other.run, /dungeon context/); assert.equal(other.art.tile, other.originals.tile);
});
