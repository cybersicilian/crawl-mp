const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handlers = new Map(), packets = [], notices = [];
const document = {
    getElementById() { return null; },
    createElement() { return { setAttribute() {}, set textContent(value) { notices.push(value); } }; }
};
const jquery = () => ({
    on(name, handler) { handlers.set(name, handler); return this; },
    trigger() { return this; }, children() { return []; }
});
const member = { slot: 0, alive: true };
const state = { snapshot_version: 2, inventory_use: true, members: [member], active_slot: 0 };
const window = { crawl_party: { state } };
let actions;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/workflow-actions.js'), 'utf8'), {
    document, window,
    define(_deps, factory) {
        actions = factory(jquery, {
            register_handlers() {}, send_message(type, fields) { packets.push({ type, ...fields }); }
        }, { is_watching: () => false }, { mouse_mode: { COMMAND: 1 } }, {
            controlledSlot: () => 0, canControl: () => false, inCombat: () => false
        }, {}, {});
    }
});
handlers.get('game_input_changed.workflow')(null, 1);
const item = { slot: 2, name: 'an enchanted robe', equipped: true, can_weave: true, weave_uid: 47 };
actions.itemAction(member, item, false, 'weave');
assert.equal(packets.length, 1);
assert.equal(packets[0].type, 'inv_item_use');
assert.equal(packets[0].action, 'weave');
assert.equal(packets[0].expected_uid, 47);
assert.equal(packets[0].expected_slot, 0);
assert.equal(packets[0].expected_name, item.name);
for (const uid of [undefined, 0, -1, Infinity, 2.5, '47'])
    actions.itemAction(member, { ...item, weave_uid: uid }, false, 'weave');
assert.equal(packets.length, 1, 'Invalid physical identities cannot request a weave');
actions.itemAction({ slot: 1, alive: true }, item, false, 'weave');
assert.equal(packets.length, 1, 'Another hero cannot spend this character\'s resources');
actions.itemAction(member, { ...item, can_weave: false }, false, 'weave');
assert.equal(packets.length, 1, 'Unavailable enchanting sends nothing');
handlers.get('game_input_changed.workflow')(null, 0);
actions.itemAction(member, item, false, 'weave');
assert.equal(packets.length, 1, 'An active prompt blocks additional crafting requests');
assert(notices.length >= 9);
console.log('Vellum workflow identity, owner, availability, and prompt-state checks passed.');
