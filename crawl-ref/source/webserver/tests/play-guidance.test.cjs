/* Next-step suggestions, click intent and the attack card's damage parsing. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load(file, modules = {}) {
    let result;
    const source = fs.readFileSync(path.join(__dirname, '../game_data/static', file), 'utf8');
    vm.runInNewContext(source, { define(dependencies, factory) {
        result = typeof dependencies === 'function' ? dependencies()
            : factory(...dependencies.map(name => modules[name]));
    } });
    return result;
}
const guide = load('play-guide-model.js');
const pointer = load('pointer-intent-model.js');
const attack = load('attack-info.js', { jquery: () => ({}) });
const hero = (overrides = {}) => ({ hp: 30, hp_max: 30, floor_items_known: true, floor_items: [], inventory: [], ...overrides });
const ids = view => Array.from(guide.suggest(view), step => step.id);

test('a safe, healthy hero is pointed at exploring', () => {
    assert.deepEqual(ids({ hero: hero(), enemies: [] }), ['explore']);
});
test('a blocked hero gets the native reason and no action', () => {
    const [step] = guide.suggest({ hero: hero(), blocked: 'Finish the current menu first.' });
    assert.equal(step.id, 'wait');
    assert.equal(step.code, undefined);
    assert.equal(step.reason, 'Finish the current menu first.');
});
test('enemies replace exploring, and danger prefers a known healing potion', () => {
    const enemies = [{ name: 'orc', threat: 2, distance: 1 }, { name: 'kobold', threat: 1, distance: 4 }];
    const healthy = guide.suggest({ hero: hero(), enemies });
    assert.deepEqual(Array.from(healthy, step => step.id), ['fight']);
    assert.equal(healthy[0].tone, 'danger');
    assert.match(healthy[0].reason, /orc and 1 more/);
    const hurt = guide.suggest({ hero: hero({ hp: 8, inventory: [{ name: '2 potions of curing' }] }), enemies });
    assert.deepEqual(Array.from(hurt, step => step.id), ['quaff', 'fight']);
    assert.equal(hurt[0].item.name, '2 potions of curing');
});
test('danger on stairs offers the escape without leaving the fight option', () => {
    assert.deepEqual(ids({ hero: hero({ hp: 5, stairs: 'down' }), enemies: [{ name: 'orc', threat: 1, distance: 1 }] }), ['down', 'fight']);
});
test('recovery, loot and floor completion lead in that order', () => {
    const steps = ids({ hero: hero({ hp: 10, floor_items: [{ name: 'a dagger' }] }), enemies: [], explored: true, stairsKnown: true });
    assert.deepEqual(steps, ['rest', 'pickup', 'travel']);
    assert.deepEqual(ids({ hero: hero({ stairs: 'down' }), enemies: [], explored: true }), ['down']);
    assert.deepEqual(ids({ hero: hero(), enemies: [], explored: true, stairsKnown: false }), ['explore']);
});
test('a learnable spell is offered but never crowds out the next step', () => {
    const steps = ids({ hero: hero({ hp: 10, spell_library: { memorisable: 2 }, floor_items: [{ name: 'gold' }] }), enemies: [] });
    assert.deepEqual(steps, ['rest', 'pickup', 'explore']);
    assert.deepEqual(ids({ hero: hero({ spell_library: { memorisable: 1 } }), enemies: [] }), ['explore', 'memorise']);
});

const tile = (feature, extra = {}) => ({ t: {}, feature_name: feature, ...extra });
const click = (cell, view = {}) => pointer.classify({ cell, visible: true, distance: 3, adjacent: false, ...view });
test('clicks are described by what the engine will do', () => {
    assert.equal(click(tile('the floor'), { steps: 4 }).left, 'Walk here · 4 moves');
    assert.equal(click(tile('the floor'), { steps: 1 }).left, 'Walk here · 1 move');
    assert.equal(click(tile('the floor')).left, 'Walk here');
    assert.equal(click(tile('a stone wall')).kind, 'solid');
    assert.equal(click(tile('a closed door')).kind, 'door');
    assert.equal(click(tile('a stone staircase leading down'), { steps: 2 }).kind, 'stairs');
    assert.equal(click(tile('the floor', { item_name: 'a dagger' }), { steps: 2 }).kind, 'item');
    assert.equal(click(undefined).kind, 'unknown');
    assert.equal(click({}).kind, 'unknown');
});
test('adjacent hostiles are attacks, distant ones are approaches, allies never read as attacks', () => {
    const orc = tile('the floor', { mon: { name: 'orc', att: 0, threat: 2 } });
    assert.equal(click(orc, { adjacent: true, distance: 1 }).left, 'Attack');
    assert.equal(click(orc).threat, 'Dangerous');
    assert.match(click(orc).left, /Walk toward it/);
    assert.equal(click(orc, { harmless: true }).threat, '');
    assert.equal(click(tile('the floor', { mon: { name: 'hound', att: 4 } })).kind, 'neutral');
    assert.equal(click(orc, { ally: { name: 'Lyra' } }).kind, 'ally');
});
test('a remembered monster does not read as a live target', () => {
    const orc = tile('the floor', { mon: { name: 'orc', att: 0, threat: 2 } });
    assert.equal(click(orc, { visible: false, steps: 3 }).kind, 'walk');
});
test('a blocked hero or an open targeting prompt owns the click', () => {
    assert.equal(click(tile('the floor'), { blocked: 'Waiting for your turn.' }).left, 'Waiting for your turn.');
    assert.equal(click(tile('the floor'), { targeting: true }).kind, 'target');
});

test('the attack card separates the engine rating from its breakdown', () => {
    const parsed = attack.rating('17 (Base 15 x 100% (Str) x 110% (Skill)) + 2 (Ench).');
    assert.equal(parsed.value, 17);
    assert.equal(parsed.detail, '(Base 15 x 100% (Str) x 110% (Skill)) + 2 (Ench)');
    assert.equal(attack.rating('your enemies will bleed and die for Makhleb.'), null);
    assert.equal(attack.rating(undefined), null);
});
