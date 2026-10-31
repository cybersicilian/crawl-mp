const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let map;
const events = [];
const $ = () => ({ bind() {}, trigger(name, payload) { events.push([name, payload]); } });
$.each = (entries, fn) => entries.forEach((entry, i) => fn(i, entry));
vm.runInNewContext(fs.readFileSync(__dirname + '/../game_data/static/map_knowledge.js', 'utf8'), {
    document: {}, define(deps, factory) {
        map = factory($, { prepare_bg_flags: value => value }, { make_key: (x, y) => (y << 8) + x });
    }
});
map.clear();
map.merge([{ x: 3, y: 4, reset: true, mon: { id: 9, name: 'orc' },
    t: { bg: 1, cloud: 9, ov: [4], bloody: true }, item_name: 'a potion' }]);
const monster = map.get(3, 4).mon;
const retained = map.get(3, 4);
map.merge([{ x: 3, y: 4, reset: true, t: { bg: 2 } }]);
assert.equal(map.get(3, 4), retained, 'Map consumers retain the canonical cell reference');
assert.equal(map.get(3, 4).mon, undefined);
assert.equal(monster.refs, 0, 'Replacement releases the old monster reference');
assert.equal(map.get(3, 4).t.cloud, undefined);
assert.equal(map.get(3, 4).t.bloody, undefined);
assert.equal(map.get(3, 4).t.ov, undefined);
assert.equal(map.get(3, 4).item_name, undefined);
assert.equal(map.get(3, 4).t.bg, 2);
assert.equal(map.get(3, 4).reset, undefined);
map.merge([{ x: 3, y: 4, t: { fg: 5 }, mon: { id: 9, name: 'orc warrior' } }]);
assert.equal(map.get(3, 4).t.bg, 2, 'Legacy partial tile merges remain supported');
assert.equal(map.get(3, 4).mon.name, 'orc warrior');
assert.equal(map.dirty().length, 1, 'Replacement preserves existing repaint damage');
assert.equal(events.length, 3);
console.log('Map replacement clears entities, tile defaults, stale item names and refs; legacy deltas preserved.');
