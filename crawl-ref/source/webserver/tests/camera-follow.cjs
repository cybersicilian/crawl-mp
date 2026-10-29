/* Camera policy across connection identity, native views and temporary farview. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handlers = new Map();
const context = { clearRect() {}, strokeRect() {}, fillRect() {}, drawImage() {} };
const canvas = { width: 160, height: 140, getContext: () => context,
    getBoundingClientRect: () => ({ left: 40, top: 50, width: 320, height: 280 }) };
const overlay = { getContext: () => context };
const bounds = { left: -10, top: -12, right: 20, bottom: 22 };
const cells = new Map(), clicks = [];
const capture = new Map();
const renderer = { ui_state: 0, view: { x: 0, y: 0 }, view_center: { x: 0, y: 0 }, cols: 20, rows: 20,
    set_view_center(x, y) { this.view_center = { x, y }; } };
const enums = { ui: { NORMAL: 0, VIEW_MAP: 2 }, mouse_mode: { COMMAND: 1, TARGET: 2 },
    gxm: 80, gym: 70, MF_UNSEEN: 0, MF_FLOOR: 1, MF_MAP_FLOOR: 3 };
let mode = enums.mouse_mode.COMMAND, minimap, watching = false, ready = false;
const window = { crawl_party: { state: { controlled_slot: 1, active_slot: 0, members: [
    { slot: 0, place: 'D:1', pos: { x: 2, y: 3 } },
    { slot: 1, place: 'D:1', pos: { x: 12, y: 14 } }
] } } };
const document = { getElementById: () => null,
    addEventListener(type, callback) { capture.set(type, callback); } };
function $(target) {
    const chain = {};
    chain[0] = target === '#minimap' ? canvas : target === '#minimap_overlay' ? overlay : undefined;
    for (const event of ['on', 'bind', 'mousedown', 'mousemove', 'mouseup']) {
        chain[event] = (names, handler) => {
            if (typeof names === 'function') { handler = names; names = event; }
            for (const name of names.split(' ')) handlers.set(String(target === document ? 'document' : target) + ':' + name, handler);
            return chain;
        };
    }
    chain.off = namespace => {
        for (const key of handlers.keys()) {
            if (key.startsWith(target + ':') && key.endsWith(namespace)) handlers.delete(key);
        }
        return chain;
    };
    for (const name of ['css', 'show', 'hide', 'width', 'height']) chain[name] = () => chain;
    for (const name of ['remove', 'insertBefore', 'find', 'removeClass', 'attr', 'contextmenu']) chain[name] = () => chain;
    chain.closest = selector => ({ length: typeof target === 'string' && selector.includes(target) ? 1 : 0 });
    chain.is = () => false;
    chain.trigger = event => {
        if (target === '#dungeon') {
            clicks.push(event);
            const handler = handlers.get('#dungeon:' + event.type);
            if (handler) handler(event);
        }
        return chain;
    };
    chain.offset = () => ({ left: 0, top: 0 });
    return chain;
}
$.extend = Object.assign;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/minimap.js'), 'utf8'), {
    window, document, define(dependencies, factory) {
        minimap = factory($, { bounds: () => bounds, get: (x, y) => cells.get(x + ',' + y) },
            renderer, {}, {}, {}, {}, enums, {}, { ready: () => ready, get: () => 0 }, {},
            { get_input_mode: () => mode }, { is_watching: () => watching });
    }
});
const emit = (name, ...args) => handlers.get('document:' + name)({}, ...args);
const camera = (x, y) => assert.deepEqual(renderer.view_center, { x, y });
const state = window.crawl_party.state;
emit('game_init');
ready = true;
minimap.fit_to(160);
minimap.center();
ready = false; // Camera assertions do not need the rendering overlay.
emit('party_state_rendered.cameraFollow'); camera(12, 14);
minimap.do_view_center_update(2, 3); camera(12, 14);
state.active_slot = 1;
state.members[1].pos = { x: 13, y: 14 };
emit('party_state_rendered.cameraFollow'); camera(13, 14);
renderer.set_view_center(2, 3);
emit('party_state_rendered.cameraFollow'); camera(2, 3);
state.members[1].pos.y++;
emit('party_state_rendered.cameraFollow'); camera(13, 15);
state.controlled_slot = 0;
emit('party_state_rendered.cameraFollow'); camera(2, 3);
mode = enums.mouse_mode.TARGET;
minimap.do_view_center_update(30, 35); camera(30, 35);
state.members[0].pos.x++;
emit('party_state_rendered.cameraFollow'); camera(30, 35);
mode = enums.mouse_mode.COMMAND;
emit('game_input_changed.cameraFollow', mode); camera(3, 3);
renderer.ui_state = enums.ui.VIEW_MAP;
minimap.do_view_center_update(40, 45); camera(40, 45);
emit('party_state_rendered.cameraFollow'); camera(40, 45);
renderer.ui_state = enums.ui.NORMAL;
emit('game_input_changed.cameraFollow', mode); camera(3, 3);
// A held minimap preview keeps its position until release, then restores follow.
handlers.get('#minimap_overlay:mousedown.minimap')({ which: 3, clientX: 166, clientY: 192, preventDefault() {} });
renderer.set_view_center(50, 55);
state.members[0].pos.x++;
emit('party_state_rendered.cameraFollow'); camera(50, 55);
minimap.stop_minimap_farview(); camera(4, 3);
for (const unavailable of [null, undefined]) {
    state.controlled_slot = unavailable;
    minimap.do_view_center_update(60, 65); camera(60, 65);
}
state.controlled_slot = 0;
state.members[0].on_same_level = false;
minimap.do_view_center_update(70, 75); camera(70, 75);
state.members[0].on_same_level = true;
state.members[0].pos.x = NaN;
minimap.do_view_center_update(80, 85); camera(80, 85);
state.members[0].pos.x = 4;
emit('game_cleanup.cameraFollow');
emit('party_state_rendered.cameraFollow'); camera(4, 3);
assert.equal(state.active_slot, 1, 'Local camera must never change the acting hero');
assert.equal(state.controlled_slot, 0, 'Local camera must never change hero control');

// Hit testing shares the drawing origin and supports negative map coordinates,
// a centered map, CSS scaling, and clicks near either edge of a cell.
function click(x, y, extra = {}) {
    const event = { which: 1, clientX: x, clientY: y, target: '#minimap_overlay',
        preventDefault() { this.prevented = true; }, ...extra };
    if (capture.has('mousedown')) capture.get('mousedown')(event);
    handlers.get('#minimap_overlay:mousedown.minimap')(event);
    return event;
}
cells.set('-4,5', { mf: enums.MF_FLOOR });
const first = click(166, 192);
assert(first.prevented);
assert.equal(clicks.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(clicks[0].cell)), { x: -4, y: 5 });
assert.equal(clicks[0].type, 'cell_click');
assert.equal(clicks[0].which, 1);
click(164, 190); click(167.99, 193.99);
assert.equal(clicks.length, 3);
click(168, 192); // Next, unknown tile.
click(40, 50); // Canvas padding, outside known map bounds.
click(NaN, 192);
cells.set('-4,5', { mf: enums.MF_UNSEEN }); click(166, 192);
assert.equal(clicks.length, 3, 'Unknown cells and padding must never send dungeon input');
cells.set('-4,5', { mf: enums.MF_MAP_FLOOR });
click(166, 192, { altKey: true, shiftKey: true });
assert(clicks.at(-1).altKey && clicks.at(-1).shiftKey, 'Pass ping modifiers to the shared dungeon handler');
watching = true; click(166, 192); watching = false;
mode = enums.mouse_mode.TARGET; click(166, 192); mode = enums.mouse_mode.COMMAND;
renderer.ui_state = enums.ui.VIEW_MAP; click(166, 192); renderer.ui_state = enums.ui.NORMAL;
click(166, 192, { ctrlKey: true }); click(166, 192, { metaKey: true });
assert.equal(clicks.length, 4, 'Spectators, prompts, map UI and context-clicks must not start travel');
click(166, 192, { which: 3 }); camera(-4, 5);
handlers.get('document:mouseup.minimap')(); camera(4, 3);
assert.equal(clicks.length, 4, 'Right-drag previews without moving a hero; release anywhere restores the camera');
emit('game_init');
assert.equal([...handlers.keys()].filter(key => key === '#minimap_overlay:mousedown.minimap').length, 1);
click(166, 192);
assert.equal(clicks.length, 4, 'An uninitialized map after reconnect must ignore clicks');

// Exercise the actual dungeon dispatcher, including its capture-phase selection
// cancellation. A minimap click must consume an armed action exactly once.
const packets = [];
state.tile_exclusions = true;
state.multiplayer = true;
state.floor = 'D:1';
window.crawl_party.armed_ping_kind = null;
const mouseModules = {
    './tactical-planner': { click: () => false },
    jquery: $, comm: { send_message(msg, fields) { packets.push({ msg, ...fields }); } },
    './workflow-actions': { controlledSlot: () => state.controlled_slot, reason: () => '' },
    './nested-tips': { host: () => ({ hidden() {}, locked: false, holds: () => false }) }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/party-ping.js'), 'utf8'), {
    window, define(deps, factory) { mouseModules['./party-ping'] = factory(mouseModules.comm); }
});
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/mouse_control.js'), 'utf8'), {
    document, window, define(deps, factory) { factory(...deps.map(name => mouseModules[name] || {})); }
});
handlers.get('document:game_init.mouse_control')();
ready = true; minimap.fit_to(160); minimap.center(); ready = false;
click(166, 192);
assert.deepEqual(packets.pop(), { msg: 'click_cell', x: -4, y: 5, button: 1 });
click(166, 192, { altKey: true, shiftKey: true });
assert.deepEqual(packets.pop(), { msg: 'party_ping', x: -4, y: 5, kind: 'danger', floor: 'D:1' });
window.crawl_party.armed_ping_kind = 'look';
click(166, 192);
assert.deepEqual(packets.pop(), { msg: 'party_ping', x: -4, y: 5, kind: 'look', floor: 'D:1' });
assert.equal(window.crawl_party.armed_ping_kind, null);
handlers.get('document:tile_exclusion_mode.mouse_control')();
click(166, 192);
assert.deepEqual(packets.pop(), { msg: 'click_cell', x: -4, y: 5, button: 1,
    exclude: true, expected_slot: 0, expected_place: 'D:1' });
click(166, 192);
assert.deepEqual(packets.pop(), { msg: 'click_cell', x: -4, y: 5, button: 1 });
assert.equal(packets.length, 0);
console.log('Camera follow, scaled minimap travel, input guards, native click/ping/exclusion dispatch, farview and reconnect checks passed.');
