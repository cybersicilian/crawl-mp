const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/quickbar-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
const json = value => JSON.parse(JSON.stringify(value));
assert.equal(model.normalize().length, 10);
assert.equal(model.count, 10);
for (const [index, key] of Array.from('1234567890').entries()) {
    assert.equal(model.shortcut(index), key);
    assert.equal(model.keyIndex(key), index);
}
for (const key of ['', '10', 'a', '!', undefined]) assert.equal(model.keyIndex(key), -1);
assert.equal(model.shortcut(10), '');
const legacy = Array.from({ length: 8 }, (_, id) => ({ kind: 'item', id }));
assert.deepEqual(json(model.normalize(legacy)), [...legacy, null, null], 'Existing assignments retain their positions');
assert(json(model.normalize()).every(value => value === null));
for (const invalid of [{ kind: 'command', id: 1 }, { kind: 'item', id: -1 },
    { kind: 'item', id: 52.5 }, { kind: 'item', id: Number.MAX_SAFE_INTEGER + 1 },
    { kind: 'spell', id: '4' }, { kind: 'spell', id: Infinity }])
    assert.equal(model.binding(invalid), null);
assert.deepEqual(json(model.binding({ kind: 'item', id: 0, unexpected: 'ignored' })), { kind: 'item', id: 0 });
assert.deepEqual(json(model.normalize([{ kind: 'spell', id: 41, quick_cast: true }]))[0],
    { kind: 'spell', id: 41, quick_cast: true }, 'Quick cast survives saved binding normalization');
for (const kind of ['item', 'ability'])
    assert.equal(model.binding({ kind, id: 0, quick_cast: true }).quick_cast, undefined,
        'Only spells can retain a casting preference');
for (const value of [false, 'true', 1, null])
    assert.equal(model.binding({ kind: 'spell', id: 41, quick_cast: value }).quick_cast, undefined);
const consumables = [{ kind: 'item', id: 52 }, { kind: 'item', id: 126 }];
assert.deepEqual(json(model.normalize(consumables)).slice(0, 2), consumables, 'Consumable bindings survive storage normalization');
const hero = { inventory: [{ slot: 0, name: '2 potions of healing', letter: 'a' }],
    spells: [{ id: 41, name: 'Magic Dart', letter: 'c', schools: 'Conjurations' }],
    abilities: [{ id: 17, name: 'Blink', hotkey: 'b' }] };
assert.equal(model.resolve(hero, { kind: 'item', id: 0 }), hero.inventory[0]);
assert.equal(model.resolve(hero, { kind: 'spell', id: 41 }), hero.spells[0]);
hero.spells[0].letter = 'd';
assert.equal(model.resolve(hero, { kind: 'spell', id: 41 }).letter, 'd', 'Resolve current native shortcuts');
hero.inventory[0] = { slot: 0, name: 'a wand of flame' };
assert.equal(model.resolve(hero, { kind: 'item', id: 0 }).name, 'a wand of flame', 'Inventory pins follow their slot');
assert.equal(model.resolve({ inventory: [] }, { kind: 'item', id: 0 }), null);
assert.equal(model.resolve(hero, { kind: 'spell', id: 999 }), null);
hero.inventory.push({ slot: 52, name: '2 potions of might', letter: 'm' },
    { slot: 126, name: 'a scroll of butterflies', letter: 'b' });
for (const value of consumables) {
    assert.equal(model.resolve(hero, value).slot, value.id, 'Resolve native consumable slots beyond the gear pack');
    assert.equal(model.resolve({ inventory: [] }, value), null, 'Missing consumables stay unavailable');
}
assert.equal(model.resolve(hero, { kind: 'item', id: 127 }), null, 'Only entries in authoritative inventory resolve');
const art = { texture: 'main', layers: [{ texture: 'icons', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, ymax: 32 }] };
hero.equipment_profile = { items: [{ inv_slot: 126, art }] };
const remembered = model.remember(hero, consumables[1]);
assert.deepEqual(json(remembered), { kind: 'item', id: 126,
    last_item: { name: 'a scroll of butterflies', art } });
assert.deepEqual(json(model.normalize([remembered]))[0], json(remembered), 'Storage retains the last item appearance');
assert.deepEqual(json(model.remember({ inventory: [] }, remembered)), json(remembered), 'Depletion retains the item memory');
assert.equal(model.resolve({ inventory: [] }, remembered), null, 'Remembered items cannot resolve as carried items');
hero.inventory.find(entry => entry.slot === 126).name = 'a scroll of revelation';
assert.equal(model.remember(hero, remembered).last_item.name, 'a scroll of revelation', 'Live items replace stale memory');
assert.equal(model.remember(hero, null), null, 'Clearing removes item memory');
assert.equal(model.binding({ kind: 'spell', id: 41, last_item: remembered.last_item }).last_item, undefined);
assert.equal(model.binding({ kind: 'item', id: 52, last_item: { name: 123 } }).last_item, undefined);
assert.equal(model.binding({ kind: 'item', id: 52, last_item: { name: 'Potion', art: { layers: [null] } } }).last_item.art, undefined);
assert.equal(model.catalog(hero, 'spell', 'conjuration').length, 1);
assert.equal(model.catalog(hero, 'ability', 'missing').length, 0);
console.log('Quick bar binding, inventory-slot and current-power contracts passed.');
