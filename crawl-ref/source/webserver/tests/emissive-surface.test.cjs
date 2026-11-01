const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const pixels = require('./helpers/bloom-fixture.cjs');
const cases = require('./fixtures/bloom-golden.json');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
let surface;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/emissive-surface.js'), 'utf8'), {
    define: (_names, factory) => { surface = factory(); }
});
for (const fixture of cases) test('bloom preserves captured pixels: ' + fixture.name, () => {
    const source = pixels(fixture), before = source.slice();
    assert.equal(sha(source), fixture.sourceSha256);
    const result = surface.bloom(source, fixture.width, fixture.height, fixture.padding);
    assert.equal(result.width, fixture.width + fixture.padding * 2);
    assert.equal(result.height, fixture.height + fixture.padding * 2);
    assert.equal(result.padding, fixture.padding);
    assert.equal(sha(result.data), fixture.outputSha256);
    assert.deepEqual(source, before);
});
