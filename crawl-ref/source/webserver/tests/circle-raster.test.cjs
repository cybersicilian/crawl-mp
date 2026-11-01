const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const cases = require('./fixtures/circle-golden.json');
const {profiles} = require('./helpers/circle-fixture.cjs');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
let field;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/region-field.js'), 'utf8'), {
    define: (_names, factory) => {field = factory();}
});
for (const item of cases) test('prepared circle preserves captured pixels: ' + item.name, () => {
    const [x,y,radius] = item.group, [cx,cy] = item.origin, profile = profiles[item.profile];
    const group = {center: {x,y}, radius}, before = JSON.stringify([group,profile]);
    const prepared = field.prepareCircle(group,cx,cy,item.size,item.size,profile);
    const data = field.circlePixels(prepared,item.seconds);
    assert.equal(sha(data),item.sha256);
    const point = new Uint8ClampedArray(data.length);
    for(let py=0;py<item.size;py++)for(let px=0;px<item.size;px++){
        const sample = field.circle(group,cx+(px+.5)/item.size,cy+(py+.5)/item.size,item.seconds,profile),n=(py*item.size+px)*4;
        point.set(sample.colour,n);point[n+3]=sample.alpha*255;
    }
    assert.equal(sha(point),item.sha256,'point API retains captured behavior');
    assert.equal(prepared.bytes,item.size*item.size*28);
    data.fill(0);assert.equal(sha(field.circlePixels(prepared,item.seconds)),item.sha256,'output is independently owned');
    assert.equal(JSON.stringify([group,profile]),before);
});
