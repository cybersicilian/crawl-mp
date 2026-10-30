/* Trust contracts: absent facts, known-empty arrays, literal quantities and risk. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/party-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
for (const species of ['Minotaur', 'Gargoyle', 'Deep Elf']) {
    const member = model.normalize({ species, job: 'Conjurer', abilities: [], spells: [], inventory: [] });
    assert.equal(member.abilities.length, 0);
    assert.equal(member.spells.length, 0);
    assert.equal(member.inventory.length, 0);
    assert.equal(member.inventory_known, true);
    assert.equal(member.spells_known, true);
    assert.equal(member.str, undefined);
    assert.equal(member.god, undefined);
    assert.equal(member.resists.rPois, undefined);
}
const unavailable = model.normalize({ species: 'Minotaur', job: 'Fighter' });
assert.equal(unavailable.inventory_known, false);
assert.equal(unavailable.floor_items_known, false);
assert.equal(unavailable.floor_items.length, 0);
assert.equal(model.normalize({ floor_items: [] }).floor_items_known, true);
assert.equal(model.normalize({ floor_items: [], floor_items_known: false }).floor_items_known, false);
assert.equal(unavailable.abilities_known, false);
assert.equal(unavailable.abilities.length, 0);
assert.equal(model.display(undefined), 'Unavailable');
assert.equal(model.speciesName({ species: 'Human', trait: 'mummy' }), 'Mummy Human');
assert.equal(model.speciesName({ species: 'Minotaur', trait: 'none' }), 'Minotaur');
assert.equal(model.speciesName({ species: 'Poltergeist' }), 'Poltergeist');
assert.equal(model.speciesName({ species: 'Hydra', heads: 1 }), 'Hydra (1 head)');
assert.equal(model.speciesName({ species: 'Hydra', trait: 'ghost', heads: 7 }), 'Ghost Hydra (7 heads)');
assert.equal(model.speciesName({ species: 'Hydra' }), 'Hydra');
assert.deepEqual(JSON.parse(JSON.stringify(model.magicResource({ species: 'Automaton', mp: 12, mp_max: 20 }))),
    { label: 'Heat', value: 8, max: 20, percent: 40 });
assert.deepEqual(JSON.parse(JSON.stringify(model.magicResource({ species: 'Human', mp: 12, mp_max: 20 }))),
    { label: 'MP', value: 12, max: 20, percent: 60 });
assert.equal(model.magicResource({ species: 'Automaton', mp: 0, mp_max: 0 }).percent, 0);
assert.equal(model.magicResource({ species: 'Automaton' }).value, null);
assert.equal(model.display(0), '0');
assert.notEqual(model.cardSignature({ members: [{ slot: 0, xl: 10, xl_cap: 27 }] }, 0, false),
    model.cardSignature({ members: [{ slot: 0, xl: 10, xl_cap: 26 }] }, 0, false),
    'A level-cap reduction must refresh the character card even below the cap');
assert.equal(model.percentage('12%'), '12%');
assert.equal(model.percentage(12), '12%');
assert.equal(model.percentage(undefined), 'Unavailable');
assert.equal(model.itemName({ name: '2 potions of might', qty: 2 }), '2 potions of might');
assert.equal(model.controlledSlot({ controlled_slot: 0, active_slot: 1 }), 0);
assert.equal(model.controlledSlot({ controlled_slot: 1, active_slot: 0 }), 1);
assert.equal(model.controlledSlot({ controlled_slot: null, active_slot: 2 }), 0,
    'A spectator follows the host projection even when a guest is acting');
assert.equal(model.canControl({ controllable_slots: [0, 2] }, 1), false);
assert.equal(model.canControl({ controllable_slots: [0, 2] }, 2), true);
const controlState = { controlled_slot: 0, controllable_slots: [0, 2], members: [
    { slot: 0, alive: true }, { slot: 1, alive: true }, { slot: 2, alive: true }] };
assert.equal(model.canSwitch(controlState), true);
assert.equal(model.canSwitch({ ...controlState, controllable_slots: [0] }), false);
assert.equal(model.canSwitch({ ...controlState, controllable_slots: [] }), false);
assert.equal(model.canSwitch({ ...controlState, members: [{ slot: 2, alive: false }] }), false);
assert.equal(model.canSwitch({ ...controlState, members: [{ slot: 2, alive: true, ghost_haunting: true }] }), false);
const rpgHero = model.normalize({
    species: 'Minotaur',
    job: 'Berserker',
    equipment_slots: [{ slot_name: 'Weapon', empty: false, letter: 'a', name: '+4 broad axe' }],
    kills_top: [{ name: 'Sigmund', key: 'sigmund', count: 1, exp: 134 }],
    actions: [{ category: 'Melee', total: 182, subtypes: [{ name: 'Broad axe', count: 140 }] }],
    runes: ['decaying'],
    gems: ['smoky']
});
assert.equal(rpgHero.equipment_slots.length, 1);
assert.equal(rpgHero.kills_top.length, 1);
assert.equal(rpgHero.actions.length, 1);
assert.deepEqual(rpgHero.runes, ['decaying']);
assert.deepEqual(rpgHero.gems, ['smoky']);
// Rendering cache invalidates for visible facts and control permissions, not motion.
const cardState = { controllable_slots: [0], members: [{ slot: 0, name: 'Lyra', hp: 10,
    spells: [{ letter: 'a', name: 'Magic Dart', level: 1 }], mutations: [] }] };
const signature = model.cardSignature(cardState, 0, false);
for (const change of [
    state => { state.members[0].hp = 9; },
    state => { state.members[0].poison_survival = 4; },
    state => { state.members[0].real_hp_max = 20; },
    state => { state.members[0].trait = 'ghost'; },
    state => { state.members[0].heads = 4; },
    state => { state.members[0].xl_next = 23; },
    state => { state.members[0].spells[0].name = 'Foxfire'; },
    state => { state.members[0].piety_rank = 4; },
    state => { state.members[0].penance = 9; },
    state => { state.members[0].statuses = [{ text: 'Poisoned', dur: 6, is_bad: true }]; },
    state => { state.members[0].statuses_known = false; },
    state => { state.members[0].banes = [{ id: 1, name: 'Bane of Lethargy', recovery_xl_tenths: 13 }]; },
    state => { state.members[0].banes = []; },
    state => { state.members[0].banes_known = false; },
    state => { state.members[0].connected = false; },
    state => { state.members[0].activity = 'yield'; },
    state => { state.members[0].queued_action = 'move'; },
    state => { state.members[0].queued_action_count = 2; },
    state => { state.controllable_slots = []; }
]) {
    const changed = structuredClone(cardState); change(changed);
    assert.notEqual(model.cardSignature(changed, 0, false), signature);
}
assert.notEqual(model.cardSignature(cardState, 1, false), signature);
assert.notEqual(model.cardSignature(cardState, 0, true), signature);
const moved = structuredClone(cardState);
moved.members[0].pos = { x: 5, y: 8 }; moved.members[0].aut_clock = 200;
assert.equal(model.cardSignature(moved, 0, false), signature);
console.log('Party data trust contracts passed.');
const directions = { controlled_slot: 0, members: [{ slot: 0, place: 'D:1', pos: { x: 0, y: 0 } }] };
for (const [x, y, expected] of [[0, -2, 'N'], [2, -2, 'NE'], [2, 0, 'E'], [2, 2, 'SE'],
    [0, 2, 'S'], [-2, 2, 'SW'], [-2, 0, 'W'], [-2, -2, 'NW']]) {
    const relative = model.relativePosition(directions, { slot: 1, place: 'D:1', pos: { x, y } });
    assert.equal(relative.direction, expected); assert.equal(relative.distance, 2);
}
assert.equal(model.relativePosition(directions, { slot: 1, place: 'D:2', pos: { x: 2, y: 2 } }).kind, 'away');
assert.equal(model.relativePosition(directions, { slot: 1, place: 'D:1' }).kind, 'unknown');
assert.equal(model.relativePosition(directions, directions.members[0]).kind, 'self');
console.log('Party compass floor and direction contracts passed.');
assert.equal(model.inCombat({ multiplayer: true, combat_locked: true }, { region_combat: false }), false);
assert.equal(model.inCombat({ multiplayer: true, combat_locked: false }, { region_combat: true }), true);
assert.equal(model.inCombat({ multiplayer: true, combat_locked: true }, {}), true);
assert.equal(model.inCombat({ combat_locked: false }, { region_combat: true }), false);
console.log('Personal encounter state overrides broad flags, with legacy and solo fallback.');
