/* The recovery ring stays under its hero on every canvas the actor reaches. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../game_data/static');

function load(file, deps, globals) {
    let value;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
        ...globals, define(names, factory) { value = factory(...names.map(name => deps[name])); }
    });
    return value;
}
function recordingContext(log, name) {
    return new Proxy({ canvas: { width: 320, height: 320 } }, {
        get(target, key) {
            if (key in target) return target[key];
            // Only the recovery arc starts at the top; the hero outline is a full circle.
            if (key === 'arc') return (x, y, radius, start) => { if (start === -Math.PI / 2) log.push('ring:' + name); };
            if (key === 'measureText') return () => ({ width: 10 });
            return () => {};
        },
        set(target, key, value) { target[key] = value; return true; }
    });
}
function fixture(member, mode = 'tiles', paintActor = (renderer, cx, cy, x, y, cell, paint) => paint()) {
    const log = [];
    const window = { devicePixelRatio: 1, crawl_party: { state: { members: [member] } } };
    const $ = () => ({ off() { return this; }, on() { return this; } });
    Object.assign($, { extend: Object.assign, toJSON: JSON.stringify,
        each(list, callback) { Array.from(list).forEach((value, index) => callback(index, value)); } });
    const overlays = load('cell-renderer-overlays.js', { './view_data': { cursor_locs: [] }, './enums': { CURSOR_MOUSE: 0 } }, { window });
    const layers = { in_water: () => false, paintActor, paintEffect() {}, methods: {
        draw_background() {}, draw_foreground() { log.push('foreground'); }, render_flash() {} } };
    const flags = value => (value && typeof value === 'object' ? value : { value });
    const { DungeonCellRenderer } = load('cell_renderer.js', {
        jquery: $, './view_data': { cursor_locs: [] }, './tileinfo-main': { MAIN_MAX: 100 },
        './tileinfo-player': { MCACHE_START: 100000 }, './tileinfo-icons': {}, './tileinfo-dngn': {},
        './enums': { prepare_fg_flags: flags, prepare_bg_flags: flags },
        './map_knowledge': { player_on_level: () => false, get: () => ({}) }, './player': { pos: { x: -1, y: -1 } },
        './options': { get: () => mode }, './cell-renderer-glyphs': { methods: {
            render_glyph() { log.push('glyph'); } } },
        './cell-renderer-overlays': overlays, './cell-renderer-layers': layers,
        './cell-renderer-textures': { draw_player() { log.push('sprite:' + this.ctx.name); } },
        './shell-animation': { draw: () => false }, 'contrib/jquery.json': {}
    }, { window, document: {} });
    const renderer = new DungeonCellRenderer();
    renderer.ctx = recordingContext(log, 'base');
    renderer.ctx.name = 'base';
    const cell = { fg: 1000, bg: 0, cloud: 0, doll: [[1, 32]] };
    return { log, renderer, draw: () => renderer.do_render_cell(4, 5, 0, 0, { g: '@', col: 7, t: cell }, cell) };
}
const recovering = { slot: 0, name: 'Host', alive: true, active: true, pos: { x: 4, y: 5 },
    aut_lead: 10, last_action_aut: 10 };

test('a recovering hero is painted over the ring on the shared canvas', () => {
    const { log, draw } = fixture(recovering);
    draw();
    assert.deepEqual(log, ['ring:base', 'ring:base', 'sprite:base', 'foreground']);
});

test('sprite motion carries the ring with the sprite and leaves the floor canvas clear', () => {
    const buffer = {};
    const { log, draw } = fixture(recovering, 'tiles', (renderer, cx, cy, x, y, cell, paint) => {
        const original = renderer.ctx;
        renderer.ctx = buffer.ctx;
        try { paint(); } finally { renderer.ctx = original; }
    });
    buffer.ctx = recordingContext(log, 'sprite-layer');
    buffer.ctx.name = 'sprite-layer';
    draw();
    assert.deepEqual(log, ['ring:sprite-layer', 'ring:sprite-layer', 'sprite:sprite-layer', 'foreground']);
});

test('heroes without recovery, elsewhere or on another floor draw no ring', () => {
    for (const member of [{ ...recovering, aut_lead: 0 }, { ...recovering, pos: { x: 5, y: 5 } },
        { ...recovering, on_same_level: false }]) {
        const { log, draw } = fixture(member);
        draw();
        assert.deepEqual(log, ['sprite:base', 'foreground']);
    }
});

test('glyph mode has no actor to hide behind, so the ring follows the glyph', () => {
    const { log, draw } = fixture(recovering, 'glyphs');
    draw();
    assert.deepEqual(log, ['glyph', 'ring:base', 'ring:base']);
});
