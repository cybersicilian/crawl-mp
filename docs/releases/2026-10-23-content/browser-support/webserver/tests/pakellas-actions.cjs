const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/quickbar-model.js'), 'utf8'), {
    define(_dependencies, factory) { model = factory(); }
});
const copy = value => JSON.parse(JSON.stringify(value));
const device = (slot, uid, name, actions) => ({ slot, uid, name, letter: 'a',
    kind_name: 'Wands', workshop_stamp: 'current', device_actions: actions });
const actions = [
    { key: 'prototype', label: 'Evoke Prototype', cost: 'Readiness', blocked_reason: '' },
    { key: 'overclock', label: 'Overclock', cost: '4 piety', blocked_reason: '' },
    { key: 'breakthrough', label: 'Breakthrough', cost: '8 piety', blocked_reason: 'Still ready' },
    { key: 'designate', label: 'Designate Prototype', cost: '4 piety', blocked_reason: 'Already selected' }
];
const hero = { inventory: [device(52, 10, 'a wand of acid', actions)], abilities: [], spells: [] };
const binding = model.binding({ kind: 'item', id: 52, uid: 10, action: 'overclock' });
assert.deepEqual(copy(binding), { kind: 'item', id: 52, uid: 10, action: 'overclock' });
assert.equal(model.resolve(hero, binding).source_name, 'a wand of acid');
assert.equal(model.resolve(hero, binding).action, 'overclock');
hero.inventory[0].slot = 80;
assert.equal(model.resolve(hero, binding).slot, 80, 'Enhanced pins follow identity across inventory moves');
hero.inventory[0].uid = 11;
assert.equal(model.resolve(hero, binding), null, 'A replacement item never inherits an enhanced pin');
hero.inventory[0].uid = 10;
hero.inventory[0].device_actions = actions.filter(action => action.key !== 'overclock');
assert.equal(model.resolve(hero, binding), null, 'A reserve pin cannot silently become a finite-charge activation');
hero.inventory[0].device_actions = actions;
const prototype = model.binding({ kind: 'item', id: 52, uid: 10, action: 'prototype' });
hero.inventory = [device(81, 25, 'a phial of floods', actions)];
assert.equal(model.resolve(hero, prototype).uid, 25, 'Prototype pins follow deliberate reconfiguration');
assert.equal(model.resolve(hero, prototype).source_name, 'a phial of floods');
assert.equal(model.resolve(hero, { kind: 'item', id: 81, uid: 25, action: 'breakthrough' }).blocked_reason, 'Still ready');
assert.equal(model.catalog(hero, 'item', '').length, 4, 'Ordinary use plus three combat options; setup is not a frequent action');
assert.equal(model.catalog(hero, 'item', 'overclock').length, 1);
for (const invalid of [
    { kind: 'item', id: 1, action: 'drop', uid: 1 },
    { kind: 'item', id: 1, action: 'overclock' },
    { kind: 'item', id: 1, action: 'prototype', uid: 0 },
    { kind: 'item', id: 1, action: 'breakthrough', uid: Infinity }
]) assert.equal(model.binding(invalid), null);
assert.deepEqual(copy(model.binding({ kind: 'item', id: 1 })), { kind: 'item', id: 1 }, 'Legacy item bindings retain their format');
console.log('Pakellas enhanced-action identity, funding, reconfiguration and availability contracts passed.');
