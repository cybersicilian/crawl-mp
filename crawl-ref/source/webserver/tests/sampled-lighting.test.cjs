const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function load(name, deps = {}) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'static/scripts', name + '.js'), 'utf8'), {
        define: (names, factory) => { result = factory(...names.map(name => deps[name])); }
    }); return result;
}
const weighted = load('weighted-cache'), sampled = load('sampled-lighting');
const shading = load('surface-lighting', { 'light-field-sampling': load('light-field-sampling'),
    'material-response': load('material-response'), 'light-emission': load('light-emission') });
test('weighted retention honors LRU, replacement costs, zero budgets and invalid weights', () => {
    const cache = weighted.create(10, 3, value => value);
    cache.set('a', 4); cache.set('b', 4); assert.equal(cache.get('a'), 4); cache.set('c', 4);
    assert.equal(cache.get('b'), undefined); assert.equal(cache.stats().bytes, 8);
    cache.set('a', 2); assert.equal(cache.stats().bytes, 6);
    assert.equal(cache.set('a', 20), 20); assert.equal(cache.get('a'), undefined); assert.equal(cache.stats().bytes, 4);
    assert.throws(() => cache.set('bad', NaN)); assert.equal(cache.stats().bytes, 4);
    cache.clear(); assert.equal(cache.stats().bytes, 0); assert.equal(cache.stats().entries, 0);
    const none = weighted.create(0, 0, value => value); assert.equal(none.set('a', 0), 0); assert.equal(none.get('a'), undefined);
});
test('sampled lighting preserves alpha and high frequency pigment independently of light-grid size', () => {
    const field = sampled.create(1, 1); field.gain.set([.5, 1, 1.5, 0]); field.add.set([10, 20, 30, 0]);
    const data = new Uint8ClampedArray([20, 50, 80, 0, 80, 50, 20, 127, 20, 80, 50, 255, 50, 20, 80, 90]);
    const before = data.slice(), result = sampled.apply(data, 2, 2, field);
    assert.deepEqual(Array.from(result), [20, 70, 150, 0, 50, 70, 60, 127, 20, 100, 105, 255, 35, 40, 150, 90]);
    assert.deepEqual(data, before); assert.throws(() => sampled.apply(data, 4, 4, field));
});
test('captured light coefficients reproduce native shading, including unlit, shadowed and emissive surfaces', () => {
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let n = 0; n < data.length; n++) data[n] = n * 7 % 256;
    const surface = shading.prepare(data, 32, 32), light = { x: 1, y: -1, radius: 4, strength: .3,
        colour: [255, 110, 40], visibility: [1, 1, .5, 1, .5, 0, .5, 0, 0] };
    for (const material of ['stone', 'sand', 'glass', 'lava']) for (const lights of [[], [light]]) {
        const field = sampled.create(32, 32), direct = shading.shade(surface, material, 0, 0, lights, 1, {}, field);
        const original = shading.shade(surface, material, 0, 0, lights, 1, {});
        assert.deepEqual(Array.from(direct), Array.from(original));
        const reapplied = sampled.apply(data, 32, 32, field);
        assert(direct.every((value, index) => Math.abs(value - reapplied[index]) <= 1));
    }
});
