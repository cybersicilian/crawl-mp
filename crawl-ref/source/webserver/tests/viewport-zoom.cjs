/* Real renderer sizing and hit testing, independent of a native game process. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../game_data/static');
const levels = [.5, .75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

function fixture(ratio) {
    const document = {}, viewport = { id: 'dungeon_viewport', style: {} };
    const canvas = { parentElement: viewport, style: {}, getContext: () => ({ fillRect() {} }),
        getBoundingClientRect: () => ({ left: parseFloat(canvas.style.left), top: parseFloat(canvas.style.top) }) };
    function $(target) {
        return { 0: target, attr() { return this; }, off() { return this; }, on() { return this; }, trigger() {} };
    }
    $.extend = Object.assign;
    const noop = () => {};
    const settings = { tile_cell_pixels: 32, tile_viewport_scale: 100, tile_map_scale: 50,
        tile_display_mode: 'tiles', tile_web_mouse_control: true };
    let cursor;
    function Base() { this.set_cell_size(32, 32); }
    Base.prototype = {
        set_cell_size(w, h) { this.cell_width = Math.floor(w); this.cell_height = Math.floor(h); },
        scaled_size(w = this.cell_width, h = this.cell_height) {
            return { width: Math.floor(w * ratio), height: Math.floor(h * ratio) };
        },
        init(element) { this.element = element; this.ctx = element.getContext('2d'); },
        clear: noop,
        glyph_mode_update_font_metrics() { this.glyph_mode_font_width = 9; this.glyph_mode_line_height = 16; }
    };
    const modules = { jquery: $, comm: {}, './cell_renderer': { DungeonCellRenderer: Base },
        './options': { get: key => settings[key], add_listener: noop },
        './enums': { ui: { NORMAL: 0, VIEW_MAP: 2 }, CURSOR_MOUSE: 1 },
        './view_data': { place_cursor(type, location) { cursor = location; } },
        './game-context': { can_target: () => false },
        './party-hover': { attach: noop, point: noop }, './traversal-effects': { attach: noop },
        './shell-animation': { attach: noop }, './planned-route': { attach: noop },
        './hero-feedback': { attach: noop }, './encounter-feedback': { attach: noop }, './premium-movement': { attach: noop }, './premium-effects': { animated: () => false }, './premium-regions': { animated: () => false } };
    for (const name of ['util', 'dungeon_renderer']) {
        vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            window: { devicePixelRatio: ratio }, document, clearTimeout,
            define(deps, factory) { modules['./' + name] = factory(...deps.map(key => modules[key])); }
        });
    }
    const renderer = modules['./dungeon_renderer'];
    renderer.init(canvas); renderer.ui_state = 0; renderer.set_view_center(50, 50);
    return { renderer, canvas, viewport, settings, cursor: () => cursor };
}

let cases = 0;
for (const ratio of [1, 1.25, 2]) {
    const { renderer, canvas, viewport, settings, cursor } = fixture(ratio);
    for (const [width, height] of [[973, 617], [701, 443], [320, 225]]) {
        for (const zoom of levels) {
            renderer.viewport_zoom = zoom;
            renderer.fit_to(width, height, 17);
            assert.equal(viewport.style.width, width + 'px');
            assert.equal(viewport.style.height, height + 'px');
            const left = parseFloat(canvas.style.left), top = parseFloat(canvas.style.top);
            assert(left <= -12 && top <= -12, 'Tiles bleed under the top and left panels');
            assert(left + parseFloat(canvas.style.width) >= width + 12);
            assert(top + parseFloat(canvas.style.height) >= height + 12);
            assert.equal(canvas.width, renderer.cols * Math.floor(renderer.cell_width * ratio));
            assert.equal(canvas.height, renderer.rows * Math.floor(renderer.cell_height * ratio));
            const center = renderer.canvas_coords(50, 50);
            assert(Math.abs(left + (center.x + center.width / 2) / ratio - width / 2) <= 1 / ratio);
            assert(Math.abs(top + (center.y + center.height / 2) / ratio - height / 2) <= 1 / ratio);
            for (const [x, y] of [[1, 1], [width / 2, height / 2], [width - 1, height - 1]]) {
                renderer.handle_mouse({ type: 'mousedown', clientX: x, clientY: y, which: 1 });
                const unit = renderer.scaled_size();
                assert.equal(cursor().x, renderer.view.x + Math.floor(Math.floor((x - left) * ratio) / unit.width));
                assert.equal(cursor().y, renderer.view.y + Math.floor(Math.floor((y - top) * ratio) / unit.height));
            }
            cases++;
        }
    }
    // Map and glyph modes retain their own cell sizes within the same frame.
    renderer.ui_state = 2; renderer.fit_to(701, 443, 17);
    assert.equal(renderer.cell_width, 16);
    settings.tile_display_mode = 'glyphs'; renderer.ui_state = 0;
    renderer.fit_to(701, 443, 17);
    assert.equal(renderer.cell_width, 9); assert.equal(renderer.cell_height, 16);
    assert.equal(viewport.style.width, '701px'); assert.equal(viewport.style.height, '443px');
}
console.log(`Viewport zoom passed: ${cases} sizing/pointer cases, plus map and glyph modes.`);
