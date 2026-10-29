/* Native snapshot projections: unknown is not healthy; religions differ. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/party-status-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
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
