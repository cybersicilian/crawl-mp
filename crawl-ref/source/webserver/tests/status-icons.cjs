/* Every native duration resolves to registered artwork; frame tone uses native facts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('./helpers/status-catalog.cjs');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
        define(names, factory) { result = factory(...names.map(name => dependencies[name])); }
    });
    return result;
}
const properties = load('static/scripts/item-properties.js');
const catalogData = load('game_data/static/effect-icon-catalog.js');
const art = load('game_data/static/effect-icon-art.js', { './effect-icon-catalog': catalogData });
const icons = load('game_data/static/status-icons.js', { 'item-properties': properties, './effect-icon-art': art });
const model = load('game_data/static/party-status-model.js');
assert(catalog.length >= 200, 'Coverage must include the complete duration table');
assert.equal(new Set(catalog.map(status => status.id)).size, catalog.length);
for (const status of catalog) {
    const effect = model.effects({ statuses: [status] })[0];
    assert(icons.has(icons.resolve(effect.name)), 'Registered art for ' + status.id);
    assert.equal(effect.tone, status.is_bad ? 'bad' : 'active');
    assert.equal(effect.duration, 7);
}
for (const [name, glyph] of [['Petrified', 'chain'], ['Stone', 'chain'], ['Barbed spikes', 'danger'],
    ['Teleporting', 'blink'], ['Hasted (expiring)', 'speed'], ['Elixired', 'heart'],
    ["In death's door", 'skull'], ['Marked', 'eye'], ['New unregistered effect', 'rune']])
    assert.equal(icons.resolve(name), glyph, name);
assert.equal(model.effects({ statuses: [{ text: 'New effect' }] })[0].tone, 'unknown');
console.log(catalog.length + ' native duration declarations resolve to registered glyphs; unknown and expiring projections passed.');
