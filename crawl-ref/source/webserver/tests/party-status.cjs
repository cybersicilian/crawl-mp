/* Native snapshot projections: unknown is not healthy; religions differ. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/party-status-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
assert.equal(model.experience({ xl: 26, xl_cap: 26, xl_next: 0 }).capped, true);
assert.equal(model.experience({ xl: 26, xl_cap: 26, xl_next: 0 }).progress, 100);
assert.equal(model.experience({ xl: 25, xl_cap: 26, xl_next: 34 }).progress, 34);
assert.equal(model.experience({ xl: 1, xl_cap: 1 }).capped, true);
assert.equal(model.experience({ xl: 27 }).capped, true);
assert.equal(model.experience({}).progress, null);
assert.equal(model.effects({})[0].tone, 'unknown');
assert.equal(model.effects({ statuses: [], statuses_known: false })[0].tone, 'unknown');
assert.equal(model.effects({ statuses: [] }).length, 0);
const effects = model.effects({ statuses: [
    { id: 1, text: 'Hasted (expiring)', is_bad: false, dur: 3 },
    { id: 2, text: 'Poisoned', is_bad: true, dur: 6 },
    { id: 3, text: 'Unclassified effect', col: 4, dur: 0 }
] });
assert.equal(effects[0].name, 'Poisoned');
assert.equal(effects[0].duration, 6);
assert.equal(effects[1].expiring, true);
assert.equal(effects[2].tone, 'unknown', 'Color alone cannot classify native card effects');
assert.equal(effects[2].duration, null);
assert.equal(model.banes({}).known, false);
assert.equal(model.banes({ banes: [], banes_known: false }).known, false);
assert.equal(model.banes({ banes: [] }).known, true);
assert.equal(model.banes({ banes: [] }).entries.length, 0);
const bane = model.banes({ banes: [{ id: 4, name: 'Bane of Claustrophobia', desc: 'Walls oppress you.', recovery_xl_tenths: 13 }] }).entries[0];
assert.equal(bane.name, 'Bane of Claustrophobia');
assert.equal(bane.recovery, '1.3 XL of experience to recover');
assert.equal(bane.duration, undefined, 'Banes recover through XP, never a turn countdown');
assert.match(model.banes({ banes: [{ recovery_xl_tenths: 0 }] }).entries[0].recovery, /Less than 0.1/);
assert.match(model.banes({ banes: [{}] }).entries[0].recovery, /unavailable/);
assert.equal(model.faith({}).known, false);
for (const god of ['', 'No God']) {
    const faith = model.faith({ god, piety_rank: 6 });
    assert.equal(faith.name, 'No deity'); assert.equal(faith.rank, null);
}
const devout = model.faith({ god: 'the Shining One', piety_rank: 4, penance: 0, god_relation: 'Shared Covenant' });
assert.equal(devout.altar, 'DNGN_ALTAR_SHINING_ONE');
assert.equal(devout.rank, 4); assert.equal(devout.standing, 'allied');
assert.match(devout.summary, /4 of 6 stars/);
assert.equal(model.faith({ god: 'Jiyva Jafir', piety_rank: 2 }).altar, 'DNGN_ALTAR_JIYVA');
const penance = model.faith({ god: 'Trog', piety_rank: 2, penance: 8, god_relation: 'Anathema' });
assert.equal(penance.penance, true); assert.equal(penance.standing, 'rival');
assert.match(penance.summary, /Under penance/);
for (const god of ['Xom', 'Gozag']) {
    const faith = model.faith({ god, piety_rank: 6, penance: 0 });
    assert.equal(faith.rank, null, god + ' cannot masquerade as ordinary six-star favor');
}
assert.match(model.faith({ god: 'Xom' }).summary, /Penance information unavailable/);
for (const piety_rank of [-1, 7, '4', null]) assert.equal(model.faith({ god: 'Zin', piety_rank }).rank, null);
console.log('Party effect, unknown-data, favor, penance and deity projection contracts passed.');
const safePeer = { alive: true, slot: 1, can_act: true, region_combat: false };
assert.equal(model.activity(safePeer, { multiplayer: true, combat_locked: true }).label, 'Exploring');
assert.equal(model.activity({ ...safePeer, region_combat: true, can_act: false },
    { multiplayer: true, combat_locked: false }).label, 'Recovering');
console.log('Safe and recovering party cards use each hero encounter state.');

assert.equal(model.activity({ ...safePeer, connected: false }, { multiplayer: true }).label, 'Disconnected');
assert.equal(model.activity({ ...safePeer, connected: false, on_same_level: false }, { multiplayer: true }).label, 'Disconnected');
assert.equal(model.activity({ ...safePeer, connected: false, alive: false }, { multiplayer: true }).label, 'Downed');
assert.equal(model.activity({ ...safePeer, queued_action: 'j', queued_action_count: 3 }, { multiplayer: true }).label, 'Queued (3)');
assert.equal(model.activity({ ...safePeer, activity: 'rest' }, { multiplayer: true }).label, 'Resting');
assert.equal(model.activity({ ...safePeer, connected: false }, { multiplayer: false }).label, 'Exploring');
console.log('Connection, queue and automation status remain directly visible.');

const eldritch = model.faith({ species: 'Eldritch', god: '', defiance: 37, elder_rites: 2, elder_summary: 'Three stolen powers' });
assert.equal(eldritch.kind, 'defiance');
assert.equal(eldritch.worships, false);
assert.equal(eldritch.reserve, 37);
assert.match(eldritch.summary, /37\/100/);
assert.equal(eldritch.description, 'Three stolen powers');
