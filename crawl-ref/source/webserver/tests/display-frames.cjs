/* Real map, display and camera modules with a controlled browser paint clock. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.FRAME_STATIC_ROOT || path.join(__dirname, '../game_data/static');

function fixture() {
    const handlers = new Map(), frames = new Map(), events = new Map();
    const painted = [], minimapUpdates = [], readiness = [], tileChanges = [];
    let sequence = 0, clears = 0, monsterUpdates = 0, clock = 100, reachReads = 0;
    const frameTimes = [];
    const document = {}, window = { devicePixelRatio: 1, debug_mode: true,
        performance: { now: () => ++clock },
        requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
        cancelAnimationFrame(id) { frames.delete(id); } };
    const element = { width: 96, height: 96, getContext: () => ({ fillRect() { clears++; },
        save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} }) };
    function emit(name, ...args) {
        if (name === 'dungeon_tiles_changed') tileChanges.push(JSON.parse(JSON.stringify(args[0])));
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
        './enums': { prepare_bg_flags: value => typeof value === 'object' ? value : { value }, ui: { NORMAL: 0 } },
        './options': { get: () => false, add_listener() {} },
        './tileinfo-dngn': { basetile: value => value },
        './view_data': {}, './mouse_control': {}, './game-context': {}, 'tooltip-policy': {},
        './party-hover': { attach() {}, draw() {} },
        './traversal-effects': { attach() {} }, './shell-animation': { attach() {} }, './chain-view': { attach() {} },
        './hero-feedback': { attach() {} }, './encounter-feedback': { attach() {} }, './premium-movement': { attach() {} }, './premium-effects': { animated: () => false },
        './premium-regions': { animated: () => false }, './planned-route': { attach() {} }, './sprite-reach': cell => { reachReads++; return cell?.reach || 1; },
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
            frameTimes.push(this.frame_time);
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
    return { map: modules['./map_knowledge'], display: modules['./display'], renderer, modules,
        frames, painted, minimapUpdates, readiness, tileChanges, frameTimes, emit,
        packet(data) { handlers.get('map')({ msg: 'map', ...data }); },
        flush() {
            const pending = Array.from(frames.values()); frames.clear();
            pending.forEach(callback => callback());
        },
        get clears() { return clears; }, get monsterUpdates() { return monsterUpdates; },
        get reachReads() { return reachReads; } };
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
    assert.equal(new Set(f.frameTimes).size, 1, 'Every tile in the native paint shares one shader clock');
    assert(f.frameTimes[0] > 100, 'The shared paint timestamp uses the current clock');
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
    assert.deepEqual(f.tileChanges.slice(-2), [[{ x: 1, y: 1 }], [{ x: 2, y: 1 }]],
        'Tile notifications identify the affected portrait coordinates');
    assert.equal(f.painted.length, 0, 'Cursor/hover updates cannot paint between native frame layers');
    assert.equal(f.frames.size, 1);
    f.flush();
    assert.equal(f.painted.length, 9);
    assert.equal(f.frames.size, 0);
}
{
    const f = fixture();
    f.packet({ cells: [{ x: 1, y: 1, t: { bg: 17, cloud: 4 } }] }); f.flush();
    f.modules['./premium-effects'].animated = cell => Boolean(cell?.cloud);
    const original = JSON.stringify(f.map.get(1, 1).t.bg);
    f.renderer.animate();
    assert.equal(JSON.stringify(f.map.get(1, 1).t.bg), original, 'A cloud refresh cannot animate a disabled terrain background');
    assert.deepEqual(f.tileChanges.at(-1), [{ x: 1, y: 1 }], 'Cloud shaders on ordinary floors receive native animation ticks');
}
{
    const f = fixture();
    f.packet({ cells: [{ x: 1, y: 1, t: { bg: 17, cloud: 4 } }] }); f.flush();
    Object.assign(f.modules['./tileinfo-dngn'], { DNGN_LAVA: 17, FLOOR_MAX: 30, BLOOD: 25,
        basetile: value => value >= 17 && value < 25 ? 17 : value, tile_count: () => 8 });
    f.modules['./options'].get = () => true;
    f.modules['./premium-effects'].animated = cell => Boolean(cell?.cloud);
    f.renderer.animate(); const first = f.map.get(1, 1).t.bg.value;
    f.renderer.animate();
    assert.equal(f.map.get(1, 1).t.bg.value, first, 'Faster cloud ticks do not accelerate the native background animation');
    assert.deepEqual(f.tileChanges.at(-1), [{ x: 1, y: 1 }]);
    f.emit('game_cleanup');
}
console.log('Frame coalescing, camera/map state, shader refresh, native animation cadence, sprite cleanup and lifecycle cancellation passed.');

{
    const f = fixture();
    f.renderer.cols = 43; f.renderer.rows = 31;
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 1 } }] }); f.flush();
    assert.equal(f.reachReads, 43 * 31, 'The first paint covers all visible sprite extents');
    const before = f.reachReads;
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 2, reach: 4 } }] }); f.flush();
    assert.equal(f.reachReads - before, 1, 'A single changed sprite cannot rescan a Retina viewport');
    assert.equal(f.renderer.sprite_reach, 4, 'A new oversized sprite expands damage immediately');
    f.packet({ cells: [{ x: 1, y: 1, t: { fg: 0, reach: 1 } }] }); f.flush();
    assert.equal(f.renderer.sprite_reach, 4, 'Removing a large sprite retains its old erasure coverage');
    const previous = f.reachReads;
    f.renderer.set_view_center(5, 5); f.flush();
    assert.equal(f.reachReads - previous, 43 * 31, 'Camera changes inspect newly visible sprite extents');
}
console.log('Sparse sprite extent checks preserve tall-sprite cleanup and camera coverage.');
