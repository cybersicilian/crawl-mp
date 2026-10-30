const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/party-doom-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
const hero = (name, remaining, changes = {}) => ({ name, alive: true, place: 'D:1',
    zot_clock: { active: true, immune: false, remaining_aut: remaining, reference_aut: 270000, capacity_aut: 270000,
        warning: 0, short_lifespans: 0, lifespan_divisor: 1, ...changes } });
assert.equal(model.project(null).status, 'unknown');
assert.equal(model.project({ members: {} }).status, 'unknown');
assert.equal(model.project({ members: [hero('A', 0)] }).turns, 0);
const state = { members: [hero('A', 60000), hero('B', 6000, { short_lifespans: 1, lifespan_divisor: 10 })] };
assert.equal(model.project(state).hero, 'B');
assert.equal(model.project(state).turns, 600);
assert.equal(model.project(state).pressure, 10);
assert.equal(model.project(state).fraction, 1 - 6000 / 270000);
const fill = (remaining, capacity_aut = 270000) => model.project({ members: [hero('A', remaining, { capacity_aut })] }).fraction;
assert.equal(fill(270000), 0, 'Full time allowance means empty danger meter');
assert.equal(fill(0), 1, 'The deadline fills the meter');
assert(fill(50000) > fill(60000), 'Time spent fills the meter');
assert(fill(70000) < fill(60000), 'Time restored drains the danger meter');
assert.equal(fill(13500, 27000), 0.5, 'Short lifespan uses effective capacity');
assert.equal(fill(229500, 459000), 0.5, 'Party capacity does not use the fixed reference');
assert.equal(fill(300000), 0, 'Excess banked time cannot create negative danger');
for (const capacity_aut of [undefined, 0, -1, '270000', Infinity])
    assert.equal(model.project({ members: [hero('A', 100, { capacity_aut })] }).status, 'unknown');
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
