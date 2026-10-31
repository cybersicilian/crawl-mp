const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function load(file, deps = {}, globals = {}) {
    let value;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
        ...globals, define(names, factory) { value = factory(...names.map(name => deps[name])); }
    });
    return value;
}
const sampling = load('static/scripts/light-field-sampling.js');
const materials = load('static/scripts/material-response.js');
const emission = load('static/scripts/light-emission.js');
const shade = load('static/scripts/surface-lighting.js', { 'light-field-sampling': sampling, 'material-response': materials, 'light-emission': emission });
const field = load('static/scripts/liquid-field.js');
const geometry = load('static/scripts/tile-lighting.js');
const light = (x, extra = {}) => ({ x, y: 0, radius: 4, strength: .19, colour: [255, 150, 65], ...extra });

test('surface shading preserves alpha and albedo while responding to light colour and relief direction', () => {
    const input = new Uint8ClampedArray([35, 35, 35, 80, 65, 65, 65, 160, 95, 95, 95, 255,
        125, 125, 125, 255, 155, 155, 155, 0]);
    const original = input.slice(), prepared = shade.prepare(input, 5, 1);
    const left = shade.shade(prepared, 'stone', 0, 0, [light(-1)]);
    const right = shade.shade(prepared, 'stone', 0, 0, [light(1)]);
    assert(left[8] > right[8], 'albedo relief catches light from its facing side');
    assert(left[8] > left[10], 'warm light tints material rather than adding a flat halo');
    assert.deepEqual(input, original);
    for (let i = 3; i < input.length; i += 4) assert.equal(left[i], input[i]);
    const blue = shade.shade(prepared, 'wall', 0, 0, [light(-1, { colour: [60, 150, 255] })]);
    assert(blue[10] > blue[8]);
    assert.deepEqual(Array.from(shade.shade(prepared, 'lava', 0, 0, [])), Array.from(input), 'emissive fluid cannot be darkened by ambient light');
    const darkWater = shade.prepare(new Uint8ClampedArray([5, 30, 80, 255]), 1, 1);
    const wet = shade.shade(darkWater, 'water', 0, 0, [light(-1)]);
    const dry = shade.shade(darkWater, 'stone', 0, 0, [light(-1)]);
    assert(wet[0] > dry[0] + 2, 'a warm wet reflection must survive a dark blue albedo');
});

test('visible wall faces receive light while blocking tiles behind them', () => {
    const result = geometry.create({ x: 0, y: 0, cols: 7, rows: 5 }, (x, y) => ({
        visible: true, solid: x === 3, light: x === 1 && y === 2 ? { radius: 4, strength: .19, colour: [255, 150, 65] } : null
    }));
    assert.equal(result.at(3, 2).length, 1);
    assert.equal(result.at(4, 2).length, 0);
    assert.equal(result.at(50, 50).length, 0);
});

test('liquid noise and colours are continuous across tile seams and repeat without a phase jump', () => {
    for (const lava of [false, true]) {
        for (const phase of [0, 17, 255]) {
            const a = field.sample(32 - .00001, 19.4, phase, lava);
            const b = field.sample(32 + .00001, 19.4, phase, lava);
            assert(Math.abs(a.height - b.height) < .0001);
            assert(a.colour.every((channel, index) => Math.abs(channel - b.colour[index]) < .01));
            const repeated = field.sample(32 - .00001, 19.4, phase + 256, lava);
            assert(Math.abs(a.height - repeated.height) < .00001);
            assert(a.colour.every((channel, index) => Math.abs(channel - repeated.colour[index]) < .001));
        }
    }
    for (let x = 0; x < 128; x += 13) for (let y = 0; y < 128; y += 17) {
        const a = field.sample(x, y, 12, true), b = field.sample(x, y, 268, true);
        assert(a.colour.every((channel, index) => Math.abs(channel - b.colour[index]) < .001), 'hotspots must repeat with the flow field');
    }
});

test('wave normals share world-space derivatives across tiles, animate, and preserve wrapped seams', () => {
    const a = field.normals(30, 8, 17, 4, 2), b = field.normals(32, 8, 17, 2, 2);
    for (let row = 0; row < 2; row++) for (let n = 0; n < 4; n++)
        assert.equal(a[row * 8 + 4 + n], b[row * 4 + n]);
    assert.deepEqual(field.normals(-2, 8, 17, 4, 2), field.normals(254, 8, 273, 4, 2));
    assert.notDeepEqual(a, field.normals(30, 8, 18, 4, 2));
    const pixels = new Uint8ClampedArray([20, 50, 80, 255]);
    const left = shade.prepare(pixels, 1, 1, new Float32Array([-.5, 0]));
    const right = shade.prepare(pixels, 1, 1, new Float32Array([.5, 0]));
    assert(shade.shade(left, 'water', 0, 0, [light(-1)])[0]
        > shade.shade(right, 'water', 0, 0, [light(-1)])[0], 'wave slopes steer the reflection independently of pigment');
});

test('emission is source-coherent, continuous, bounded and static when motion is disabled', () => {
    const source = Object.freeze(light(2, { y: 3, variation: .08 }));
    const levels = new Set();
    for (let time = 0; time < 10000; time += 100) {
        const level = emission.level(source, time, true); levels.add(level);
        assert(level >= .92 && level <= 1.08);
        assert.equal(emission.sample(source, time, true).strength, source.strength * level);
        assert.equal(emission.level(source, time, false), 1);
        assert.equal(emission.level({ ...source, animated: false }, time, true), 1);
    }
    assert(levels.size > 50);
    for (let time = 0; time < 5000; time += 10)
        assert(Math.abs(emission.level(source, time + 1, true) - emission.level(source, time, true)) < .001,
            'brightness has no quantization jumps');
    assert.equal(source.strength, .19);
});

test('native atlas sampling stays at 32 pixels across device scales and keeps the active art transform', () => {
    for (const ratio of [1, 1.25, 2]) {
        const original = {}, selectedPack = {}, calls = [];
        const tiles = { get_tile_info: () => ({ sx: 10, sy: 20, ex: 42, ey: 52, ox: 0, oy: 0, w: 32, h: 32 }),
            get_img: () => 'floor' };
        const textures = load('game_data/static/cell-renderer-textures.js', {
            jquery: () => [original], './tileinfo-dngn': tiles, './options': { get: () => false },
            './tile-art-direction': { image(id, source) { assert.equal(id, 'floor'); assert.equal(source, original); return selectedPack; } }
        }, { window: { devicePixelRatio: ratio }, document: { getElementById: id => id === 'floor' ? original : null } });
        const sample = Object.assign({ ctx: { drawImage: (...args) => calls.push(args) },
            x_scale: 1 / ratio, y_scale: 1 / ratio, current_left_overlap: 0, current_sy: 0 }, textures);
        sample.draw_dngn(1, 0, 0);
        assert.equal(calls[0][0], selectedPack);
        assert.deepEqual(calls[0].slice(5), [0, 0, 32, 32]);
    }
});

test('shared field includes offscreen visible emitters, filters overlay bounds and invalidates on native terrain changes', () => {
    const cells = new Map(), events = {}, touched = [];
    for (let y = -5; y < 8; y++) for (let x = -5; x < 8; x++) cells.set(`${x}:${y}`, { visible: true, solid: false });
    cells.get('-1:1').light = { radius: 4, strength: .2, colour: [255, 150, 60] };
    const $ = () => ({ on(names, fn) { names.split(' ').forEach(name => { events[name.split('.')[0]] = fn; }); return this; } });
    const document = {};
    const shared = load('game_data/static/premium-light-field.js', { jquery: $,
        './map_knowledge': { get: (x, y) => cells.get(`${x}:${y}`), touch: (x, y) => touched.push([x, y]) },
        './premium-terrain-model': { describe: cell => cell && cell.visible ? cell : null },
        './options': { get: () => true, add_listener() {} }, 'tile-lighting': geometry,
        'visual-presentation': { premium: () => true, enabled: () => true }, 'light-emission': emission }, { document });
    const view = { view: { x: 0, y: 0 }, cols: 3, rows: 3 }, first = shared.forView(view);
    assert(first.at(0, 1).length);
    assert(first.cells.every(cell => cell.x >= 0 && cell.y >= 0 && cell.x < 3 && cell.y < 3));
    assert.equal(shared.forView(view), first);
    cells.get('-1:1').visible = false;
    events.map_knowledge_changed({}, [{ x: -1, y: 1 }]);
    assert.equal(shared.forView(view).at(0, 1).length, 0);
    assert(touched.length > 0, 'source removal repaints affected known terrain');
});

test('subtile occlusion interpolates within visible receivers and range falloff has a smooth edge', () => {
    const grid = [0, .5, 1, 0, .5, 1, 0, .5, 1];
    assert.equal(sampling.coverage(grid, 0, .5), 0);
    assert.equal(sampling.coverage(grid, .25, .5), .25);
    assert.equal(sampling.coverage(grid, 1, .5), 1);
    assert.equal(sampling.falloff(4, 4), 0);
    assert(sampling.falloff(3.999, 4) < .000001);
    const result = geometry.create({ x: 0, y: 0, cols: 7, rows: 5 }, (x, y) => ({
        visible: true, solid: x === 3, light: x === 1 && y === 2 ? light(1, { y: 2, radius: 6 }) : null
    }));
    assert(result.at(2, 2)[0].visibility.length === 9);
    assert.equal(result.at(4, 2).length, 0, 'soft coverage never makes a receiver behind a solid wall');
});
