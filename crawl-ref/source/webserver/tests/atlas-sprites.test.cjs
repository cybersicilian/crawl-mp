const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function fixture() {
    const canvases = [];
    const modules = {};
    const document = { createElement() {
        let lastDraw;
        const draws = [], clears = [], ctx = { draws, clears, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
            clearRect(...args) { clears.push(args); }, translate() {}, scale() {},
            drawImage(...args) { draws.push(args); lastDraw = args; },
            getImageData() {
                const image = lastDraw[0];
                if (image.unreadable) throw new Error('Unreadable optional sheet');
                if (lastDraw.length === 3) return { data: image.pixels };
                const data = new Uint8ClampedArray(canvas.width * canvas.height * 4), width = image.naturalWidth || image.width;
                for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) for (let c = 0; c < 4; c++)
                    data[(y * canvas.width + x) * 4 + c] = image.pixels[((lastDraw[2] + y) * width + lastDraw[1] + x) * 4 + c];
                return { data };
            } };
        const canvas = { width: 0, height: 0, ctx, getContext: () => ctx }; canvases.push(canvas); return canvas;
    } };
    for (const name of ['weighted-cache', 'atlas-sprites']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts', name + '.js'), 'utf8'), {
            document, define(deps, factory) { modules[name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    function sheet(src) {
        const pixels = new Uint8ClampedArray(8 * 8 * 4);
        for (let y = 1; y < 7; y++) for (let x = 2; x < 4; x++) pixels[(y * 8 + x) * 4 + 3] = 255;
        return { src, complete: true, naturalWidth: 8, naturalHeight: 8, pixels };
    }
    const region = (x = 0) => ({ x, y: 0, w: 8, h: 8, sprite: { x: 0, y: 0, w: 8, h: 8 } });
    return { engine: modules['atlas-sprites'].create(), canvases, sheet, region, source: { width: 32, height: 32 } };
}
test('authored body fitting can fill native geometry while ordinary sprites retain their aspect ratio', () => {
    const f = fixture(), sheet = f.sheet('one.png'), contain = f.region(), stretch = { ...f.region(), fit: 'stretch' };
    const first = f.engine.tile(sheet, contain), second = f.engine.tile(sheet, stretch);
    const a = first.ctx.draws.find(call => call.length === 9), b = second.ctx.draws.find(call => call.length === 9);
    assert.deepEqual(a.slice(1, 5), [2, 1, 2, 6]); assert.deepEqual(b.slice(1, 5), [2, 1, 2, 6]);
    assert(Math.abs(a[7] - 32 / 3) < .001); assert.equal(a[8], 32);
    assert.deepEqual(b.slice(5), [-16, -32, 32, 32]);
    assert.equal(f.engine.tile(sheet, stretch), second, 'prepared source is cached');
    sheet.src = 'two.png'; assert.notEqual(f.engine.tile(sheet, stretch), second, 'new source version invalidates prepared detail');
});
test('several sheets compose into one atlas, cache together and recover when deferred artwork becomes ready', () => {
    const f = fixture(), a = f.sheet('a.png'), b = f.sheet('b.png');
    const groups = [{ sheet: a, regions: [f.region()] }, { sheet: b, regions: [f.region(8)] }];
    const first = f.engine.imageGroups(f.source, groups);
    assert.equal(first.ctx.draws.length, 3); assert.equal(first.ctx.draws[0][0], f.source);
    assert.equal(first.ctx.draws[1][0], a); assert.equal(first.ctx.draws[2][0], b);
    assert.equal(f.canvases.filter(c => c.width === 32 && c.height === 32).length, 1, 'one full atlas allocation');
    assert.equal(f.engine.imageGroups(f.source, groups), first, 'group cache is stable');
    groups[1].sheet = null;
    const missing = f.engine.imageGroups(f.source, groups);
    assert.equal(missing.ctx.draws.length, 2); assert.equal(missing.ctx.draws[1][0], a);
    groups[1].sheet = b;
    const restored = f.engine.imageGroups(f.source, groups);
    assert.equal(restored.ctx.draws.length, 3); assert.notEqual(restored, missing);
});
test('unreadable or invalid optional sheets preserve valid artwork and never partially paint a group', () => {
    const f = fixture(), a = f.sheet('a.png'), b = f.sheet('b.png'); b.unreadable = true;
    const groups = [{ sheet: a, regions: [f.region()] }, { sheet: b, regions: [f.region(8)] }];
    const fallback = f.engine.imageGroups(f.source, groups);
    assert.equal(fallback.ctx.draws.length, 2); assert.equal(fallback.ctx.draws[1][0], a);
    b.unreadable = false; b.src = 'b-ready.png';
    assert.equal(f.engine.imageGroups(f.source, groups).ctx.draws.length, 3);
    const invalid = [{ sheet: a, regions: [f.region()] }, { sheet: b, regions: [f.region(8), f.region(40)] }];
    const result = f.engine.imageGroups(f.source, invalid);
    assert.equal(result.ctx.draws.length, 2, 'invalid group is rejected before its first replacement');
    assert.equal(result.ctx.draws[1][0], a);
    assert.equal(f.engine.imageGroups(f.source, [{ sheet: null, regions: [] }]), f.source);
});
test('the existing single-sheet API retains source fallback and cache identity', () => {
    const f = fixture(), sheet = f.sheet('a.png'), regions = [f.region()];
    const first = f.engine.image(f.source, sheet, regions);
    assert.equal(f.engine.image(f.source, sheet, regions), first);
    assert.equal(f.engine.image(f.source, null, regions), f.source);
    assert.equal(f.engine.image(f.source, sheet, [f.region(40)]), f.source);
});
test('small native alpha windows preserve attachment gaps at both atlas and detailed resolution', () => {
    const f = fixture(), art = f.sheet('authored.png'), native = f.sheet('native.png'); native.pixels.fill(255);
    for (let y = 3; y < 5; y++) for (let x = 2; x < 4; x++) native.pixels[(y * 8 + x) * 4 + 3] = 0;
    const region = { ...f.region(), preserveAlpha: { x: 0, y: 3, w: 8, h: 2 } };
    const detailed = f.engine.tile(art, region, native);
    assert.deepEqual(detailed.ctx.clears, [[0, 0, 32, 32], [8, 12, 8, 4], [8, 16, 8, 4]]);
    const atlas = f.engine.imageGroups(native, [{ sheet: art, regions: [region] }]);
    assert.deepEqual(atlas.ctx.clears, [[0, 0, 8, 8], [2, 3, 2, 1], [2, 4, 2, 1]]);
    const ordinary = f.region(), unmasked = f.engine.tile(art, ordinary);
    assert.equal(f.engine.tile(art, region, native), detailed, 'alternating masked/unmasked art does not flush the sheet cache');
    assert.equal(f.engine.tile(art, ordinary), unmasked);
    assert.equal(f.engine.tile(art, region, null), null, 'missing native mask falls back');
    assert(f.engine.tile(art, region, native), 'native image readiness restores detailed artwork');
    native.src = 'native-new.png'; native.pixels.fill(255);
    assert.deepEqual(f.engine.tile(art, region, native).ctx.clears, [[0, 0, 32, 32]], 'updated native geometry invalidates the mask');
});
test('separate native windows protect multiple attachments and reject an invalid window atomically', () => {
    const f = fixture(), art = f.sheet('authored.png'), native = f.sheet('native.png'); native.pixels.fill(255);
    for (const [x, y] of [[1, 1], [2, 1], [4, 5], [5, 5]]) native.pixels[(y * 8 + x) * 4 + 3] = 0;
    const region = { ...f.region(), preserveAlpha: [{ x: 0, y: 0, w: 8, h: 2 }, { x: 0, y: 5, w: 8, h: 2 }] };
    const detail = f.engine.tile(art, region, native);
    assert.deepEqual(detail.ctx.clears, [[0, 0, 32, 32], [4, 4, 8, 4], [16, 20, 8, 4]]);
    const atlas = f.engine.imageGroups(native, [{ sheet: art, regions: [region] }]);
    assert.deepEqual(atlas.ctx.clears, [[0, 0, 8, 8], [1, 1, 2, 1], [4, 5, 2, 1]]);
    assert.equal(f.engine.tile(art, region, native), detail);
    const invalid = { ...region, preserveAlpha: [...region.preserveAlpha, { x: 8, y: 0, w: 1, h: 1 }] };
    assert.equal(f.engine.tile(art, invalid, native), null);
    assert.equal(f.engine.imageGroups(native, [{ sheet: art, regions: [region, invalid] }]), native,
        'An invalid later mask preserves the whole source group');
    assert(f.engine.tile(art, { ...region, preserveAlpha: [] }), 'An empty mask list needs no native source');
});

test('large backing scales retain eightfold detail with separate default cache and native attachment holes', () => {
    const f = fixture(), art = f.sheet('painted.png'), native = f.sheet('native.png'); native.pixels.fill(255);
    native.pixels[(3 * 8 + 2) * 4 + 3] = 0;
    const region = { ...f.region(), preserveAlpha: { x: 0, y: 3, w: 8, h: 1 } };
    const normal = f.engine.tile(art, region, native), large = f.engine.tile(art, region, native, 6);
    assert.equal(normal.width, 32); assert.equal(large.width, 64);
    assert.deepEqual(large.ctx.clears, [[0, 0, 64, 64], [16, 24, 8, 8]]);
    assert.equal(f.engine.tile(art, region, native, 8), large);
    assert.equal(f.engine.tile(art, region, native), normal, 'legacy/default detail stays exactly fourfold');
    assert.equal(f.engine.tile(art, region, native, Infinity), normal, 'invalid requested scales use the stable default');
    assert.equal(f.engine.tile(art, region, native, 1000), large, 'detail resolution has a fixed upper bound');
});
test('high-resolution detail retention obeys the byte budget before the entry-count limit', () => {
    const f = fixture(), art = f.sheet('painted.png');
    const regions = Array.from({ length: 18 }, () => ({ ...f.region(), w: 64, h: 64 }));
    const first = f.engine.tile(art, regions[0], null, 8);
    const results = regions.slice(1).map(region => f.engine.tile(art, region, null, 8));
    assert.equal(first.width, 512);
    assert.equal(f.engine.tile(art, regions[17], null, 8), results[16], 'recent entries survive');
    assert.notEqual(f.engine.tile(art, regions[0], null, 8), first, '18 one-MiB entries cannot stay in a 16-MiB cache');
});
