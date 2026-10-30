const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let heat, model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/heat-help.js'), 'utf8'), {
    define(dependencies, factory) { heat = factory(); }
});
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/party-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
function attributes() {
    const values = new Map([['data-tip-html', 'stale generic help']]);
    return { setAttribute: (key, value) => values.set(key, String(value)),
        removeAttribute: key => values.delete(key), get: key => values.get(key) };
}
for (const [mp, state, used, free] of [[5, 'cool', 0, 5], [3, 'warm', 2, 3], [0, 'full', 5, 0]]) {
    const resource = model.magicResource({ species: 'Automaton', mp, mp_max: 5 });
    const target = attributes(); heat.apply(target, resource);
    assert.equal(target.get('data-heat-state'), state);
    assert.equal(target.get('data-tip-title'), `Heat: ${used} / 5`);
    assert.equal(target.get('aria-valuenow'), String(used));
    assert.equal(target.get('aria-valuemax'), '5');
    assert.equal(target.get('aria-valuetext'), `${used} of 5 heat used; ${free} capacity free`);
    assert.equal(target.get('data-tip-html'), undefined, 'Heat cannot retain stale MP HTML');
    assert.match(target.get('data-tip-body'), /4\/5 heat, a spell costing 2 heat must wait/);
    assert.match(target.get('data-tip-body'), /Press '5' to rest/);
    assert.match(target.get('data-tip-body'), /heat dissipation/);
    assert.match(target.get('data-tip-body'), /Guardian spirit absorbs damage by building heat/);
}
for (const resource of [null, {}, { value: null, max: 5 }, { value: 0, max: Infinity }]) {
    const target = attributes(); heat.apply(target, resource);
    assert.equal(target.get('data-heat-state'), 'unknown');
    assert.equal(target.get('aria-valuenow'), undefined);
    assert.match(target.get('aria-valuetext'), /unavailable/);
}
const zero = attributes(); heat.apply(zero, { value: 0, max: 0 });
assert.equal(zero.get('data-heat-state'), 'unavailable');
assert.equal(zero.get('aria-valuemax'), undefined, 'A meter cannot have equal min and max');
assert.equal(heat.caption({ value: 0, max: 0 }), 'No heat capacity');
assert.equal(heat.read({ value: -1, max: 5 }).used, 0);
assert.equal(heat.read({ value: 6, max: 5 }).free, 0);
console.log('Heat inversion, available capacity, zero/full/unknown states and accessible meter contracts passed');
