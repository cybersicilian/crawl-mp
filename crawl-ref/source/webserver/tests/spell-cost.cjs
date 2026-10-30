const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let costs;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/spell-cost.js'), 'utf8'), {
    define(deps, factory) { costs = factory(); }
});
const hp = amount => ({ mp_cost: amount, casting_cost: { resource: 'hp', amount } });
const mp = amount => ({ mp_cost: amount, casting_cost: { resource: 'mp', amount } });
const djinni = { species: 'Djinni', hp: 3, mp: 0, spell_resource: 'hp' };
assert.equal(costs.format(hp(2)), '2 HP');
assert.equal(costs.reason(djinni, hp(2)), '');
assert.match(costs.reason(djinni, hp(3)), /at least 1 HP/);
assert.match(costs.reason(djinni, hp(4)), /Not enough health/);
assert.equal(costs.reason({ hp: 1 }, hp(0)), '', 'Free HP casting preserves the last HP');
assert.match(costs.reason({ hp: 0 }, hp(0)), /Not enough health/);
assert.match(costs.reason({ mp: 100 }, hp(1)), /Health information unavailable/);
assert.equal(costs.resource(djinni), 'hp');
assert.equal(costs.resource({ spells: [hp(1)] }), 'hp');
assert.equal(costs.reason({ hp: 3, mp: 1 }, mp(1)), '', 'MP spending may empty the mana pool');
assert.match(costs.reason({ hp: 100, mp: 0 }, mp(1)), /Not enough magic/);
assert.equal(costs.reason({ mp: 0 }, mp(0)), '');
assert.equal(costs.format({ mp_cost: 2 }), '2 MP', 'Legacy MP snapshots remain supported');
assert.match(costs.reason(djinni, { casting_cost: { resource: 'hp', amount: 1, payable: false } }), /Cannot pay/);
for (const casting_cost of [null, {}, { resource: 'xp', amount: 1 },
    { resource: 'hp', amount: -1 }, { resource: 'mp', amount: NaN }]) {
    const entry = { mp_cost: 0, casting_cost };
    assert.equal(costs.format(entry), 'Unavailable');
    assert.match(costs.reason(djinni, entry), /unavailable/);
}
assert.equal(costs.format({}), 'Unavailable');
console.log('Spell resource, native payment, HP survival, MP and legacy contracts passed.');
