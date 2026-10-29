const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modules = {};
for (const name of ['party-model', 'party-progress-model']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/', name + '.js'), 'utf8'), {
        define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
    });
}
const project = modules['./party-progress-model'].project;
assert.equal(project(null).gold, null);
assert.equal(project(null).place, null);
assert.equal(project(null).runesKnown, false);
const state = { controlled_slot: 1, gold: 0, members: [
    { slot: 0, place: 'D:1', runes: ['serpentine', 'silver'] },
    { slot: 1, place: 'D:2', runes: ['silver', 'golden'] }
] };
assert.equal(project(state).gold, 0);
assert.equal(project(state).place, 'D:2');
assert.equal(project(state).runes.length, 3, 'Party rune union does not double-count');
assert.equal(project(state).runes[0].tile, 'RUNE_SNAKE');
assert.equal(project(state).runesKnown, true);
state.members[0].runes_known = false;
assert.equal(project(state).runesKnown, false);
state.members[1].runes.push('new-native-rune');
assert.equal(project(state).runes.at(-1).tile, null, 'Unknown artwork does not impersonate a known rune');
state.members[1].runes.push('__proto__');
assert.equal(project(state).runes.at(-1).tile, null, 'Only canonical rune names resolve artwork');
assert.equal(project({ members: {} }).runesKnown, false);
assert.equal(project({ members: [{ slot: 0, runes: {} }] }).runesKnown, false);
for (const gold of [-1, '19', Infinity]) assert.equal(project({ ...state, gold }).gold, null);
console.log('Shared gold, controlled-floor and rune collection trust contracts passed.');
