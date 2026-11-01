/* Time order, shared beats, identical-creature tokens and the rail's token limit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/turn-order-model.js'), 'utf8'),
    { define(deps, factory) { model = factory(); } });
const hero = (slot, wait, banked = 0) => ({ kind: 'hero', id: `hero:${slot}`, name: `Hero ${slot}`, wait, banked });
const enemy = (id, name, wait, state = 'recovering', threat = 'easy') =>
    ({ kind: 'enemy', id: `enemy:${id}`, name, wait, banked: 0, state, threat });
// Round-tripped because arrays built inside the sandbox fail strict comparison.
const plain = value => JSON.parse(JSON.stringify(value));
const shape = view => plain(view.beats.map(beat => [beat.reading, beat.tokens.map(token => `${token.name}×${token.count}`)]));

assert.equal(model.readingText(0), 'Now');
assert.equal(model.readingText(7), '+7');
assert.equal(model.readingText(null), '?', 'Unknown timing is never shown as a number');

const fight = [enemy(1, 'ogre', 17), enemy(2, 'goblin', 10), hero(0, 0), enemy(3, 'orc', 7), enemy(4, 'goblin', 10),
    enemy(5, 'rat', 0), hero(1, 0, 5), enemy(6, 'ghost', null, 'remembered')];
assert.deepEqual(shape(model.beats(fight, 14)), [
    ['Now', ['Hero 1×1', 'Hero 0×1', 'rat×1']],
    ['+7', ['orc×1']],
    ['+10', ['goblin×2']],
    ['+17', ['ogre×1']],
    ['?', ['ghost×1']]
], 'Banked time leads its beat, heroes precede creatures and unknown timing comes last');
assert.equal(model.beats(fight, 14).beats[2].tokens[0].id, 'enemy:2', 'A merged token keeps a stable first identity');
assert.equal(fight[1].count, undefined, 'Projection leaves the native entries unchanged');

const mixed = [enemy(1, 'goblin', 10), enemy(2, 'goblin', 10, 'recovering', 'nasty'), enemy(3, 'goblin', 10, 'unknown')];
assert.equal(model.beats(mixed, 14).beats[0].tokens.length, 3, 'Only identical readings share a token');
assert.equal(model.beats([hero(0, 0), hero(1, 0)], 14).beats[0].tokens.length, 2, 'Heroes never merge');

const crowd = Array.from({ length: 20 }, (_, index) => enemy(index, `creature ${String(index).padStart(2, '0')}`, index + 1));
const limited = model.beats(crowd, 14);
assert.equal(limited.beats.flatMap(beat => beat.tokens).length, 14);
assert.equal(limited.hidden, 6, 'Everyone past the limit is counted');
const stacked = model.beats([...crowd.slice(0, 14), enemy(30, 'creature 13', 14)], 14);
assert.equal(stacked.hidden, 0, 'A token already on the rail still gathers its twins');
assert.equal(stacked.beats.at(-1).tokens.at(-1).count, 2);
assert.deepEqual(plain(model.beats([], 14)), { beats: [], hidden: 0 });
console.log('Turn order beats, token merging and limit contracts passed.');
