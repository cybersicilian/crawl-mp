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

function shoreFixture() {
    const f = modules(), stains = [];
    const document = { createElement() {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData(image) { canvas.pixels = image.data; stains.push(canvas); } });
        return canvas;
    } };
    f.load('liquid-field', true); f.load('tile-edges', true);
    const shores = f.load('shore-field', true, { document });
    return { f, shores, banks: f.load('shoreline-paint', true), stains };
}
const cardinal = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]], diagonal = [[1, -1, 16], [1, 1, 32], [-1, 1, 64], [-1, -1, 128]];
function coastOf(pool, x, y) {
    const liquid = (ox, oy) => pool.includes((x + ox) + ',' + (y + oy));
    return [...cardinal, ...diagonal].reduce((mask, [ox, oy, bit]) => liquid(ox, oy) ? mask : mask | bit, 0);
}

test('diagonal neighbours extend coast masks without letting unknown terrain create shape', () => {
    const result = topology.describe(water, [water, water, water, water], [floor, null, { visible: false }, floor]);
    assert.equal(result.shore, 0); assert.equal(result.coast, 16 | 128);
    const ground = topology.describe(floor, [water, floor, floor, floor], [floor, { ...water, surface: 'lava' }, water, null]);
    assert.equal(ground.damp, 1 | 64); assert.equal(ground.scorch, 32);
    const deep = topology.describe(water, [water, water, water, water], [{ ...water, depth: 'shallow' }, water, water, water]);
    assert.equal(deep.ledge, 16); assert.equal(topology.describe(water, [floor, water, water, water]).coast, 1);
});

test('adjacent liquid tiles agree on one meandering waterline, including corners and bays', () => {
    const { shores } = shoreFixture();
    const pool = ['2,1', '3,1', '4,1', '1,2', '2,2', '3,2', '4,2', '5,2', '1,3', '2,3', '4,3', '5,3', '2,4', '3,4', '4,4', '6,6'];
    const shape = name => { const [x, y] = name.split(',').map(Number); return shores.shape(coastOf(pool, x, y), x, y, true); };
    let compared = 0;
    for (const name of pool) {
        const [x, y] = name.split(',').map(Number), own = shape(name);
        if (pool.includes((x + 1) + ',' + y)) for (let row = 0; row < 32; row++, compared++)
            assert(Math.abs(own.distance[row * 32 + 31] - shape((x + 1) + ',' + y).distance[row * 32]) < 1.6, name + ' east seam ' + row);
        if (pool.includes(x + ',' + (y + 1))) for (let col = 0; col < 32; col++, compared++)
            assert(Math.abs(own.distance[31 * 32 + col] - shape(x + ',' + (y + 1)).distance[col]) < 1.6, name + ' south seam ' + col);
    }
    assert(compared > 500);
});

test('every coast keeps a readable liquid heart, a bank at its edge and an eight-tile period', () => {
    const { shores } = shoreFixture();
    for (let mask = 1; mask < 256; mask++) {
        const shape = shores.shape(mask, 3, 5, true);
        assert(shape.distance[16 * 32 + 16] > 0, 'tile centre stays liquid for mask ' + mask);
        if (mask & 1) assert(shape.distance[16] < 0, 'exposed north edge carries bank');
        if (mask & 8) assert(shape.distance[16 * 32] < 0, 'exposed west edge carries bank');
        for (let n = 0; n < 1024; n++) if (shape.distance[n] < 0) {
            const x = n % 32 + .5, y = Math.floor(n / 32) + .5;
            assert(Math.min(mask & 1 ? y : 99, mask & 2 ? 32 - x : 99, mask & 4 ? 32 - y : 99, mask & 8 ? x : 99,
                Math.hypot(x, y), Math.hypot(32 - x, y), Math.hypot(x, 32 - y), Math.hypot(32 - x, 32 - y)) < 13, 'bank hugs an exposed edge');
        }
    }
    assert.deepEqual(shores.shape(5, -1, 4, true).distance, shores.shape(5, 7, -4, true).distance);
    assert.notDeepEqual(shores.shape(5, 0, 0, true).distance, shores.shape(5, 1, 0, true).distance);
});

test('banks continue neighbouring ground pixels, stay opaque and leave deep interiors alone', () => {
    const { shores } = shoreFixture(), make = (r, g, b) => {
        const data = new Uint8ClampedArray(4096);
        for (let i = 0; i < 4096; i += 4) data.set([r, g, b, 255], i);
        return data;
    };
    const sand = { data: make(200, 170, 120) }, sources = [null, sand, null, null, null, null, null, null, null];
    const water = make(20, 60, 90), bare = make(20, 60, 90);
    const matte = shores.compose(water, 'water', 1, 3, 3, 0, sources);
    const north = 16 * 4;
    assert(water[north] > water[north + 2], 'the northern bank carries warm sand pigment');
    assert(water[north] < 200, 'the bank is wet, not dry sand');
    assert(matte[16] < .3, 'bank pixels keep only a faint wet sheen');
    assert.deepEqual(Array.from(water.slice((31 * 32 + 16) * 4, (31 * 32 + 16) * 4 + 4)), [20, 60, 90, 255], 'deep interior is untouched');
    for (let i = 3; i < 4096; i += 4) assert.equal(water[i], 255);
    shores.compose(bare, 'water', 1, 3, 3, 0, [null, null, null, null, null, null, null, null, null]);
    assert.notDeepEqual(bare, water, 'a wall or feature neighbour falls back to neutral rock');
    const lava = make(190, 90, 30), scorched = make(190, 90, 30);
    shores.compose(lava, 'lava', 1, 3, 3, 0, sources); shores.compose(scorched, 'lava', 4, 3, 3, 0, sources);
    assert(lava[north + 1] < sand.data[1], 'scorched ground burns darker than dry ground');
    assert.notDeepEqual(lava, scorched);
});

test('deep and shallow water share a soft boundary and keep their interiors', () => {
    const { shores } = shoreFixture();
    const deep = shores.shallows(2, 3, 3, 'deep'), shallow = shores.shallows(8, 4, 3, 'shallow');
    for (let row = 0; row < 32; row++) assert(Math.abs(deep[row * 32 + 31] - shallow[row * 32]) < .12, 'tile seam is invisible at row ' + row);
    assert.equal(deep[16 * 32], 0, 'deep interior stays deep');
    assert.equal(shallow[16 * 32 + 31], 1, 'shallow interior stays shallow');
});

test('ground beside a liquid gets one stain per material, omitted away from liquids', () => {
    const { shores, banks, stains } = shoreFixture(), drawn = [];
    const ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage(image, ...rect) { drawn.push({ image, rect }); } };
    const lava = { ...water, surface: 'lava' }, point = { x: 10, y: 20, width: 64, height: 64 };
    const paint = (terrain, x = 3, y = 3) => { drawn.length = 0; banks.paint(ctx, terrain, point, x, y); return drawn.map(entry => entry.image); };
    assert.deepEqual(paint(topology.describe(floor, [floor, floor, floor, floor])), []);
    assert.deepEqual(paint(topology.describe(lava, [floor, lava, lava, lava])), [], 'the liquid composes its own bank');
    const wet = paint(topology.describe(floor, [water, floor, floor, floor]));
    const hot = paint(topology.describe(floor, [lava, floor, floor, floor]));
    assert.equal(wet.length, 1); assert.equal(hot.length, 1); assert.notEqual(wet[0], hot[0]);
    assert.deepEqual(drawn[0].rect, [10, 20, 64, 64], 'stains fill exactly the native tile');
    assert.equal(paint(topology.describe(floor, [water, floor, floor, floor]), 11, -5)[0], wet[0], 'stains repeat with the terrain period');
    assert(stains.length >= 2);
    assert(shores.stain('wet', 1, 3, 3).pixels[(31 * 32 + 16) * 4 + 3] === 0, 'stains fade before the far side of the tile');
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

test('altars, gateways, fungus and fiery creatures light their surroundings only while visible', () => {
    const f = nativeFixture(), tiles = f.result['./tileinfo-dngn'], model = f.result['./premium-terrain-model'];
    const cell = (id, extra = {}, entry = {}) => ({ ...entry, t: { bg: id, ...extra } });
    const zin = model.describe(cell(tiles.DNGN_ALTAR_ZIN)).light, trog = model.describe(cell(tiles.DNGN_ALTAR_TROG)).light;
    assert(zin && trog); assert.notDeepEqual(zin.colour, trog.colour, 'each god keeps its own colour');
    assert(model.describe(cell(tiles.DNGN_ALTAR_ECUMENICAL)).light, 'unlisted altars still glow');
    assert(model.describe(cell(tiles.DNGN_ENTER_ABYSS)).light); assert(model.describe(cell(tiles.DNGN_PORTAL_BAZAAR)).light);
    assert.equal(model.describe(cell(tiles.DNGN_PORTAL_BAZAAR_GONE)).light, null, 'a closed portal goes dark');
    assert.equal(model.describe(cell(tiles.DNGN_STONE_STAIRS_DOWN)).light, null, 'ordinary features stay unlit');
    assert(model.describe(cell(tiles.FLOOR_MOSS, { glowing_mold: true })).light);
    const creature = name => model.describe(cell(tiles.FLOOR_MOSS, { fg: 1 }, { mon: { id: 1, name } })).light;
    for (const name of ['fire elemental', 'hell hound', 'ball lightning', 'storm dragon', 'angel', 'will-o-the-wisp']) assert(creature(name), name);
    for (const name of ['goblin', 'rat', 'orc warrior', 'spiny frog']) assert.equal(creature(name), null, name);
    assert.equal(model.describe({ t: { bg: tiles.FLOOR_MOSS, fg: 1 }, mon: { id: 2 } }).light, null, 'nameless creatures stay unlit');
    assert.equal(model.describe(cell(tiles.DNGN_ALTAR_ZIN + 0x40000)), null);
    assert.equal(model.describe({ t: { bg: tiles.DNGN_ALTAR_ZIN + 0x40000 } }, { remembered: true }).light, null, 'a remembered altar emits nothing');
});

test('flooded features join their water and shade as shallow water beneath the feature', () => {
    const f = nativeFixture(), tiles = f.result['./tileinfo-dngn'], model = f.result['./premium-terrain-model'];
    const mangrove = model.describe({ t: { bg: tiles.DNGN_SHALLOW_WATER, mangrove_water: true } });
    assert.equal(mangrove.surface, null); assert.equal(mangrove.waterlogged, true);
    const flooded = model.flooded(mangrove);
    assert.equal(flooded.surface, 'water'); assert.equal(flooded.depth, 'shallow'); assert.equal(flooded.index, tiles.DNGN_SHALLOW_WATER);
    assert.equal(mangrove.surface, null, 'the original description is untouched');
    const shallow = { ...water, depth: 'shallow' }, others = [shallow, shallow, shallow, shallow];
    assert.equal(topology.describe(shallow, [mangrove, ...others.slice(1)]).shore, 0, 'no bank between a pool and the mangroves standing in it');
    assert.equal(topology.describe(water, [mangrove, ...[water, water, water]]).depth, 1, 'deep water still meets their shallows');
    assert.equal(topology.describe(floor, [mangrove, floor, floor, floor]).wet, 1, 'ground beside them is still damp');
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
    f.load('liquid-field', true); f.load('shore-field', true, { document });
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
    for (const name of ['tile-edges', 'terrain-topology', 'liquid-field', 'shore-field', 'fluid-surface', 'shoreline-paint', 'terrain-finish',
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
