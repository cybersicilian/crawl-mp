/* Context choices and freshness across creature, terrain and input-mode facts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hero = { slot: 0, name: 'Leader', alive: true, pos: { x: 0, y: 0 }, place: 'D:1',
    floor_items_known: true, floor_items: [{ id: 12, name: 'a potion', qty: 1 }] };
const companion = { slot: 1, name: 'Companion', alive: true, pos: { x: 1, y: 0 }, on_same_level: true };
const state = { enabled: true, members: [hero, companion], tile_exclusions: true };
const window = { crawl_party: { state, open_inspector(slot, tab) { packets.push({ sheet: slot, tab }); } } };
const packets = [], cells = new Map();
let watching = false, targeting = false, prompt = false, spec, prevented;
const map = { get: (x, y) => cells.get(x + ',' + y) || {}, visible: cell => cell.visible === true };
const modules = {
    comm: { send_message(msg, fields) { packets.push({ msg, ...fields }); } },
    client: { is_watching: () => watching },
    './context-menu': { open(event, value) { spec = value; } },
    './workflow-actions': { controlledSlot: () => 0,
        reason: () => watching ? 'Spectator' : targeting || prompt ? 'Finish the current action' : '' },
    './party-model': { canControl: (state, slot) => slot === 1 },
    './map_knowledge': map,
    './game-context': { can_target: () => targeting, can_describe: () => !prompt,
        get_input_mode: () => targeting ? 1 : prompt ? 2 : 0, get_ui_state: () => 0 }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/dungeon-context-menu.js'), 'utf8'), {
    window, define(deps, factory) { modules.context = factory(...deps.map(name => modules[name])); }
});
function open(x, y, cell) {
    if (cell) cells.set(x + ',' + y, { t: {}, visible: true, feature_name: 'floor', ...cell });
    spec = null; prevented = false;
    modules.context.open({ cell: { x, y }, preventDefault() { prevented = true; } });
    return spec;
}
const labels = () => spec.entries.map(entry => entry.label);
const choose = label => spec.entries.find(entry => entry.label === label).run();

open(0, 0, { feature_name: 'a stone staircase leading up' });
assert(labels().includes('Pick up items'));
assert(labels().includes('Go upstairs / leave'));
assert(labels().includes('Open character sheet'));
choose('Inspect');
assert.deepEqual(packets.pop(), { msg: 'click_cell', x: 0, y: 0, button: 3 });
choose('Pick up items'); assert.deepEqual(packets.pop(), { msg: 'key', keycode: 103 });

open(0, 1, { mon: { id: 7, name: 'rat', att: 0 } });
assert(labels().includes('Attack'));
choose('Attack'); assert.deepEqual(packets.pop(), { msg: 'click_cell', x: 0, y: 1, button: 1 });
assert(spec.valid());
cells.get('0,1').mon.id = 8;
assert.equal(spec.valid(), false, 'A replaced creature invalidates its menu');
open(0, 1);
hero.pos.x = 1;
assert.equal(spec.valid(), false, 'Movement invalidates the old tile context');
hero.pos.x = 0;
open(0, 1);
targeting = true;
assert.equal(spec.valid(), false, 'Entering targeting invalidates command actions');
open(0, 1);
assert(labels().includes('Select target'));
assert(!labels().includes('Attack'));
targeting = false;

open(0, 2, { visible: false, mon: { id: 10, name: 'remembered rat', att: 0 } });
assert(!labels().includes('Attack'));
assert(!labels().some(label => label.startsWith('Ping:')), 'Pings require current visibility');
assert(labels().includes('Move here'), 'Explored tiles retain native travel');
open(2, 0, { feature_name: 'a rock wall' });
assert(!labels().includes('Move here'));
open(2, 0, { feature_name: 'a closed door' });
assert(labels().includes('Open door / move here'));
choose('Toggle travel exclusion');
assert.deepEqual(packets.pop(), { msg: 'click_cell', x: 2, y: 0, button: 1, exclude: true,
    expected_slot: 0, expected_place: 'D:1' });

open(1, 0, {});
assert(labels().includes('Control this hero'));
choose('Control this hero'); assert.deepEqual(packets.pop(), { msg: 'switch_player', slot: 1 });
watching = true;
open(0, 1);
assert(!labels().some(label => ['Attack', 'Move here', 'Toggle travel exclusion'].includes(label)));
assert(spec.entries.find(entry => entry.label === 'Inspect').disabled);
assert(!labels().some(label => label.startsWith('Ping:')));
watching = false; prompt = true;
open(0, 1);
assert(spec.entries.find(entry => entry.label === 'Inspect').disabled);
prompt = false;
assert.equal(open(99, 99), null, 'Unknown map cells expose no menu');
assert(prevented);
open(0, 1);
let current = true;
modules.context.open({ cell: { x: 0, y: 1 }, preventDefault() {} },
    { title: 'orc · Last known location', valid: () => current });
assert.equal(spec.title, 'orc · Last known location');
assert(spec.valid());
current = false;
assert(!spec.valid(), 'A banner losing its contact invalidates the canonical tile menu');
console.log('Creature, remembered terrain, doors, stairs, pickup, target mode, ownership, spectator and stale-context cases passed.');
