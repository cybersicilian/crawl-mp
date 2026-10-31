/* Item-action contracts using the real AMD modules; no browser/native gameplay claim. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../game_data/static');
const events = new Map(), packets = [], handlers = {};
const document = { getElementById: () => null,
    createElement: () => ({ setAttribute() {} }) };
const window = { crawl_party: { state: null } };
let watching = false;
const jquery = () => ({
    on(name, callback) { events.set(name, callback); return this; },
    trigger() { return this; }
});
const modules = {
    jquery, comm: { send_message(msg, fields) { packets.push({ msg, ...fields }); },
        register_handlers(value) { Object.assign(handlers, value); } },
    client: { is_watching: () => watching },
    './enums': { mouse_mode: { COMMAND: 1 } },
    './party-model': {
        controlledSlot: state => state.controlled_slot,
        canControl: (state, slot) => slot === state.controlled_slot,
        inCombat: (state, member) => member.region_combat === true
    },
    'spell-cost': { reason: () => '' }, './inspection-dialog': {},
    './context-menu': {}, './party-skill-training': {
        signature: () => '', itemEntries: () => []
    }
};
function load(name) {
    vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
        window, document, console,
        define(dependencies, factory) {
            modules['./' + name] = factory(...dependencies.map(dependency => modules[dependency]));
        }
    }, { filename: name + '.js' });
}
load('workflow-actions');
load('item-context-menu');
const actions = modules['./workflow-actions'], menus = modules['./item-context-menu'];
function setup() {
    watching = false;
    packets.length = 0;
    const item = { slot: 4, name: 'a +0 plate armour', kind_name: 'Armour', qty: 1,
        equipped: false, assimilation: { uid: 91, turns: 5, blocked_reason: '' } };
    const hero = { slot: 0, player_id: 'oozle-owner', name: 'Oozle', alive: true,
        place: 'D:1', pos: { x: 4, y: 6 }, region_combat: false, can_act: true,
        abilities: [{ id: 1, name: 'Assimilate', blocked_reason: '' }], inventory: [item] };
    const peer = { ...hero, slot: 1, player_id: 'peer-owner', name: 'Peer',
        pos: { x: 30, y: 40 }, inventory: [] };
    window.crawl_party.state = { snapshot_version: 2, controlled_slot: 0, active_slot: 0,
        multiplayer: true, inventory_use: true, inventory_secondary: true, members: [hero, peer] };
    events.get('game_input_changed.workflow')({}, 1);
    return { hero, peer, item };
}
const assimilate = spec => spec.entries.find(entry => entry.label === 'Assimilate…');
let cases = 0;
function check(name, run) { setup(); run(); ++cases; console.log(name); }
check('Eligible carried armour has one direct consequential Assimilate action', () => {
    const hero = window.crawl_party.state.members[0], item = hero.inventory[0];
    const spec = menus.inventory(hero, item), entry = assimilate(spec);
    assert(entry && !entry.disabled && entry.consequential);
    assert.match(entry.detail, /one item.*5 of your turns/);
    assert.equal(spec.entries.filter(value => value.label === 'Assimilate…').length, 1);
    assert.equal(packets.length, 0, 'Opening the menu sends no native command');
    entry.run();
    assert.equal(packets.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(packets[0])), { msg: 'inv_item_use', slot: 4,
        expected_slot: 0, expected_name: item.name, action: 'assimilate', expected_uid: 91, expected_qty: 1 });
});
check('Same-name replacement invalidates an open menu by native item identity', () => {
    const hero = window.crawl_party.state.members[0], spec = menus.inventory(hero, hero.inventory[0]);
    hero.inventory[0].assimilation.uid = 92;
    assert.equal(spec.valid(), false);
    assimilate(spec).run();
    assert.equal(packets.length, 0);
});
check('A changed stack quantity invalidates the selected item', () => {
    const hero = window.crawl_party.state.members[0], spec = menus.inventory(hero, hero.inventory[0]);
    hero.inventory[0].qty = 2;
    assert.equal(spec.valid(), false);
    assimilate(spec).run();
    assert.equal(packets.length, 0);
});
check('Independent peer updates preserve an unchanged owner menu', () => {
    const state = window.crawl_party.state, hero = state.members[0];
    const spec = menus.inventory(hero, hero.inventory[0]);
    state.members[1].pos.x += 1;
    assert.equal(spec.valid(), true);
});
check('Ownership changes invalidate a pending destructive action', () => {
    const state = window.crawl_party.state, hero = state.members[0];
    const spec = menus.inventory(hero, hero.inventory[0]);
    state.controlled_slot = 1;
    assert.equal(spec.valid(), false);
    assimilate(spec).run();
    assert.equal(packets.length, 0);
});
check('Equipped and cursed item reasons remain visible and cannot be bypassed', () => {
    const hero = window.crawl_party.state.members[0], item = hero.inventory[0];
    for (const reason of ['Remove that item before actively assimilating it.',
        'Unbind that item before assimilating it.']) {
        item.assimilation.blocked_reason = reason;
        assert.equal(assimilate(menus.inventory(hero, item)).disabled, reason);
        actions.itemAction(hero, item, false, 'assimilate');
        assert.equal(packets.length, 0);
    }
});
check('Native ability restrictions invalidate menus and direct invocation', () => {
    const hero = window.crawl_party.state.members[0], item = hero.inventory[0];
    const spec = menus.inventory(hero, item);
    hero.abilities[0].blocked_reason = 'You are confused.';
    assert.equal(spec.valid(), false);
    assert.equal(assimilate(menus.inventory(hero, item)).disabled, 'You are confused.');
    actions.itemAction(hero, item, false, 'assimilate');
    assert.equal(packets.length, 0);
});
check('Spectators and another owner cannot assimilate inventory', () => {
    const hero = window.crawl_party.state.members[0], item = hero.inventory[0];
    watching = true;
    assert.match(assimilate(menus.inventory(hero, item)).disabled, /Join the party/);
    actions.itemAction(hero, item, false, 'assimilate');
    watching = false;
    hero.slot = 1;
    assert.match(actions.assimilationReason(hero, item), /own hero/);
    actions.itemAction(hero, item, false, 'assimilate');
    assert.equal(packets.length, 0);
});
check('Older snapshots and unsupported items do not invent an Assimilate action', () => {
    const hero = window.crawl_party.state.members[0], item = hero.inventory[0];
    delete item.assimilation;
    assert.equal(assimilate(menus.inventory(hero, item)), undefined);
    item.kind_name = 'Potions';
    assert.equal(assimilate(menus.inventory(hero, item)), undefined);
    actions.itemAction(hero, item, false, 'assimilate');
    assert.equal(packets.length, 0);
});
check('Invalid identity or quantity is blocked before native dispatch', () => {
    const hero = window.crawl_party.state.members[0], item = hero.inventory[0];
    item.assimilation.uid = 0;
    assert(actions.assimilationReason(hero, item));
    item.assimilation.uid = 91;
    item.qty = 0;
    assert(actions.assimilationReason(hero, item));
});
console.log(JSON.stringify({ passed: true, cases, nativeGameplay: false, browserRun: false }));
