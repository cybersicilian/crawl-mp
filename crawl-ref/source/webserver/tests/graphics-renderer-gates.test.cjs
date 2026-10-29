const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function load(file, deps, globals = {}) {
    let value;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { ...globals,
        define(names, factory) { value = factory(...names.map(name => deps[name])); } });
    return value;
}
const noop = () => {};
const ctx = { save: noop, restore: noop, beginPath: noop, rect: noop, clip: noop };
test('disabled terrain borders and liquid shaders allocate neither fluid frames nor banks', () => {
    const calls = [], terrain = { own: { surface: 'water' } };
    const finish = load('static/scripts/terrain-finish.js', {
        'tile-edges': { paint() { calls.push('edges'); } },
        'fluid-surface': { create() { return { tile() { calls.push('fluid'); }, clear: noop }; } },
        'shoreline-paint': { paint() { calls.push('banks'); } }
    }).create();
    finish.paint(ctx, terrain, { x: 0, y: 0, width: 32, height: 32 }, 0, 0, 0, { liquids: false, borders: false });
    assert.deepEqual(calls, []);
    finish.paint(ctx, terrain, { x: 0, y: 0, width: 32, height: 32 }, 0, 0, 0, { liquids: true, borders: false });
    assert.deepEqual(calls, ['fluid']);
});
test('lighting and particles can be disabled independently without painting a darkness mask', () => {
    const calls = [];
    const painter = load('static/scripts/tile-lighting-paint.js', {
        'tile-atmosphere': { paint(c, s, p, t, enabled) { if (enabled) calls.push('particles'); } },
        'light-map-paint': { paint() { calls.push('light'); } },
        'emissive-paint': {}, 'visibility-feather': { paint() { calls.push('mask'); } }
    });
    const scene = { cells: [], floors: [], lights: [] };
    painter.paint(ctx, scene, noop, 0, true, { lighting: false, particles: true, borders: false });
    assert.deepEqual(calls, ['particles']); calls.length = 0;
    painter.paint(ctx, scene, noop, 0, true, { lighting: true, particles: false, borders: false });
    assert.deepEqual(calls, ['light', 'mask']);
});
test('disabled reflection, bloom and fire shading skip every emission buffer', () => {
    let reflectionCalls = 0;
    const paint = load('static/scripts/emissive-paint.js', {
        'surface-reflections': { create() { return { tile() { reflectionCalls++; }, clear: noop }; } }
    });
    const stats = paint.paint(ctx, { cells: [{ x: 0, y: 0, surface: 'water', emission: { type: 'flame' } }], lights: [] }, noop, 0, true,
        { reflections: false, bloom: false, spells: false });
    assert.equal(reflectionCalls, 0); assert.equal(stats.reflections + stats.blooms + stats.flames, 0);
});
test('disabled clouds and spells fall back before atlas reads; reduced motion stops fast effects', () => {
    const flags = { clouds: false, spells: false, materials: false, auras: false };
    let animated = true;
    const effects = load('game_data/static/premium-effects.js', {
        jquery: () => ({ on() { return this; } }), './cell-renderer-layers': { addEffectPainter: noop },
        './premium-effect-model': { describe: () => ({}) }, './premium-terrain-model': { describe: () => ({}) },
        './options': { ready: () => true, get: key => key === 'tile_display_mode' ? 'tiles' : true },
        './enums': { ui: { NORMAL: 0 } }, './game-context': { get_ui_state: () => 0 },
        'visual-presentation': { premium: () => true, enabled: key => flags[key] === true, animated: () => animated }
    }, { document: { hidden: false, createElement() { throw Error('Disabled shader read the atlas'); } },
        window: { matchMedia: () => ({ matches: false, addEventListener: noop }) } });
    assert.equal(effects.draw({ view: {} }, 1, 'cloud', 0, 0, 0, 0), false);
    assert.equal(effects.draw({ view: {} }, 1, 'overlay', 0, 0, 0, 0), false);
    assert.equal(effects.fast(), false); flags.clouds = true; assert.equal(effects.fast(), true);
    animated = false; assert.equal(effects.fast(), false);
});
test('terrain CPU shading is bypassed when no terrain enhancement or distortion is enabled', () => {
    const terrain = load('game_data/static/premium-terrain.js', {
        jquery: () => ({ on() { return this; } }), './cell-renderer-layers': { addTerrainPainter: noop, addSurfacePainter: noop },
        './options': { ready: () => true, get: () => 'tiles', add_listener: noop },
        './game-context': { get_ui_state: () => 0 }, './enums': { ui: { NORMAL: 0 } },
        'visual-presentation': { premium: () => true, enabled: () => false },
        'terrain-finish': { create: () => ({}) }, './map_knowledge': { get() { throw Error('Disabled shading queried terrain'); } }
    }, { document: {}, window: { matchMedia: () => ({ matches: false, addEventListener: noop }) } });
    assert.equal(terrain.frame({ view: {} }, 0, 0), undefined);
});
test('reflection toggle removes material specular light while retaining diffuse illumination and alpha', () => {
    const sampling = load('static/scripts/light-field-sampling.js', {});
    const materials = load('static/scripts/material-response.js', {});
    const emission = load('static/scripts/light-emission.js', {});
    const shader = load('static/scripts/surface-lighting.js', {
        'light-field-sampling': sampling, 'material-response': materials, 'light-emission': emission
    });
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let n = 0; n < data.length; n += 4) data.set([20, 30, 40, 255], n);
    const surface = shader.prepare(data, 4, 4), lights = [{ x: 0, y: 0, radius: 4, strength: .3, colour: [255, 100, 30] }];
    const reflected = shader.shade(surface, 'water', 0, 0, lights, 0);
    const matte = shader.shade(surface, 'water', 0, 0, lights, 0, { reflections: false });
    assert.notDeepEqual(reflected, matte);
    for (let n = 0; n < matte.length; n++) {
        if (n % 4 === 3) assert.equal(matte[n], 255);
        else assert(matte[n] <= reflected[n]);
    }
});
