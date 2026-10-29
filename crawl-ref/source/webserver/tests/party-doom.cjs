const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/party-doom-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
const hero = (name, remaining, changes = {}) => ({ name, alive: true, place: 'D:1',
    zot_clock: { active: true, immune: false, remaining_aut: remaining, reference_aut: 270000,
        warning: 0, short_lifespans: 0, lifespan_divisor: 1, ...changes } });
assert.equal(model.project(null).status, 'unknown');
assert.equal(model.project({ members: {} }).status, 'unknown');
assert.equal(model.project({ members: [hero('A', 0)] }).turns, 0);
const state = { members: [hero('A', 60000), hero('B', 6000, { short_lifespans: 1, lifespan_divisor: 10 })] };
assert.equal(model.project(state).hero, 'B');
assert.equal(model.project(state).turns, 600);
assert.equal(model.project(state).pressure, 10);
assert.equal(model.project(state).fraction, 6000 / 270000);
state.members[1].alive = false;
assert.equal(model.project(state).hero, 'A');
state.members[1].alive = true;
state.members[1].ghost_haunting = true;
assert.equal(model.project(state).hero, 'A');
state.members[1].ghost_haunting = false;
state.members[1].zot_clock.active = false;
assert.equal(model.project(state).hero, 'A', 'Paused clocks never displace an advancing deadline');
state.members[0].zot_clock.active = false;
assert.equal(model.project(state).status, 'paused');
state.members.forEach(member => { member.zot_clock.immune = true; });
assert.equal(model.project(state).status, 'stopped');
for (const value of [undefined, null, '6000', NaN, Infinity, -1]) {
    assert.equal(model.project({ members: [hero('A', value)] }).status, 'unknown');
}
assert.equal(model.project({ members: [hero('A', 6000), { name: 'Missing' }] }).status, 'unknown');
assert.equal(model.turns(0.01), '0.1');
assert.equal(model.turns(6000), '6,000');
console.log('Zot deadline, party pressure, pause, immunity and missing-data contracts passed.');
