const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function fixture(legacySampler=false) {
    let painter, last;
    const document = {createElement: () => {
        const canvas = {width: 0, height: 0};
        canvas.getContext = () => ({
            createImageData: (w, h) => ({data: new Uint8ClampedArray(w * h * 4)}),
            putImageData: image => {canvas.pixels = image.data.slice();}
        });
        return canvas;
    }};
    const profile = {colour: [246, 191, 87], edge: [255, 225, 151], fill: .055,
        rim: .24, motion: .008, speed: 1.4, circular: true};
    const entry = {t: {}};
    const modules = {
        jquery: () => ({on() {return this;}}),
        './cell-renderer-layers': {addTerrainPainter: fn => {painter = fn;}, addRegionPainter() {}},
        './premium-region-model': {profiles: {halo: profile}, describe: () => [{kind: 'halo'}], visible: () => true},
        './map_knowledge': {get: () => entry},
        './options': {ready: () => true, get: name => name === 'tile_display_mode' ? 'tiles' : true, add_listener() {}},
        './game-context': {get_ui_state: () => 0}, './enums': {ui: {NORMAL: 0}},
        'visual-presentation': {enabled: name => name === 'auras', animated: () => false},
        './premium-terrain': {}, 'aura-distortion': {}, 'pixel-sampling': {}, 'idle-work': null
    };
    function load(name, file) {
        vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
            document, window: {matchMedia: () => ({matches: false, addEventListener() {}})},
            define: (names, factory) => {modules[name] = factory(...names.map(key => modules[key]));}
        });
        return modules[name];
    }
    const sampler=load('region-field', 'static/scripts/region-field.js');
    if(legacySampler){delete sampler.prepareCircle;delete sampler.circlePixels;}
    load('weighted-cache', 'static/scripts/weighted-cache.js');
    const regions = load('regions', 'game_data/static/premium-regions.js');
    const renderer = {view: {x: 0, y: 0}, cols: 3, rows: 3, frame_time: 0,
        scaled_size: () => ({width: 32, height: 32}),
        ctx: {save() {}, restore() {}, drawImage: image => {last = image;}}};
    return {regions, renderer, draw() {painter(renderer, 4, 1, 0, 0); return last;}};
}
test('same-center aura coverage after camera resize matches a fresh render', () => {
    const f = fixture(), small = f.draw();
    f.renderer.view = {x: -1, y: -1}; f.renderer.cols = f.renderer.rows = 5;
    const enlarged = f.draw();
    assert.equal(f.regions.cacheStats().circleGeometry.bytes,2*32*32*28,'both geometry templates are counted');
    f.regions.clear();
    assert.equal(f.regions.cacheStats().circleGeometry.bytes,0,'clear releases geometry retention');
    const fresh = f.draw();
    assert.notDeepEqual(small.pixels, fresh.pixels, 'changed radius changes the visible aura');
    assert.deepEqual(enlarged.pixels, fresh.pixels, 'camera resize cannot reuse the old radius');
    assert.equal(f.draw(), fresh, 'unchanged geometry retains its cached frame');
});
test('older shared sampler exports retain identical aura pixels without geometry allocation', () => {
    const current=fixture(),legacy=fixture(true);
    assert.deepEqual(legacy.draw().pixels,current.draw().pixels);
    assert.equal(legacy.regions.cacheStats().circleGeometry.entries,0);
});
