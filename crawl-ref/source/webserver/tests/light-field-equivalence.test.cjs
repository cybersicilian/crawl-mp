const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const fixture = require('./helpers/light-field-fixture.cjs');
const cases = require('./fixtures/light-field-golden.json');
let lighting;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/tile-lighting.js'), 'utf8'), {
    define: (_deps, factory) => { lighting = factory(); }
});
for (const item of cases) test('field preserves captured visibility: ' + item.name, () => {
    const {view, cells} = fixture.input(item), before = JSON.stringify(cells);
    const map = new Map(cells.map(cell => [cell.x + ':' + cell.y, cell]));
    let reads = 0;
    const field = lighting.create(view, (x, y) => {reads++; return map.get(x + ':' + y);}, item.limit);
    assert.equal(reads, item.cols * item.rows);
    const actual = crypto.createHash('sha256').update(fixture.record(field, view)).digest('hex');
    assert.equal(actual, item.outputSha256);
    assert.equal(JSON.stringify(cells), before);
});
