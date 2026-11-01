/* The nearby-creature list repaints only when a monster cell or its environment changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cells = {}, counters = { rendered: 0, events: 0, toggles: 0 };
function node() {
    const self = { style: {}, children: [], classes: new Set() };
    const api = new Proxy({}, { get(_, name) {
        if (name === '0') return self;
        if (name === 'length') return 1;
        if (name === 'size') return () => 0;
        if (name === 'find') return () => api;
        if (name === 'toggle') return () => { counters.toggles++; return api; };
        if (name === 'trigger') return () => { counters.events++; return api; };
        if (name === 'text' || name === 'html') return value => (value === undefined ? self.text : (self.text = String(value), api));
        return () => api;
    } });
    return api;
}
const $ = () => node(); $.each = (values, callback) => values.forEach((value, i) => callback(i, value));
const document = { getElementById: () => null };
let bound = {};
const $document = { bind(name, callback) { bound[name] = callback; return $document; },
    trigger() { counters.events++; return $document; } };
const jquery = target => target === document ? $document : $(target);
jquery.each = $.each;
class Renderer {
    constructor() { this.cell_width = this.cell_height = 32; }
    init() {} draw_main() {} set_cell_size() {}
    render_cell() { counters.rendered++; }
}
const dungeon_renderer = { cell_width: 32, cell_height: 32, ui_state: 0 };
const party = { state: { members: [] } };
let list;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/monster_list.js'), 'utf8'), {
    document, window: { crawl_party: party }, Number, Array, Boolean, Math, Object, String,
    define(deps, factory) {
        list = factory(jquery, { get: (x, y) => cells[x + ',' + y], visible: () => true },
            { DungeonCellRenderer: Renderer }, dungeon_renderer,
            { get: () => 'tiles', add_listener() {} }, { init_canvas() {}, formatted_string_to_html: t => t }, {}, { UNSEEN_INVISIBLE: 1 },
            { harmless: monster => Boolean(monster.typedata && monster.typedata.no_exp) });
    }
});
bound.game_init();
function place(x, name, att) {
    cells[x + ',0'] = { mon: { id: x, name, plural: name + 's', att, threat: 1, type: x, typedata: { avghp: 10 } } };
    list.update_loc({ x, y: 0 });
}
place(1, 'orc', 0); place(2, 'jackal', 0);
list.update();
assert.equal(counters.rendered, 2, 'The first frame paints both rows');
assert.equal(counters.events, 1);
for (let i = 0; i < 20; i++) list.update();
assert.equal(counters.rendered, 2, 'Frames without monster changes do not repaint rows');
assert.equal(counters.events, 1, 'nearby_creatures_changed is not re-fired for identical frames');
place(2, 'jackal', 0);
list.update();
assert.equal(counters.rendered, 4, 'A dirty monster cell repaints');
delete cells['2,0'].mon; list.update_loc({ x: 2, y: 0 }); list.update();
assert.equal(counters.rendered, 5, 'A vanished monster repaints the remaining row');
cells['9,0'] = {}; list.update_loc({ x: 9, y: 0 }); list.update();
assert.equal(counters.rendered, 5, 'Dirty cells that never held a monster do not repaint');
list.update('Unseen movement');
assert.equal(counters.rendered, 6, 'A new unseen-monster message repaints');
list.update('Unseen movement');
assert.equal(counters.rendered, 6);
party.state.members.push({ alive: true, on_same_level: true, pos: { x: 1, y: 0 } });
list.update('Unseen movement');
assert.equal(counters.rendered, 7, 'Party position changes re-evaluate the rows (projection filter may change)');
assert.equal(counters.events, 5, 'Party position changes re-fire the roster event');
list.update('Unseen movement');
assert.equal(counters.rendered, 7, 'An unchanged party does not repaint');
dungeon_renderer.cell_width = 48; list.update('Unseen movement');
assert.equal(counters.rendered, 8, 'Cell size changes repaint');
list.clear(); place(1, 'orc', 0); list.update();
assert.equal(counters.rendered, 9, 'clear() resets the dirty state');
console.log('Creature list repaints only on monster, message, party, size or clear changes.');
