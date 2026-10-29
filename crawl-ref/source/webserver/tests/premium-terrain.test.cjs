const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function modules() {
    const result = { jquery: { extend: Object.assign, each: (items, fn) => items.forEach((item, index) => fn(index, item)) } };
    function load(name, shared = false, globals = {}) {
        vm.runInNewContext(fs.readFileSync(path.join(root, shared ? 'static/scripts' : 'game_data/static', name + '.js'), 'utf8'), {
            ...globals, window: {}, assert, define(names, factory) {
                if (typeof names === 'function') { factory = names; names = []; }
                result[(shared ? '' : './') + name] = factory(...names.map(key => result[key]));
            }
        });
        return result[(shared ? '' : './') + name];
    }
    return { result, load };
}
const fixture = modules();
const edges = fixture.load('tile-edges', true), topology = fixture.load('terrain-topology', true);
const floor = Object.freeze({ visible: true, solid: false, surface: null, material: 'stone' });
const water = Object.freeze({ visible: true, solid: false, surface: 'water', depth: 'deep', index: 1 });

test('all shore masks connect same-fluid neighbours and omit unknown terrain', () => {
    for (let mask = 0; mask < 16; mask++) {
        const neighbours = edges.sides.map(side => mask & side.bit ? floor : water);
        assert.equal(topology.describe(water, neighbours).shore, mask);
    }
    assert.equal(topology.describe(water, [null, undefined, { visible: false, solid: true }, water]).shore, 0);
    assert.equal(topology.describe(water, [{ ...water, surface: 'lava' }, water, water, water]).shore, 1);
    assert.equal(topology.describe(water, [{ ...water, depth: 'shallow' }, floor, water, null]).depth, 1);
});

test('wall contours, wet shore and dry-material feathers have distinct topology', () => {
    const moss = Object.freeze({ ...floor, material: 'moss', index: 2 });
    const wall = Object.freeze({ ...floor, solid: true, material: null });
    const result = topology.describe(floor, [wall, moss, water, null]);
    assert.equal(result.wet, 4); assert.equal(result.blends.length, 1);
    assert.equal(result.blends[0].side.bit, 2); assert.equal(result.blends[0].neighbour, moss);
    assert.equal(topology.describe(wall, [wall, floor, water, null]).wall, 6);
    assert.equal(topology.describe(water, [moss, floor, water, null]).blends.length, 0);
    assert.equal(moss.material, 'moss');
    const banks = topology.describe(floor, [{ ...water, surface: 'lava' }, water, null, null]);
    assert.equal(banks.hot, 1); assert.equal(banks.wet, 2, 'lava uses a scorched edge rather than a wet bank');
});

test('all lava shore combinations stay inset, retain connected interiors and omit unknown banks', () => {
    const f = modules(); f.load('tile-edges', true); const banks = f.load('shoreline-paint', true);
    const lava = Object.freeze({ ...water, surface: 'lava' });
    const point = { x: 10, y: 20, width: 64, height: 64 };
    const calls = [], ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
        fillRect(...rect) { calls.push({ rect, colour: this.fillStyle }); } };
    for (let mask = 0; mask < 16; mask++) {
        calls.length = 0;
        const terrain = topology.describe(lava, edges.sides.map(side => mask & side.bit ? floor : lava));
        banks.paint(ctx, terrain, point, -1, 4);
        assert.equal(Boolean(calls.length), Boolean(mask));
        for (const { rect: [x, y, width, height] } of calls) {
            assert(x >= 10 && y >= 20 && x + width <= 74 && y + height <= 84);
            assert([x, y, width, height].every(Number.isInteger), 'banks retain crisp native pixel geometry');
        }
    }
    calls.length = 0;
    banks.paint(ctx, topology.describe(lava, [null, undefined, { visible: false }, lava]), point, 0, 0);
    assert.equal(calls.length, 0);
});

test('bank profiles differ by material and remain anchored across camera and cache wrapping', () => {
    const f = modules(); f.load('tile-edges', true); const banks = f.load('shoreline-paint', true);
    function paint(terrain, x, y) {
        const calls = [], ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
            fillRect(...rect) { calls.push([this.fillStyle, ...rect]); } };
        banks.paint(ctx, terrain, { x: 0, y: 0, width: 32, height: 32 }, x, y); return calls;
    }
    const lava = { ...water, surface: 'lava' }, edge = topology.describe(lava, [floor, lava, lava, lava]);
    assert.deepEqual(paint(edge, -1, 4), paint(edge, 7, -4));
    assert.notDeepEqual(paint(edge, -1, 4), paint(topology.describe(water, [floor, water, water, water]), -1, 4));
    assert.notDeepEqual(paint(topology.describe(floor, [lava, floor, floor, floor]), -1, 4),
        paint(topology.describe(floor, [water, floor, floor, floor]), -1, 4));
});

test('native model covers fluid variants and protects occupants, decals, and fog', () => {
    const f = modules();
    for (const name of ['enums', 'tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-dngn',
        'environment-art', 'terrain-materials', 'tileinfo-main', 'premium-effect-model', 'premium-terrain-model']) f.load(name);
    const tiles = f.result['./tileinfo-dngn'], model = f.result['./premium-terrain-model'];
    const cell = (id, extra = {}) => ({ t: { bg: id, ...extra } });
    assert.equal(model.describe(cell(tiles.DNGN_DEEP_WATER_MURKY)).murky, true);
    assert.equal(model.describe(cell(tiles.DNGN_SHALLOW_WATER_DISTURBANCE)).depth, 'shallow');
    assert.equal(model.describe(cell(tiles.DNGN_OPEN_SEA)).depth, 'deep');
    assert.equal(model.describe(cell(tiles.DNGN_LAVA_SEA)).surface, 'lava');
    assert.equal(model.describe(cell(tiles.FLOOR_MOSS)).material, 'moss');
    assert.equal(model.describe(cell(tiles.FLOOR_SAND)).material, 'Weathered sand');
    for (const [name, material] of [['WALL_CRYSTAL_SQUARES', 'crystal'], ['WALL_VAULTS_METAL', 'metal'], ['DNGN_TRANSPARENT_WALL', 'glass'],
        ['DNGN_CRYSTAL_GREEN', 'crystal'], ['DNGN_CRYSTAL_LIGHTGREEN', 'crystal'], ['WALL_EMERALD', 'crystal'], ['CRYSTAL_WALL_ZOT', 'crystal']]) {
        const wall = model.describe(cell(tiles[name]));
        assert.equal(wall.shading, material); assert(wall.solid && wall.relightable, name + ' receives its material shader');
    }
    assert.equal(model.describe(cell(tiles.DNGN_CRYSTAL_GREEN)).transmission, 0, 'native green crystal remains opaque');
    assert.equal(model.describe(cell(tiles.DNGN_TRANSPARENT_WALL_GREEN)).transmission, .82);
    assert.equal(model.describe(cell(tiles.DNGN_TRANSPARENT_STONE_GREEN)).transmission, .58);
    assert.equal(model.describe(cell(tiles.DNGN_BLUE_FOUNTAIN)).effect, 'fountain');
    assert.equal(model.describe(cell(tiles.DNGN_DEEP_WATER, { cloud: { value: 0 }, fg: { value: 0 }, doll: [], mcache: [] })).occupied, false);
    for (const extra of [{ fg: 1 }, { cloud: 3 }, { doll: [[1]] }, { mcache: [[1]] }, { ov: [2] }, { ritual_blood: 1 }])
        assert.equal(model.describe(cell(tiles.DNGN_DEEP_WATER, extra)).occupied, true);
    for (const flag of [0x40000, 0x20000]) assert.equal(model.describe(cell(tiles.DNGN_DEEP_WATER + flag)), null);
    assert.equal(model.describe(cell(tiles.DNGN_SHALLOW_WATER, { mangrove_water: true })).surface, null);
    assert.equal(model.describe(cell(tiles.DNGN_UNSEEN)), null);
});

function fluidFixture() {
    const f = modules();
    const document = { createElement() {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData(image) { canvas.pixels = image.data; } });
        return canvas;
    } };
    f.load('liquid-field', true);
    f.result['liquid-shader'] = { pixels: () => null };
    return f.load('fluid-surface', true, { document }).create(8);
}
test('fluid frames are deterministic, opaque, periodic in world space and bounded in memory', () => {
    const surface = fluidFixture(), terrain = topology.describe(water, [floor, water, water, water]);
    const first = surface.tile(terrain, -1, 4, 0);
    assert.equal(first, surface.tile(terrain, -1, 4, 150), 'same animation step is cached');
    assert.equal(first, surface.tile(terrain, 7, 12, 51200), 'world and time repeat without camera-relative phase');
    const moving = surface.tile(terrain, -1, 4, 800);
    assert.notDeepEqual(first.pixels, moving.pixels);
    for (let index = 3; index < first.pixels.length; index += 4) assert.equal(first.pixels[index], 255);
    assert.notDeepEqual(first.pixels, surface.tile({ ...terrain, own: { ...water, surface: 'lava' } }, -1, 4, 0).pixels);
    for (let i = 0; i < 20; i++) surface.tile(terrain, i, 0, i * 200);
    assert.equal(surface.cacheSize(), 8); surface.clear(); assert.equal(surface.cacheSize(), 0);
});

test('terrain extensions run before native decals and can be removed independently', () => {
    const f = modules(), order = [];
    Object.assign(f.result, { './tileinfo-main': {}, './tileinfo-icons': {}, './enums': {}, './options': {},
        './tileinfo-dngn': { DNGN_UNSEEN: 0, FLOOR_MAX: 5, WALL_MAX: 100, DNGN_FIRST_TRANSPARENT: 1000, DNGN_MAX: 1000 },
        './terrain-edges': { draw: () => order.push('legacy-edge') }, './environment-ground': { draw: () => false } });
    f.load('enums');
    const layers = f.load('cell-renderer-layers');
    const remove = layers.addTerrainPainter(() => order.push('terrain-extension'));
    const renderer = { draw_dngn: id => order.push(id === 10 ? 'terrain-art' : 'native-overlay'),
        draw_blood_overlay: () => order.push('blood') };
    const cell = { bg: { value: 10 }, fg: {}, ov: [11] };
    layers.methods.draw_background.call(renderer, 0, 0, cell, 1, 1);
    assert.deepEqual(order, ['terrain-art', 'legacy-edge', 'terrain-extension', 'blood', 'native-overlay']);
    remove(); order.length = 0; layers.methods.draw_background.call(renderer, 0, 0, cell, 1, 1);
    assert(!order.includes('terrain-extension'));
});

test('surface replacements preserve native floor layers and draw transparent wall art exactly once', () => {
    const f = modules(), calls = [];
    Object.assign(f.result, { './tileinfo-main': {}, './tileinfo-icons': {}, './options': {},
        './tileinfo-dngn': { DNGN_UNSEEN: 0, FLOOR_MAX: 5, WALL_MAX: 100, DNGN_FIRST_TRANSPARENT: 10, DNGN_MAX: 200 },
        './terrain-edges': { draw: () => calls.push('edge') }, './environment-ground': { draw: () => false } });
    f.load('enums'); const layers = f.load('cell-renderer-layers');
    const renderer = { draw_dngn: id => calls.push(id), draw_blood_overlay: () => calls.push('blood') };
    const remove = layers.addSurfacePainter((r, cx, cy, x, y, cell) => {
        assert.equal(cell.bg.value, 20); calls.push('shaded-wall'); return true;
    });
    const cell = { bg: { value: 20 }, fg: {}, flv: { f: 2 }, ov: [3, 110] };
    layers.methods.draw_background.call(renderer, 0, 0, cell, 1, 1);
    assert.deepEqual(calls, [2, 3, 'shaded-wall', 'edge', 'blood', 110]);
    remove(); calls.length = 0;
    layers.methods.draw_background.call(renderer, 0, 0, cell, 1, 1);
    assert.deepEqual(calls, [2, 3, 20, 'edge', 'blood', 110], 'unregistering restores the native surface path');
});

test('atmosphere is bounded and clips effects away from occupants and missing cells', () => {
    const f = modules(), atmosphere = f.load('tile-atmosphere', true), calls = [];
    const ctx = { save() {}, restore() {}, beginPath() {}, clip() { calls.push('clip'); },
        rect: (...args) => calls.push(args), fillRect: (...args) => calls.push({ paint: args }) };
    const coords = (x, y) => ({ x: x * 32, y: y * 32, width: 32, height: 32 });
    const scene = { cells: [{ x: 2, y: 2, effect: 'fountain' }, { x: 3, y: 2, effect: 'ember', occupied: true }] };
    atmosphere.paint(ctx, scene, coords, 500, false); assert.equal(calls.length, 0);
    atmosphere.paint(ctx, scene, coords, 500, true);
    assert.deepEqual(calls[0], [64, 64, 32, 32]); assert.equal(calls[1], 'clip');
    const paints = calls.filter(call => call.paint);
    assert(paints.length >= 3 && paints.length <= 6, 'three droplets have at most one short trail each');
});

test('large pools cannot consume the particle budget before torches and fountains', () => {
    const f = modules(), atmosphere = f.load('tile-atmosphere', true), selected = [];
    let clipped = false;
    const ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() { clipped = true; }, fillRect() {} };
    const cells = Array.from({ length: 80 }, (_, i) => ({ x: 100 + i * 5, y: 0, effect: 'water' }));
    cells.push({ x: 1, y: 3, effect: 'ember' }, { x: 2, y: 3, effect: 'fountain' });
    atmosphere.paint(ctx, { cells }, (x, y) => {
        if (clipped) selected.push([x, y]);
        return { x: x * 32, y: y * 32, width: 32, height: 32 };
    }, 500, true);
    assert.equal(selected.length, 32);
    assert(selected.some(([x, y]) => x === 1 && y === 3));
    assert(selected.some(([x, y]) => x === 2 && y === 3));
    assert.equal(cells.length, 82, 'source scene stays unchanged');
});
