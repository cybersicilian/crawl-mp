const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const modules = {};
function load(name) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts', name + '.js'), 'utf8'), {
        define(names, factory) { modules[name] = factory(...names.map(key => modules[key])); }
    });
    return modules[name];
}
load('liquid-field'); load('light-field-sampling'); load('material-response'); load('light-emission');
const lighting = load('surface-lighting'), walls = load('wall-surface'), blend = load('terrain-blend');
const size = 32;
function solid(colour, alpha = 255) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let n = 0; n < data.length; n += 4) data.set([...colour, alpha], n);
    return { data, material: 'stone' };
}
const sand = { ...solid([190, 156, 87]), material: 'sand' }, stone = solid([40, 48, 55]);
function floor(x, y, select) {
    return blend.pixels(blend.offsets.map(offset => select(x + offset.x, y + offset.y)), x, y, size, size);
}
test('sand transitions are continuous on both sides, including four-tile corners', () => {
    const select = (x, y) => x >= 0 && y >= 0 ? sand : stone;
    let maximum = 0;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        const a = floor(x, y, select), east = floor(x + 1, y, select), south = floor(x, y + 1, select);
        for (let p = 0; p < size; p++) for (let c = 0; c < 3; c++) {
            maximum = Math.max(maximum, Math.abs(a.data[(p * size + 31) * 4 + c] - east.data[p * size * 4 + c]),
                Math.abs(a.data[((size - 1) * size + p) * 4 + c] - south.data[p * 4 + c]));
        }
    }
    assert(maximum < 25, `Adjacent pixels cross a feather, not a hard material edge (${maximum})`);
    const mixed = floor(0, 0, select);
    assert(mixed.data[0] > 40 && mixed.data[0] < 180, 'the diagonal corner mixes all known neighbors');
    assert(mixed.data[(20 * size + 20) * 4] > 175, 'the native sand interior retains its pigment');
});
test('floor blending preserves alpha, never samples unknown tiles and repeats in world space', () => {
    const source = solid([100, 100, 100], 173), before = source.data.slice();
    const cells = new Array(9).fill(null); cells[4] = source;
    const isolated = blend.pixels(cells, -1, 4, size, size);
    for (let n = 0; n < isolated.data.length; n++) assert.equal(isolated.data[n], before[n]);
    assert.deepEqual(source.data, before);
    const neighbours = blend.offsets.map((offset, n) => n % 2 ? sand : stone);
    assert.deepEqual(blend.pixels(neighbours, -1, 4, size, size), blend.pixels(neighbours, 7, 12, size, size));
});
test('crystal facets provide broad normals, material roughness and light-dependent moving glints', () => {
    const original = solid([25, 140, 160], 207).data, before = original.slice();
    const detail = walls.prepare(original, size, size, 'crystal', 3, 2, 0);
    assert.deepEqual(original, before);
    const directions = new Set();
    for (let n = 0; n < size * size; n++) {
        assert.equal(detail.data[n * 4 + 3], 207);
        assert(detail.roughness[n] >= .13 && detail.roughness[n] <= .31);
        directions.add(detail.normals[n * 2].toFixed(3));
    }
    assert(directions.size > 6 && directions.size < 50, 'facets share a normal across many pixels');
    const prepared = lighting.prepare(detail.data, size, size, detail.normals, detail);
    const light = { x: 3, y: 1, radius: 5, strength: .3, colour: [255, 200, 110], variation: .18 };
    const a = lighting.shade(prepared, 'crystal', 3, 2, [light], 0), b = lighting.shade(prepared, 'crystal', 3, 2, [light], 17);
    assert.notDeepEqual(a, b);
    const steady = { ...light, variation: 0 };
    assert.deepEqual(lighting.shade(prepared, 'crystal', 3, 2, [steady], 0), lighting.shade(prepared, 'crystal', 3, 2, [steady], 17),
        'steady lights do not create a traveling fake glint');
    assert.deepEqual(a, lighting.shade(prepared, 'crystal', 3, 2, [light], 0));
    const dark = lighting.shade(prepared, 'crystal', 3, 2, [], 0);
    assert.deepEqual(dark, lighting.shade(prepared, 'crystal', 3, 2, [{ ...light, visibility: new Array(9).fill(0) }], 17));
    for (let n = 3; n < a.length; n += 4) assert.equal(a[n], 207);
});
test('masonry cavities and exposed bevels add depth without outlining connected interiors', () => {
    const original = solid([80, 85, 75]).data;
    for (let y = 14; y < 17; y++) for (let x = 0; x < size; x++) original.set([20, 23, 20, 255], (y * size + x) * 4);
    const interior = walls.prepare(original, size, size, 'brick', 0, 0, 0);
    const exposed = walls.prepare(original, size, size, 'brick', 0, 0, 8);
    assert(interior.cavity[15 * size + 16] < interior.cavity[8 * size + 16], 'mortar is recessed');
    assert.equal(interior.normals[8 * size * 2], 0, 'a connected wall edge gets no synthetic bevel');
    assert(exposed.normals[8 * size * 2] < -.1);
    assert(interior.roughness.every(value => value >= .81999 && value <= .98001));
    assert(walls.prepare(original, size, size, 'metal', 0, 0, 0).roughness.every(value => value < .46));
});

test('green crystal keeps its hue and glass preserves every native alpha value', () => {
    const green = solid([15, 170, 35]).data, crystal = walls.prepare(green, size, size, 'crystal', 0, 0, 0);
    for (let n = 0; n < green.length; n += 4) assert(crystal.data[n + 1] > crystal.data[n] * 3 && crystal.data[n + 1] > crystal.data[n + 2] * 2);
    const raw = solid([90, 160, 180]).data;
    for (let n = 3; n < raw.length; n += 4) raw[n] = n % 256;
    const glass = walls.prepare(raw, size, size, 'glass', 2, 3, 0);
    const prepared = lighting.prepare(glass.data, size, size, glass.normals, glass);
    const output = lighting.shade(prepared, 'glass', 2, 3, [{ x: 1, y: 3, radius: 4, strength: .2, colour: [255, 180, 90] }], 7);
    for (let n = 3; n < raw.length; n += 4) { assert.equal(glass.data[n], raw[n]); assert.equal(output[n], raw[n]); }
    assert(glass.roughness.every(value => value >= .08999 && value <= .17001));
});

test('visible light transmits once per clear wall while solid and unknown cells still block', () => {
    const geometry = load('tile-lighting');
    function scene(transmission, hidden = false) {
        return geometry.create({ x: 0, y: 0, cols: 7, rows: 5 }, (x, y) => ({
            visible: !(hidden && x === 3), solid: x === 3, transmission: x === 3 ? transmission : 1,
            light: x === 1 && y === 2 ? { radius: 7, strength: .2, colour: [255, 180, 90] } : null
        }));
    }
    assert.equal(scene(0).at(5, 2).length, 0);
    const visible = scene(.6).at(5, 2);
    assert.equal(visible.length, 1);
    assert(visible[0].visibility.every(value => Math.abs(value - .6) < .00001), 'supersampling does not repeatedly absorb inside one wall');
    assert.equal(scene(.6, true).at(5, 2).length, 0, 'transparency never supplies unknown map knowledge');
});
