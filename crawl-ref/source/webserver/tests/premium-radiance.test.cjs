const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function load(file, deps = {}, globals = {}) {
    let value;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
        ...globals, define(names, factory) {
            if (typeof names === 'function') { factory = names; names = []; }
            value = factory(...names.map(name => deps[name]));
        }
    }); return value;
}
const noise = load('static/scripts/liquid-field.js');
const flame = load('static/scripts/flame-field.js', { 'liquid-field': noise });
const bloom = load('static/scripts/emissive-surface.js');
const sampling = load('static/scripts/light-field-sampling.js');
const emission = load('static/scripts/light-emission.js');
const reflect = load('static/scripts/surface-reflections.js', { 'liquid-field': noise,
    'light-field-sampling': sampling, 'light-emission': emission });
const regions = load('static/scripts/region-field.js');
const visibility = load('static/scripts/visibility-feather.js');
const lighting = load('static/scripts/tile-lighting.js');
const profile = { colour: [240, 190, 90], edge: [255, 230, 180], fill: .08, rim: .25, motion: .01, speed: 1 };
test('fire changes silhouette and curls while keeping density bounded to its emitter', () => {
    let changed = 0, lit = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const a = flame.sample((x - 16) / 16, y / 32, 0, 17), b = flame.sample((x - 16) / 16, y / 32, .4, 17);
        assert(a.alpha >= 0 && a.alpha <= 1); assert(a.colour.every(Number.isFinite));
        if (Math.abs(a.alpha - b.alpha) > .1) changed++;
        if (a.alpha > .1) lit++;
    }
    assert(changed > 40 && lit > 100);
    assert.equal(flame.sample(1.6, .5, 1, 17).alpha, 0);
    assert.equal(flame.sample(0, 1.2, 1, 17).alpha, 0);
});
test('bright-pass bloom emits from hot pixels, expands into a soft halo and preserves source pixels', () => {
    const data = new Uint8ClampedArray(8 * 8 * 4);
    for (let n = 0; n < data.length; n += 4) data.set([30, 20, 10, 255], n);
    assert(bloom.bloom(data, 8, 8, 8).data.every(value => value === 0));
    data.set([255, 170, 55, 255], (4 * 8 + 4) * 4); const before = data.slice();
    const halo = bloom.bloom(data, 8, 8, 8);
    assert.equal(halo.width, 24); assert.equal(halo.height, 24); assert.deepEqual(data, before);
    assert(halo.data.some((value, n) => n % 4 === 3 && value > 0));
    assert(halo.data[((4 + 8) * 24 + 4 + 8 - 3) * 4 + 3] > 0, 'glow extends beyond its isolated hot source');
    assert.equal(halo.data[3], 0, 'the finite kernel does not fill the whole buffer');
});
test('light reflections track source position, wave phase and occlusion without camera coordinates', () => {
    const source = { x: 2, y: 3, radius: 5, strength: .2, elevation: .7 };
    let peak = 0, changed = 0;
    for (let y = 0; y < 32; y++) {
        const a = reflect.sample(2.5, 4 + y / 32, source, 0), b = reflect.sample(2.5, 4 + y / 32, source, .5);
        peak = Math.max(peak, a); if (Math.abs(a - b) > .01) changed++;
        assert(a >= 0 && a <= .58);
    }
    assert(peak > .08 && changed > 4);
    assert(reflect.sample(8, 4, source, 0) < .001);
    const canvases = [], document = { createElement() {
        const canvas = { getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(4096) }),
            putImageData(image) { canvas.pixels = image.data; } }) }; canvases.push(canvas); return canvas;
    } };
    const factory = load('static/scripts/surface-reflections.js', { 'liquid-field': noise,
        'light-field-sampling': sampling, 'light-emission': emission }, { document }).create(3);
    const light = { ...source, colour: [255, 150, 60], visibility: new Array(9).fill(0) };
    assert(factory.tile(2, 4, [light], 0, true).pixels.every(value => value === 0));
    const staticImage = factory.tile(2, 4, [{ ...light, visibility: undefined }], 0, false);
    assert.equal(factory.tile(2, 4, [{ ...light, visibility: undefined }], 5000, false), staticImage);
    for (let i = 0; i < 8; i++) factory.tile(2, 4, [light], i * 100, true);
    assert.equal(factory.size(), 3); factory.clear(); assert.equal(factory.size(), 0);
});
test('connected masks omit internal borders and preserve holes, exact target masks and separate components', () => {
    const cells = [{ x: 0, y: 0, kind: 'a' }, { x: 1, y: 0, kind: 'a' },
        { x: 0, y: 1, kind: 'a' }, { x: 1, y: 1, kind: 'a' }, { x: 4, y: 0, kind: 'a' }, { x: 0, y: 0, kind: 'b' }];
    const groups = regions.create(cells); assert.equal(groups.length, 3);
    const group = groups.find(item => item.cells.size === 4);
    assert.equal([...group.edges.values()].flat().length, 8);
    assert(regions.distance(group, 1, 1) > .9, 'the internal four-tile intersection is not an edge');
    const a = regions.sample(group, 1 - 1e-6, .5, 1, profile), b = regions.sample(group, 1 + 1e-6, .5, 1, profile);
    assert(Math.abs(a.alpha - b.alpha) < .00001);
    assert.equal(regions.sample(group, 2.01, .5, 1, profile).alpha, 0);
    const hole = regions.create(Array.from({ length: 9 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3), kind: 'hole' })).filter(cell => cell.x !== 1 || cell.y !== 1))[0];
    assert.equal(regions.sample(hole, 1.5, 1.5, 0, profile).alpha, 0);
});
test('soft aura circles are rotationally symmetric and fade without tile corners', () => {
    const group = regions.create([{ x: 0, y: 0, kind: 'halo' }, { x: 1, y: 0, kind: 'halo' },
        { x: 0, y: 1, kind: 'halo' }, { x: 1, y: 1, kind: 'halo' }])[0];
    const east = regions.circle(group, group.center.x + .8, group.center.y, 0, profile);
    const south = regions.circle(group, group.center.x, group.center.y + .8, 0, profile);
    assert.equal(east.alpha, south.alpha);
    assert(regions.circle(group, 1, 1, 0, profile).alpha > regions.circle(group, 2.3, 1, 0, profile).alpha);
    assert.equal(regions.circle(group, 5, 1, 0, profile).alpha, 0);
});
test('shared occlusion edge samples and visibility feathers fade to zero before unknown space', () => {
    const scene = lighting.create({ x: 0, y: 0, cols: 6, rows: 5 }, (x, y) => ({
        visible: x < 5, solid: x === 3 && y < 3, light: x === 1 && y === 1 ? { radius: 5, strength: .2, colour: [255, 160, 70] } : null
    }));
    const light = scene.lights[0], cells = new Map(light.receivers.map(cell => [cell.x + ':' + cell.y, cell]));
    light.receivers.forEach(cell => {
        const east = cells.get((cell.x + 1) + ':' + cell.y);
        if (east) for (let row = 0; row < 3; row++) assert.equal(cell.visibility[row * 3 + 2], east.visibility[row * 3]);
    });
    assert.equal(scene.known(5, 2), false);
    assert(visibility.distance(4.9, 3.5, scene.known) < .11);
    assert(visibility.distance(3.5, 3.5, scene.known) >= .9);
});
test('native fire and spells emit only while present; aura semantics keep targets and threat markers distinct', () => {
    const registry = { jquery: { extend: Object.assign, each: (values, fn) => values.forEach((value, i) => fn(i, value)) } };
    for (const name of ['enums', 'tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-dngn', 'tileinfo-main',
        'environment-art', 'terrain-materials', 'premium-effect-model', 'premium-terrain-model', 'premium-region-model'])
        registry['./' + name] = load('game_data/static/' + name + '.js', registry, { assert, window: {} });
    const tiles = registry['./tileinfo-dngn'], main = registry['./tileinfo-main'], enums = registry['./enums'];
    const model = registry['./premium-terrain-model'], areas = registry['./premium-region-model'];
    const fire = { t: { bg: tiles.FLOOR_NORMAL, cloud: main.CLOUD_FIRE } };
    assert.equal(model.describe(fire).light.kind, 'fire');
    assert.equal(model.describe(fire).emission.type, 'flame'); assert.equal(model.describe(fire).emission.blocked, false);
    assert.equal(model.describe({ ...fire, mon: { id: 1 } }).emission.blocked, true);
    assert.equal(model.describe({ t: { bg: tiles.FLOOR_NORMAL, cloud: 0 } }).light, null);
    assert.equal(model.describe({ t: { bg: tiles.FLOOR_NORMAL, ov: [main.BOLT_FROST] } }).light.kind, 'frost');
    assert.equal(model.describe({ t: { bg: tiles.FLOOR_NORMAL, ov: [main.MI_ARROW2] } }).light, null);
    assert.equal(areas.describe({ t: { bg: tiles.FLOOR_NORMAL, halo: enums.HALO_UMBRA_3 } })[0].kind, 'umbra');
    assert.equal(areas.describe({ t: { bg: tiles.FLOOR_NORMAL, ov: [tiles.RAY] } })[0].kind, 'target');
    assert.equal(areas.profiles.target.circular, false); assert.equal(areas.profiles.umbra.circular, true);
    assert.equal(areas.kind(tiles.HALO_FRIENDLY), undefined);
    assert.equal(areas.describe({ t: { bg: tiles.FLOOR_NORMAL + 0x40000, halo: enums.HALO_RANGE } }).length, 0);
});
