/* Real map, display and camera modules with a controlled browser paint clock. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.FRAME_STATIC_ROOT || path.join(__dirname, '../game_data/static');

function fixture() {
    const handlers = new Map(), frames = new Map(), events = new Map();
    const painted = [], minimapUpdates = [], readiness = [];
    let sequence = 0, clears = 0, monsterUpdates = 0;
    const document = {}, window = { devicePixelRatio: 1, debug_mode: true,
        requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
        cancelAnimationFrame(id) { frames.delete(id); } };
    const element = { width: 96, height: 96, getContext: () => ({ fillRect() { clears++; },
        save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} }) };
    function emit(name, ...args) {
        for (const [event, callbacks] of events)
            if (event.split('.')[0] === name)
                callbacks.forEach(callback => callback({}, ...args));
    }
    function $(target) {
        return { attr() { return this; }, off() { return this; },
            on(names, callback) {
                for (const name of names.split(' ')) {
                    if (!events.has(name)) events.set(name, []);
                    events.get(name).push(callback);
                }
                return this;
            },
            bind(names, callback) { return this.on(names, callback); },
            trigger(name, args = []) { emit(name, ...args); return this; },
            0: target === '#dungeon' ? element : target };
    }
    $.extend = Object.assign;
    $.each = (values, callback) => Object.entries(values).forEach(([key, value]) => callback(key, value));
    const comm = { register_handlers: values => Object.entries(values).forEach(([key, value]) => handlers.set(key, value)) };
    const modules = { jquery: $, comm,
        './util': { make_key: (x, y) => x + 128 + (y + 128) * 256 },
        './enums': { prepare_bg_flags: value => ({ value }), ui: { NORMAL: 0 } },
        './options': { get: () => false, add_listener() {} },
        './tileinfo-dngn': { basetile: value => value },
        './view_data': {}, './mouse_control': {}, './game-context': {}, 'tooltip-policy': {},
        './party-hover': { attach() {}, draw() {} },
        './traversal-effects': { attach() {} }, './shell-animation': { attach() {} },
        './planned-route': { attach() {} }, './sprite-reach': () => 1,
        './monster_list': { update_loc() {}, update() { monsterUpdates++; }, clear() {} },
        './minimap': { center() {}, clear() {}, update(x, y) { minimapUpdates.push([x, y]); },
            do_view_center_update(x, y) { modules['./dungeon_renderer'].set_view_center(x, y); } },
        'game-loading': { mark(value) { readiness.push(value); } } };
    function BaseRenderer() { this.cell_width = this.cell_height = 32; }
    BaseRenderer.prototype = {
        init(canvas) { this.element = canvas; this.ctx = canvas.getContext('2d'); },
        scaled_size: () => ({ width: 32, height: 32 }),
        clear() { this.ctx.fillRect(); },
        render_cell(cx, cy, x, y, mapCell) {
            painted.push({ x: cx, y: cy, fg: mapCell.t?.fg, view: { ...this.view } });
            if (mapCell.t) { mapCell.t.sy = 0; mapCell.t.left_overlap = 0; }
        }
    };
    modules['./cell_renderer'] = { DungeonCellRenderer: BaseRenderer };
    for (const name of ['chunked-view', 'map_knowledge', 'dungeon_renderer', 'display']) {
        vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            window, document, console, setInterval, clearInterval, clearTimeout,
            define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    emit('game_init');
    const renderer = modules['./dungeon_renderer'];
    renderer.cols = renderer.rows = 3;
    return { map: modules['./map_knowledge'], display: modules['./display'], renderer,
        frames, painted, minimapUpdates, readiness, emit,
        packet(data) { handlers.get('map')({ msg: 'map', ...data }); },
        flush() {
            const pending = Array.from(frames.values()); frames.clear();
            pending.forEach(callback => callback());
        },
        get clears() { return clears; }, get monsterUpdates() { return monsterUpdates; } };
}

{
    const f = fixture();
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 1 } }] });
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 2 } }] });
    f.display.display();
    assert.equal(f.painted.length, 0, 'Packet handlers cannot paint intermediate native states');
    assert.equal(f.map.get(1, 1).t.fg, 2, 'Logical map updates remain immediate');
    assert.equal(f.frames.size, 1, 'Bursts share the next browser paint');
    f.flush();
    assert.equal(f.painted.length, 9);
    assert.equal(f.painted.find(cell => cell.x === 1 && cell.y === 1).fg, 2,
        'Only the newest known actor is painted');
    assert.equal(f.monsterUpdates, 1);
    assert.deepEqual(f.readiness, ['map']);
    assert.equal(f.frames.size, 0, 'Rendering cannot schedule itself forever');
}
{
    const f = fixture();
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 1 } }] }); f.flush();
    f.painted.length = 0;
    Object.assign(f.map.get(1, 1).t, { sy: -12, left_overlap: -8 });
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 0 } }] });
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 2 } }] });
    f.flush();
    assert.deepEqual(f.painted.map(({ x, y }) => [x, y]),
        [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
        'Old sprite coverage is erased and translucent layers are painted exactly once');
}
{
    const f = fixture();
    f.packet({ cells: [{ x: 0, y: 0, t: { fg: 1 } }] }); f.flush();
    f.painted.length = 0;
    f.renderer.set_view_center(2, 1);
    assert.equal(f.painted.length, 0, 'Camera changes cannot copy or paint stale actors');
    f.packet({ cells: [{ x: 1, y: 0, t: { fg: 2 } }], vgrdc: { x: 3, y: 1 } });
    assert.equal(f.frames.size, 1);
    f.flush();
    assert(f.painted.every(cell => cell.view.x === 2 && cell.view.y === 0), 'Paint uses only the final camera');
    assert(f.painted.some(cell => cell.x === 4), 'Newly exposed cells are repainted');
}
for (const event of ['game_preinit', 'game_cleanup']) {
    const f = fixture();
    f.packet({ cells: [{ x: 0, y: 0, t: { fg: 1 } }] });
    f.emit(event); f.flush();
    assert.equal(f.painted.length, 0, event + ' cancels stale pending frames');
}
{
    const f = fixture();
    f.packet({ cells: [{ x: 0, y: 0, t: { fg: 1 } }] });
    f.packet({ clear: true, cells: [{ x: 2, y: 2, t: { fg: 2 } }] });
    assert.equal(f.clears, 1);
    assert.equal(f.frames.size, 1);
    f.flush();
    assert.equal(f.painted.filter(cell => cell.fg === 2).length, 1);
    assert(!f.painted.some(cell => cell.fg === 1), 'Level resets discard old actors');
    assert.deepEqual(f.minimapUpdates, [[2, 2]], 'Level resets discard old dirty positions');
    assert.equal(f.map.dirty().length, 0);
    f.display.display(); f.flush();
    assert.equal(f.frames.size, 0, 'Empty refreshes are bounded');
}
{
    const f = fixture();
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 1 } }] }); f.flush();
    f.painted.length = 0;
    f.renderer.render_loc(1, 1); f.renderer.render_loc(2, 1);
    assert.equal(f.painted.length, 0, 'Cursor/hover updates cannot paint between native frame layers');
    assert.equal(f.frames.size, 1);
    f.flush();
    assert.equal(f.painted.length, 9);
    assert.equal(f.frames.size, 0);
}
console.log('Frame coalescing, latest camera/map state, sprite cleanup, readiness and lifecycle cancellation passed.');
