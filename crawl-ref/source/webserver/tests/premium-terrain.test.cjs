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
            window: {}, ...globals, assert, define(names, factory) {
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

function nativeFixture() {
    const f = modules();
    for (const name of ['enums', 'tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-dngn',
        'environment-art', 'terrain-materials', 'tileinfo-main', 'premium-effect-model', 'premium-terrain-model']) f.load(name);
    return f;
}

test('native model covers fluid variants and protects occupants, decals, and fog', () => {
    const f = nativeFixture();
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

test('remembered liquid materials remain known without becoming light or effect sources', () => {
    const f = nativeFixture(), tiles = f.result['./tileinfo-dngn'], model = f.result['./premium-terrain-model'];
    const lighting = f.load('tile-lighting', true);
    for (const name of ['DNGN_OPEN_SEA', 'DNGN_DEEP_WATER', 'DNGN_DEEP_WATER_MURKY', 'DNGN_SHALLOW_WATER',
        'DNGN_SHALLOW_WATER_DISTURBANCE', 'DNGN_SHALLOW_WATER_MURKY', 'DNGN_SHALLOW_WATER_MURKY_DISTURBANCE',
        'DNGN_LAVA', 'DNGN_LAVA_SEA']) {
        // Check native animation variants as well as their base tile.
        for (let variant = 0; variant < tiles.tile_count(tiles[name]); variant++) {
            const index = tiles[name] + variant;
            const entry = { t: { bg: index + 0x40000 } };
            const seen = model.describe({ t: { bg: index } });
            const memory = model.describe(entry, { remembered: true });
            assert.equal(model.describe(entry), null, 'existing effects and lighting remain visible-only');
            assert(memory.remembered && !memory.visible);
            for (const key of ['surface', 'depth', 'murky', 'shading', 'relightable']) assert.equal(memory[key], seen[key], name);
            for (const key of ['light', 'effect', 'emission']) assert.equal(memory[key], null);
            assert.equal(model.describe({ t: { bg: index + 0x20000 } }, { remembered: true }), null);
            assert.equal(model.describe({ t: { bg: index + 0x60000 } }, { remembered: true }), null);
            const scene = lighting.create({ x: 0, y: 0, cols: 1, rows: 1 }, () => memory);
            assert.equal(scene.cells.length + scene.lights.length, 0);
        }
    }
    for (const bg of [tiles.DNGN_UNSEEN, tiles.DNGN_ERROR])
        assert.equal(model.describe({ t: { bg } }, { remembered: true }), null);
    const rememberedFloor = { ...floor, visible: false, remembered: true };
    const rememberedWater = { ...water, visible: false, remembered: true };
    assert.equal(topology.describe(water, [rememberedWater, rememberedFloor, null, water]).shore, 2);
    assert.equal(topology.describe(rememberedWater, [water, rememberedFloor, null, rememberedWater]).shore, 2);
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

test('premium liquids keep their raster under fog, stop moving in memory, and resume on visibility changes', () => {
    const f = nativeFixture(), tiles = f.result['./tileinfo-dngn'], enums = f.result['./enums'];
    const noop = () => {}, handlers = new Map(), order = [], jobs = [];
    const document = { createElement() {
        const canvas = { width: 32, height: 32, pixels: new Uint8ClampedArray(4096) };
        const ctx = { save: noop, restore: noop, beginPath: noop, rect: noop, clip: noop,
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: () => ({ data: new Uint8ClampedArray(canvas.pixels) }),
            putImageData(image) { canvas.pixels.set(image.data); },
            drawImage(image) { canvas.pixels.set(image.pixels); } };
        canvas.getContext = () => ctx;
        return canvas;
    } };
    const window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
    const jquery = () => ({ on(events, handler) {
        for (const event of events.split(' ')) handlers.set(event, handler);
        return this;
    } });
    jquery.each = (items, fn) => items.forEach((item, index) => fn(index, item));
    const flags = new Set(['liquids', 'lighting', 'materials', 'borders']);
    const settings = { tile_display_mode: 'tiles', tile_realtime_anim: true, tile_water_anim: true, tile_misc_anim: true };
    let premium = true, lightReads = 0;
    const entry = { t: {} }, lights = [{ x: 0, y: 0, radius: 3, strength: .3, colour: [255, 90, 40] }];
    Object.assign(f.result, {
        jquery, './options': { ready: () => true, get: key => settings[key], add_listener: noop },
        './game-context': { get_ui_state: () => enums.ui.NORMAL },
        './tileinfo-icons': { MESH: 123 }, './terrain-edges': { draw: noop }, './environment-ground': { draw: () => false },
        './map_knowledge': { get: (x, y) => x === 0 && y === 0 ? entry : {}, touch: noop },
        'visual-presentation': { premium: () => premium, animated: () => true, enabled: key => flags.has(key) },
        './premium-light-field': { forView: () => ({ at() { lightReads++; return lights; } }) },
        'liquid-shader': { pixels: () => null }, 'idle-work': { add: (...args) => jobs.push(args) }
    });
    const layers = f.load('cell-renderer-layers');
    for (const name of ['tile-edges', 'terrain-topology', 'liquid-field', 'fluid-surface', 'shoreline-paint', 'terrain-finish',
        'light-field-sampling', 'material-response', 'light-emission', 'sampled-lighting', 'weighted-cache', 'surface-lighting', 'terrain-blend', 'depth-shading'])
        f.load(name, true, { document });
    const terrain = f.load('premium-terrain', false, { document, window });
    const output = document.createElement('canvas');
    const renderer = { frame_time: 800, view: {}, ctx: output.getContext('2d'), scaled_size: () => ({ width: 32, height: 32 }),
        draw_dngn() {
            order.push('atlas');
            const image = this.ctx.createImageData(32, 32);
            for (let i = 0; i < image.data.length; i += 4) image.data.set([7, 11, 13, 255], i);
            this.ctx.putImageData(image);
        }, draw_icon(id) { assert.equal(id, 123); order.push('fog'); },
        draw_blood_overlay: noop };
    const drawImage = renderer.ctx.drawImage;
    renderer.ctx.drawImage = image => { order.push('premium'); drawImage(image); };
    function change(index, flag = 0) {
        entry.t = { bg: enums.prepare_bg_flags(index + flag), fg: enums.prepare_fg_flags(0), icons: [], flv: {} };
        handlers.get('map_knowledge_changed.premiumTerrain')({}, [{ x: 0, y: 0 }]);
        while (jobs.length) jobs.shift()[1](() => 1);
        renderer.frame_time += 800;
        order.length = jobs.length = lightReads = 0;
    }
    for (const index of [tiles.DNGN_LAVA, tiles.DNGN_DEEP_WATER, tiles.DNGN_SHALLOW_WATER_MURKY]) {
        change(index);
        const moving = terrain.frame(renderer, 0, 0).pixels;
        assert(lightReads > 0 && jobs.length > 0, 'visible liquid participates in lighting and animation');
        renderer.frame_time += 800;
        assert.notDeepEqual(terrain.frame(renderer, 0, 0).pixels, moving);
        change(index, 0x40000);
        layers.methods.draw_background.call(renderer, 0, 0, entry.t, 0, 0);
        layers.methods.draw_foreground.call(renderer, 0, 0, entry);
        assert.deepEqual(order.filter(value => value !== 'atlas'), ['premium', 'fog'], 'native fog overlays the replacement');
        const memory = terrain.frame(renderer, 0, 0);
        assert.equal(lightReads + jobs.length, 0, 'remembered liquid neither receives live light nor queues animation');
        assert(new Set(memory.pixels).size > 4, 'the premium procedural raster replaces the atlas colour');
        renderer.frame_time += 1600;
        assert.equal(terrain.frame(renderer, 0, 0), memory, 'memory reuses its static frame');
        change(index);
        assert.notDeepEqual(terrain.frame(renderer, 0, 0).pixels, memory.pixels, 'visible liquid resumes its live phase');
        change(index, 0x20000);
        assert.equal(terrain.frame(renderer, 0, 0), undefined, 'magic mapping keeps native art');
    }
    change(tiles.DNGN_LAVA, 0x40000);
    flags.delete('liquids');
    assert.equal(terrain.draw(renderer, 0, 0, 0, 0, entry.t), false);
    flags.add('liquids'); premium = false;
    assert.equal(terrain.draw(renderer, 0, 0, 0, 0, entry.t), false, 'classic mode keeps native art');
    premium = true;
    change(tiles.FLOOR_MOSS, 0x40000);
    assert.equal(terrain.frame(renderer, 0, 0), undefined, 'other remembered terrain retains its existing path');
});

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
