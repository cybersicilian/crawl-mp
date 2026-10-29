const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function fixture() {
    const events = new Map(), document = {}, window = {};
    function jquery() { return { on(names, fn) {
        for (const name of names.split(' ')) {
            const key = name.split('.')[0]; if (!events.has(key)) events.set(key, []); events.get(key).push(fn);
        }
        return this;
    } }; }
    jquery.extend = Object.assign;
    const modules = { jquery, 'texture-pack': { illustrated: () => true } };
    function load(name, shared = false) {
        vm.runInNewContext(fs.readFileSync(path.join(root, shared ? 'static/scripts' : 'game_data/static', name + '.js'), 'utf8'), {
            document, window, Map, assert, define(deps, factory) {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                modules[(shared ? '' : './') + name] = factory(...deps.map(dep => modules[dep]));
            }
        });
    }
    load('tile-edges', true);
    for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-dngn', 'terrain-materials', 'enums']) load(name);
    const cells = new Map(), touched = [];
    modules['./map_knowledge'] = { get: (x, y) => cells.get(x + ':' + y) || {}, touch: (x, y) => touched.push([x, y]) };
    load('terrain-edges');
    return { modules, cells, touched, emit: (name, changes) => (events.get(name) || []).forEach(fn => fn({}, changes)) };
}
test('all 16 cardinal boundary combinations are exact and unknown neighbours never reveal geometry', () => {
    const edges = fixture().modules['tile-edges'];
    for (let mask = 0; mask < 16; mask++) {
        const neighbours = [1, 2, 4, 8].map(bit => mask & bit ? 'floor' : 'wall');
        assert.equal(edges.mask('wall', neighbours, (a, b) => a === b), mask);
    }
    assert.equal(edges.mask('wall', [null, undefined, 'wall', null], (a, b) => a === b), 0);
    assert.equal(edges.mask(null, ['floor', 'floor', 'floor', 'floor'], () => false), 0);
});
test('edge paint snaps to device pixels, stays inset and restores caller drawing state', () => {
    const edges = fixture().modules['tile-edges'], calls = [];
    let saved = 0, restored = 0;
    const ctx = { save() { saved++; }, restore() { restored++; }, fillRect: (...args) => calls.push(args) };
    edges.paint(ctx, { x: 12, y: 24, width: 64, height: 64 }, 15, { width: 1, shadow: '#000', light: '#fff' });
    assert.equal(saved, 1); assert.equal(restored, 1); assert.equal(calls.length, 6);
    for (const [x, y, w, h] of calls) {
        assert([x, y, w, h].every(Number.isInteger)); assert(x >= 12 && y >= 24 && x + w <= 76 && y + h <= 88);
    }
});
test('native visibility gates edges and terrain changes invalidate only affected known neighbours', () => {
    const f = fixture(), tiles = f.modules['./tileinfo-dngn'], adapter = f.modules['./terrain-edges'];
    const set = (x, y, bg) => f.cells.set(x + ':' + y, { t: { bg } });
    set(4, 4, tiles.WALL_STONE_GRAY); set(4, 5, tiles.FLOOR_GREY_DIRT);
    set(5, 4, { value: tiles.FLOOR_GREY_DIRT, UNSEEN: true });
    set(4, 3, tiles.WALL_BRICK_DARK_4);
    const calls = [], renderer = { scaled_size: () => ({ width: 64, height: 64 }),
        ctx: { save() {}, restore() {}, fillRect: (...args) => calls.push(args) } };
    adapter.draw(renderer, 4, 4, 0, 0);
    assert.equal(calls.length, 1, 'Only the visible south floor creates a wall lip');
    assert.deepEqual(calls[0], [0, 62, 64, 2]);
    f.emit('map_knowledge_changed', [{ x: 4, y: 4 }]); assert.deepEqual(f.touched, [[4, 3], [5, 4], [4, 5]]);
    f.touched.length = 0; f.emit('map_knowledge_changed', [{ x: 4, y: 4 }]);
    assert.equal(f.touched.length, 0, 'Actor-only updates do not expand the terrain redraw');
    set(4, 4, tiles.FLOOR_GREY_DIRT); f.emit('map_knowledge_changed', [{ x: 4, y: 4 }]);
    assert.equal(f.touched.length, 3, 'Digging/revealing a neighbour redraws the shared border');
    calls.length = 0; adapter.draw(renderer, 4, 3, 0, 0);
    assert.equal(calls.length, 0, 'Unconfigured native masonry connects but retains its original art');
    calls.length = 0; set(4, 4, { value: tiles.WALL_STONE_GRAY, MM_UNSEEN: true });
    adapter.draw(renderer, 4, 4, 0, 0); assert.equal(calls.length, 0);
    f.emit('game_cleanup');
});
