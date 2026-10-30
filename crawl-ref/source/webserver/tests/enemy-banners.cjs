/* Native health bands, unknown invisible readings, and collision-free lanes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let model;
let statuses;
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,
    '../game_data/static/party-status-model.js'), 'utf8'), { define(deps, factory) { statuses = factory(); } });
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,
    '../game_data/static/enemy-banner-model.js'), 'utf8'), { define(deps, factory) { model = factory(statuses); } });
const visible = { id: 1, x: 4, y: 5, perception: 'visible', energy_deficit: 4, speed: 10,
    damage_level: 2, health: 'moderately wounded' };
assert.equal(model.project(visible).health, 70);
assert.equal(model.project(visible).initiative, 60);
assert.equal(model.project(visible).reading, '~4 aut');
assert.equal(model.project({ ...visible, energy_deficit: -3, ready: true }).initiative, 100);
assert.equal(model.project({ ...visible, energy_deficit: 99 }).initiative, 0);
assert.equal(model.project({ ...visible, damage_level: 9 }).health, null);
const memory = model.project({ ...visible, perception: 'last_known' });
assert.equal(memory.health, null, 'Invisible contacts expose no live health');
assert.equal(memory.initiative, null, 'Invisible contacts expose no live action energy');
assert.equal(memory.reading, 'Last known');
const effected = { ...visible, statuses_known: true, statuses: [
    { id: 2, text: 'fast', is_bad: false }, { id: 3, text: 'poisoned', is_bad: true }
] };
assert.equal(model.project(effected).effects.find(effect => effect.name === 'fast').tone, 'active');
assert.equal(model.project(effected).effects.find(effect => effect.name === 'poisoned').tone, 'bad');
assert.equal(model.project({ ...effected, perception: 'last_known' }).effects.length, 0,
    'Invisible memory strips even accidentally supplied live statuses');
assert.equal(model.project({ ...visible, statuses_known: true, statuses: [] }).effects.length, 0);
assert.equal(model.project(visible).effects[0].tone, 'unknown', 'Missing status data never means clear');
assert.equal(model.project({ x: 1, y: 2 }).health, null);
assert.equal(model.project({ x: 1, y: 2 }).initiative, null);
for (const width of [1440, 1024, 768]) {
    const card = { left: width - 300 + 41, top: 180 };
    const doom = { left: width - 300 + 4, width: 30 };
    const layout = model.layout(card, doom, { width, height: 900 });
    assert(!layout.compact);
    assert(layout.left + 158 < doom.left, 'Banners stay outside the complete Zot lane');
    assert.equal(layout.top, card.top);
}
assert(model.layout({ left: 42, top: 100 }, { left: 4, width: 30 }, { width: 390, height: 844 }).compact);
assert(model.layout({ left: 100, top: 100 }, null, { width: 1000, height: 900 }).compact);
assert(model.sameContact(visible, { ...visible, energy_deficit: 9 }), 'Live energy does not invalidate a menu');
assert(!model.sameContact(visible, { ...visible, x: 6 }), 'Moving monsters invalidate their menu');
assert(!model.sameContact(visible, { ...visible, perception: 'last_known' }));
console.log('Enemy banner injury, readiness, invisible-contact privacy, lane and stale-menu contracts passed.');
