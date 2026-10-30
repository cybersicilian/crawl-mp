/* Every native identity must select reviewed art without numeric ABI guesses. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let catalog, art;
vm.runInNewContext(fs.readFileSync(path.join(root, 'game_data/static/effect-icon-catalog.js'), 'utf8'), {
    define(deps, factory) { catalog = factory(); }
});
vm.runInNewContext(fs.readFileSync(path.join(root, 'game_data/static/effect-icon-art.js'), 'utf8'), {
    define(deps, factory) { art = factory(catalog); }
});
const native = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c',
    'import json,sys;sys.path.insert(0,sys.argv[1]);from effect_catalog import catalogue;print(json.dumps(catalogue()))',
    path.join(root, 'util')], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }));
assert.equal(catalog.entries.length, native.length);
assert.equal(new Set(catalog.entries.map(row => row[0])).size, native.length);
const counts = {};
for (const effect of native) {
    counts[effect.kind] = (counts[effect.kind] || 0) + 1;
    assert.equal(art.resolve({ iconKey: effect.key, name: 'Dynamic native label' }), effect.key);
    assert.equal(art.resolve({ key: effect.key }), effect.key);
    const entry = art.entries().find(row => row.key === effect.key);
    assert(Number.isInteger(entry.frame) && entry.frame >= 0);
    assert(entry.frame < catalog.atlas.columns * catalog.atlas.height / catalog.atlas.size);
    assert(entry.names.length > 0);
    assert(['', 'cooldown', 'immune', 'curse', 'borrowed', 'severe', 'depleted', 'blocked', 'charging'].includes(entry.modifier));
}
assert.deepEqual(counts, { duration: 255, status: 61, bane: 14, monster: 142 });
for (const [name, key] of [['Hasted (expiring)', 'DUR_HASTE'], ['Poisoned (19 -> 14)', 'DUR_POISONING'],
    ['Bane of Claustrophobia', 'BANE_CLAUSTROPHOBIA'], ['on blink cooldown', 'DUR_BLINK_COOLDOWN']])
    assert.equal(art.resolve({ name }), key);
assert.equal(art.resolve({ key: 1, iconKey: 'MB_EMPOWERED_SPELLS', name: 'empowered' }), 'MB_EMPOWERED_SPELLS');
assert.equal(art.resolve({ key: 1, iconKey: 'DUR_WYRM_CITRINITAS', name: 'empowered' }), 'DUR_WYRM_CITRINITAS');
assert.equal(art.resolve({ key: 1, iconKey: 'FUTURE_EFFECT', name: 'Hasted' }), null);
assert.equal(art.resolve({ key: 1, name: 'Future effect' }), null);
assert.equal(art.resolve({ key: 'unknown', name: 'Hasted' }), null);
assert.equal(art.resolve({ iconKey: '__proto__' }), null);
assert.equal(art.resolve({ key: 1 }), null, 'Numeric effect ids differ across native versions');
assert(fs.existsSync(path.join(root, catalog.atlas.url.replace(/^\//, ''))));
console.log(native.length + ' native effect identities have reviewed art; symbolic keys, legacy labels, state variants and unknowns passed.');
