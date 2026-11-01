const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const modules = {};
function load(name) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts', name + '.js'), 'utf8'), {
        define(names, factory) { modules[name] = factory(...names.map(key => modules[key])); }
    }); return modules[name];
}
load('pixel-sampling'); load('light-field-sampling'); load('light-emission');
const optics = load('transparent-surface'), aura = load('aura-distortion');
const width = 32, height = 32;
test('mixed-resolution halos retain known edges and clamp absent neighbours to the centre', () => {
    function raster(size, colour) {
        const data = new Uint8ClampedArray(size * size * 4);
        for (let n = 0; n < data.length; n += 4) data.set(colour, n);
        return { data, width: size, height: size };
    }
    const own = raster(8, [0, 100, 0, 255]), right = raster(2, [0, 0, 200, 255]);
    const neighbours = Array(9).fill(null); neighbours[4] = own; neighbours[5] = right;
    const halo = modules['pixel-sampling'].halo(neighbours, 8, 8, 2), stride = 12;
    assert.deepEqual(Array.from(halo.slice((3 * stride + 10) * 4, (3 * stride + 10) * 4 + 4)), [0, 0, 200, 255]);
    assert.deepEqual(Array.from(halo.slice((3 * stride) * 4, (3 * stride) * 4 + 4)), [0, 100, 0, 255]);
    assert.deepEqual(Array.from(modules['pixel-sampling'].warpHalo(halo, 8, 8, () => ({ x: 0, y: 0 }), 2)), Array.from(own.data));
    const moved = modules['pixel-sampling'].warpHalo(halo, 8, 8, () => ({ x: 1.5, y: 0 }), 2);
    assert.deepEqual(Array.from(moved.slice(7 * 4, 8 * 4)), [0, 0, 200, 255]);
    assert.throws(() => modules['pixel-sampling'].halo(neighbours, 8, 8, 0));
});
test('halo warping preserves identity, reads the adjacent edge and avoids transparent colour fringes', () => {
    const size = 4, stride = size + 2, halo = new Uint8ClampedArray(stride * stride * 4);
    for (let y = 0; y < stride; y++) for (let x = 0; x < stride; x++)
        halo.set([x * 30, y * 30, 80, 255], (y * stride + x) * 4);
    const still = modules['pixel-sampling'].warpHalo(halo, size, size, () => ({ x: 0, y: 0 }));
    const moved = modules['pixel-sampling'].warpHalo(halo, size, size, () => ({ x: .5, y: 0 }));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const n = (y * size + x) * 4;
        assert.deepEqual(Array.from(still.slice(n, n + 4)), [(x + 1) * 30, (y + 1) * 30, 80, 255]);
        assert.equal(moved[n], (x + 1) * 30 + 15);
        assert.equal(moved[n + 3], 255);
    }
    halo.set([255, 0, 0, 0], (stride + 2) * 4);
    halo.set([0, 0, 200, 255], (stride + 1) * 4);
    const edge = modules['pixel-sampling'].warpHalo(halo, size, size, () => ({ x: .5, y: 0 }));
    assert.deepEqual(Array.from(edge.slice(0, 4)), [0, 0, 200, 128]);
});
function texture() {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
        data.set([(x % 4) * 50, (y % 4) * 50, 80, 255], (y * width + x) * 4);
    return data;
}
test('refraction is subpixel, bounded to supplied terrain and leaves opaque frames intact', () => {
    const base = texture(), before = base.slice(), wall = { width, height, normals: new Float32Array(width * height * 2) };
    wall.normals.fill(.12);
    const art = new Uint8ClampedArray(base.length);
    for (let n = 0; n < art.length; n += 4) art.set([20, 150, 60, n % 32 ? 0 : 255], n);
    const out = optics.compose(base, wall, art, 0, 0, [], 10, .82);
    assert(out.some((value, n) => value !== base[n])); assert.deepEqual(base, before);
    for (let n = 0; n < art.length; n += 4) {
        assert.equal(out[n + 3], 255);
        if (art[n + 3] === 255) for (let c = 0; c < 4; c++) assert.equal(out[n + c], art[n + c]);
        else for (let c = 0; c < 3; c++) assert(Math.abs(out[n + c] - base[n + c]) < 70, 'bending stays below one native pixel');
    }
});
test('pane reflections follow visible light and disabled motion has an exact fixed phase', () => {
    const wall = { width, height, normals: new Float32Array(width * height * 2) }, art = new Uint8ClampedArray(width * height * 4);
    const light = { x: 0, y: 0, radius: 4, strength: .3, colour: [255, 120, 30], variation: .2 };
    const base = texture(), dark = optics.compose(base, wall, art, 0, 0, [], 0, .82);
    const blocked = optics.compose(base, wall, art, 0, 0, [{ ...light, visibility: new Array(9).fill(0) }], 0, .82);
    assert.deepEqual(dark, blocked);
    const lit = optics.compose(base, wall, art, 0, 0, [light], 0, .82);
    assert(lit.some((value, n) => n % 4 === 0 && value > dark[n]));
    assert.deepEqual(lit, optics.compose(base, wall, art, 0, 0, [light], 0, .82));
});
test('magical radial waves move continuously across tile edges and vanish outside the soft field', () => {
    const group = { center: { x: 1, y: 1 }, radius: 2 }, profile = { speed: 1.4, distortion: .55 };
    const a = aura.displacement(group, 1 - 1e-6, .4, 1, profile), b = aura.displacement(group, 1 + 1e-6, .4, 1, profile);
    assert(Math.abs(a.x - b.x) < .00001 && Math.abs(a.y - b.y) < .00001);
    assert.notDeepEqual(a, aura.displacement(group, 1 - 1e-6, .4, 1.5, profile));
    const centre = aura.displacement(group, 1, 1, 1, profile); assert.equal(Math.hypot(centre.x, centre.y), 0);
    assert.equal(Math.hypot(...Object.values(aura.displacement(group, 8, 8, 1, profile))), 0);
    for (let r = 0; r < 4; r += .1) assert(Math.hypot(...Object.values(aura.displacement(group, r, 1, 1, profile))) <= .55001);
});
test('aura distortion consumes only supplied terrain; missing neighbors fall back without changing alpha', () => {
    const data = texture(), before = data.slice(), group = { center: { x: .5, y: .5 }, radius: 2 };
    const output = aura.shade(data, width, height, 0, 0, [group], 1, () => ({ speed: 1.4 }), () => null);
    assert(output.every((value, n) => value === data[n])); assert.deepEqual(data, before);
});
