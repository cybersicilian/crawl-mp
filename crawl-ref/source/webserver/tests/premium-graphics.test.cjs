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
const noise = load('static/scripts/liquid-field.js');
const sampling = load('static/scripts/light-field-sampling.js');
const vapour = load('static/scripts/vapour-field.js', { 'liquid-field': noise, 'light-field-sampling': sampling });
const shader = load('static/scripts/effect-shading.js', { 'liquid-field': noise, 'light-field-sampling': sampling, 'vapour-field': vapour });
const materials = load('static/scripts/material-response.js');
const emission = load('static/scripts/light-emission.js');
const surfaces = load('static/scripts/surface-lighting.js', { 'light-field-sampling': sampling, 'material-response': materials, 'light-emission': emission });
const tiles = { CLOUD_MIST: 1, CLOUD_GREY_SMOKE: 2, CLOUD_POISON: 3, CLOUD_FIRE: 4,
    BOLT_FLAME: 5, BOLT_FROST: 6, BOLT_STRONG_ELEC: 7, BOLT_IRON_SHOT: 8, BOLT_FIRE_STORM: 9, MI_ARROW2: 10,
    get_tile_info: id => ({ w: id === 9 ? 64 : 32, h: 32 }) };
const model = load('game_data/static/premium-effect-model.js', { './tileinfo-main': tiles });
function pixels() {
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) data.set([90, 110, 140, 180], (y * 16 + x) * 4);
    return data;
}
test('native cloud and spell families select distinct profiles and oversized art stays native', () => {
    assert.notEqual(model.describe(1, 'cloud'), model.describe(2, 'cloud'));
    assert.notEqual(model.describe(2, 'cloud'), model.describe(3, 'cloud'));
    assert.equal(model.describe(4, 'cloud').emission, .65);
    assert.equal(model.describe(5, 'overlay').colour[0], 255);
    assert.equal(model.describe(8, 'overlay').mode, 'projectile');
    assert.equal(model.describe(10, 'overlay').mode, 'projectile');
    assert.equal(model.describe(9, 'overlay'), undefined);
    assert.equal(model.describe(1, 'overlay'), undefined);
    assert.equal(model.describe(88, 'cloud'), undefined);
});
test('vapour density and silhouettes advect within the native cell and respond to occluded light', () => {
    const data = pixels(), before = data.slice(), source = shader.prepare(data, 16, 16), profile = model.describe(1, 'cloud');
    const a = shader.shade(source, profile, 2, 3, 0, []), b = shader.shade(source, profile, 2, 3, 19, []);
    assert.notDeepEqual(a, b); assert.deepEqual(data, before);
    for (let n = 3; n < data.length; n += 4) {
        assert(a[n] <= 180);
    }
    assert.equal(a[3], 0, 'bounded advection cannot reach distant empty pixels');
    assert(a.some((value, n) => n % 4 === 3 && !data[n] && value > 0), 'the silhouette billows instead of remaining frozen');
    const light = { x: 2, y: 3, radius: 4, strength: .3, colour: [255, 50, 10] };
    const lit = shader.shade(source, profile, 2, 3, 0, [light]);
    const blocked = shader.shade(source, profile, 2, 3, 0, [{ ...light, visibility: new Array(9).fill(0) }]);
    assert.deepEqual(a, blocked); assert(lit[(8 * 16 + 8) * 4] > a[(8 * 16 + 8) * 4]);
    assert.deepEqual(a, shader.shade(source, profile, 2, 3, 0, []), 'static motion time is deterministic');
});
test('spell and projectile halos retain the native core and a bounded two-pixel extent', () => {
    const data = pixels(), source = shader.prepare(data, 16, 16);
    for (const id of [5, 6, 7, 8, 10]) {
        const shaded = shader.shade(source, model.describe(id, 'overlay'), 0, 0, 7, []);
        assert(shaded[(8 * 16 + 8) * 4 + 3] >= 180);
        assert(shaded[(3 * 16 + 8) * 4 + 3] > 0);
        assert.equal(shaded[3], 0);
        if (id === 10) assert.equal(shaded[(3 * 16 + 8) * 4 + 2], 140, 'Physical projectile halos retain their native pigment');
    }
});
test('rough masonry and moss remain matte while metal and crystal reflect light', () => {
    const source = surfaces.prepare(new Uint8ClampedArray([35, 35, 35, 123]), 1, 1);
    const light = { x: 0, y: 0, radius: 4, strength: .2, colour: [255, 170, 80] };
    const values = Object.fromEntries(['stone', 'brick', 'moss', 'wood', 'metal', 'crystal'].map(name =>
        [name, surfaces.shade(source, name, 0, 0, [light])]));
    assert(values.metal[0] > values.brick[0] + 5); assert(values.crystal[0] > values.moss[0] + 5);
    for (const value of Object.values(values)) assert.equal(value[3], 123);
    assert(Object.isFrozen(materials.profiles.metal));
});
test('shader backend declines unsupported WebGL once, leaving CPU rendering available', () => {
    let created = 0;
    const backend = load('static/scripts/shader-atlas.js', {}, { document: { createElement() {
        created++; return { addEventListener() {}, getContext: () => null };
    } } }).create('shader', 256, 512);
    assert.equal(backend.render({ phase: 0 }), null); assert.equal(backend.render({ phase: 1 }), null);
    assert.equal(backend.status().backend, 'fallback'); assert.equal(created, 1);
    backend.dispose(); assert.equal(backend.render({ phase: 2 }), null);
});
test('effect hooks fall back to exact native drawing and can be removed independently', () => {
    const layers = load('game_data/static/cell-renderer-layers.js'), calls = [];
    const renderer = { draw_main: (...args) => calls.push(['native', ...args]) };
    const remove = layers.addEffectPainter((r, id, kind) => { if (kind !== 'cloud') return false; calls.push(['cloud', id]); return true; });
    layers.paintEffect(renderer, 2, 'cloud', 1, 1, 32, 32);
    layers.paintEffect(renderer, 5, 'overlay', 1, 1, 32, 32);
    remove(); layers.paintEffect(renderer, 2, 'cloud', 1, 1, 32, 32);
    assert.deepEqual(calls, [['cloud', 2], ['native', 5, 32, 32], ['native', 2, 32, 32]]);
});
test('native cloud front/back clips and spell ordering retain alpha, actors and target markers', () => {
    const calls = [], $ = () => ({ off() { return this; }, on() { return this; } });
    Object.assign($, { extend: Object.assign, toJSON: JSON.stringify,
        each: (items, fn) => items.forEach((item, i) => fn(i, item)) });
    const options = { get: () => 'tiles' }, main = { MAIN_MAX: 100 }, dngn = { FEAT_MAX: 0 };
    const enums = { prepare_bg_flags: value => typeof value === 'object' ? value : { value },
        prepare_fg_flags: value => typeof value === 'object' ? value : { value } };
    const layers = load('game_data/static/cell-renderer-layers.js', { jquery: $, './tileinfo-main': main,
        './tileinfo-icons': {}, './tileinfo-dngn': dngn, './enums': enums, './options': options,
        './terrain-edges': {}, './environment-ground': {} });
    layers.addEffectPainter((renderer, id, kind) => { calls.push([kind, renderer.ctx.globalAlpha]); return true; });
    const Cell = load('game_data/static/cell_renderer.js', { jquery: $, './view_data': {}, './tileinfo-main': main,
        './tileinfo-player': { MCACHE_START: 1000 }, './tileinfo-icons': {}, './tileinfo-dngn': dngn,
        './enums': enums, './map_knowledge': {}, './player': { pos: { x: 0, y: 0 } }, './options': options,
        './cell-renderer-glyphs': { methods: {} }, './cell-renderer-overlays': {}, './cell-renderer-layers': layers,
        './cell-renderer-textures': {}, './shell-animation': { draw: () => false } }, { document: {}, window: { devicePixelRatio: 1 } }).DungeonCellRenderer;
    const renderer = new Cell(), stack = [];
    renderer.ctx = { globalAlpha: 1, fillRect() {}, beginPath() {}, rect() {}, clip() {},
        save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); } };
    renderer.element = { width: 128, height: 128 }; renderer.draw_background = () => {};
    renderer.draw_player = () => calls.push(['actor', renderer.ctx.globalAlpha]);
    renderer.render_flash = () => calls.push(['flash', renderer.ctx.globalAlpha]);
    renderer.render_cursors = () => calls.push(['cursor', renderer.ctx.globalAlpha]); renderer.render_party_overlays = () => {};
    renderer.do_render_cell(2, 1, 64, 32, { x: 2, y: 1,
        t: { bg: { value: 20 }, fg: 200, doll: [[5, 0]], cloud: 30, ov: [40] } });
    assert.deepEqual(calls, [['cloud', .6], ['cloud', .2], ['actor', 1], ['cloud', .4], ['cloud', .8],
        ['overlay', 1], ['flash', 1], ['cursor', 1]]);
    assert.equal(renderer.ctx.globalAlpha, 1); assert.equal(stack.length, 0);
});
