/* Explicit native status facts, deterministic layers, and honest unknowns. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const modules = {};
for (const [name, file] of [
    ['item-properties', 'static/scripts/item-properties.js'],
    ['./status-icons', 'game_data/static/status-icons.js'],
    ['./party-status-model', 'game_data/static/party-status-model.js'],
    ['./portrait-status', 'game_data/static/portrait-status.js']
]) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    define(dependencies, factory) { modules[name] = factory(...dependencies.map(dependency => modules[dependency])); }
});
const project = modules['./portrait-status'].project;
const hero = names => ({ statuses: names.map((text, id) => ({ id, text, is_bad: true })) });
assert.equal(project({}).known, false);
assert.equal(project({ statuses_known: false, statuses: [{ text: 'Berserk' }] }).layers.length, 0);
assert.equal(project(hero([])).known, true);
assert.equal(project(hero([])).layers.length, 0);
const nativeNames = [
    ['berserking', 'berserk'], ['Bearserk', 'berserk'],
    ['hasted (expiring)', 'haste'], ['Fast', 'haste'],
    ['mildly poisoned (19 -> 14)', 'poison'], ['lethally poisoned (10 -> 0)', 'poison'],
    ['slowed', 'slow'], ['confused', 'confused'],
    ['petrifying', 'petrify'], ['petrified', 'petrify'],
    ['frozen', 'frozen'], ['on fire', 'burning'],
    ['invisible', 'invisible']
];
for (const [name, kind] of nativeNames) {
    const projection = project(hero([name]));
    assert.equal(projection.layers[0].kind, kind, name);
    assert.equal(projection.layers[0].glyph, modules['./status-icons'].resolve(kind), name + ' reuses canonical status icon');
}
for (const name of ['on berserk cooldown', '-Berserk', 'berserk cooldown', 'poison resistant',
    'poison vulnerable', 'confusing by touch', 'frozen ramparts', 'fire resistance',
    'not invisible', 'invisible (but backlit and visible)', 'Unreported blessing'])
    assert.equal(project(hero([name])).layers.length, 0, name + ' cannot invent an active treatment');
for (const combined of ['hasted and slowed', 'Fast+Slow'])
    assert.deepEqual(Array.from(project(hero([combined])).layers, layer => layer.kind), ['slow', 'haste']);
const many = ['hasted', 'confused', 'berserking', 'petrified', 'poisoned', 'invisible'];
const forward = project(hero(many)), backward = project(hero(many.slice().reverse()));
assert.deepEqual(Array.from(forward.layers, layer => layer.kind), ['petrify', 'berserk']);
assert.deepEqual(Array.from(backward.layers, layer => layer.kind), ['petrify', 'berserk']);
assert.equal(forward.layers.length, 2);
assert.equal(forward.count, 6);
assert.equal(forward.ghost, true, 'Known invisibility remains represented without adding an unbounded layer');
assert.equal(project(hero(['poisoned', 'poisoned'])).layers.length, 1);
assert.equal(project({ statuses: [{ text: 'Poisoned' }] }).layers[0].tone, 'unknown');
console.log('Portrait native-name, unknown-state, lookalike, combined-speed, priority, layer-bound and invisibility contracts passed.');
