const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const file = path.join(__dirname, '../static/scripts/image-grade.js');
const profile = { saturation: 0.72, contrast: 1.08, brightness: 1.07, tint: [169, 175, 141], tintAmount: 0.065 };
function load(document) {
    let result;
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { document, define(deps, factory) { result = factory(); } });
    return result;
}
test('grading preserves alpha, transparent RGB, byte bounds and useful color distinctions', () => {
    const grade = load({});
    const data = new Uint8ClampedArray([100, 40, 20, 0, 180, 50, 20, 128, 20, 50, 180, 255]);
    grade.pixels(data, profile);
    assert.deepEqual([...data.slice(0, 4)], [100, 40, 20, 0]);
    assert.equal(data[7], 128); assert.equal(data[11], 255);
    assert(data[4] > data[6], 'red remains distinct from blue');
    assert(data[10] > data[8], 'blue remains distinct from red');
    const identity = new Uint8ClampedArray([0, 100, 255, 127]);
    grade.pixels(identity, { ...profile, saturation: 1, contrast: 1, brightness: 1, tintAmount: 0 });
    assert.deepEqual([...identity], [0, 100, 255, 127]);
});
test('an image/profile pair is processed once and reloads invalidate cached output', () => {
    let processed = 0;
    const document = { createElement: () => ({ getContext: () => ({ filter: 'none',
        drawImage() { processed++; }, fillRect() {} }) }) };
    const cache = load(document).create();
    const source = { complete: true, naturalWidth: 32, naturalHeight: 32, src: 'atlas.png' };
    const first = cache.image(source, profile);
    assert.notEqual(first, source); assert.equal(first.width, 32); assert.equal(first.height, 32);
    for (let i = 0; i < 1000; i++) assert.equal(cache.image(source, profile), first);
    assert.equal(processed, 1);
    source.src = 'new-atlas.png';
    assert.notEqual(cache.image(source, profile), first); assert.equal(processed, 2);
    assert.equal(cache.image(source, undefined), source, 'UI icons can bypass the grade entirely');
    assert.equal(cache.image({ ...source, complete: false }, profile).complete, false);
});
test('fallback processing retains geometry and unreadable images retain original capability', () => {
    let written;
    const document = { createElement: () => ({ getContext: () => ({ drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray([180, 90, 40, 128]) }),
        putImageData(value) { written = value; } }) }) };
    const source = { complete: true, naturalWidth: 2, naturalHeight: 4, src: 'atlas.png' };
    const result = load(document).create().image(source, profile);
    assert.equal(result.width, 2); assert.equal(result.height, 4); assert.equal(written.data[3], 128);
    const broken = load({ createElement: () => ({ getContext: () => ({ drawImage() { throw new Error('unreadable'); } }) }) }).create();
    assert.equal(broken.image(source, profile), source);
});
test('semantic atlas regions can retain their exact original pixels after grading', () => {
    const calls = [];
    const document = { createElement: () => ({ getContext: () => ({ filter: 'none',
        drawImage: (...args) => calls.push(args), fillRect() {}, clearRect: (...args) => calls.push(args) }) }) };
    const source = { complete: true, naturalWidth: 64, naturalHeight: 64, src: 'atlas.png' };
    load(document).create().image(source, { ...profile, preserve: [{ x: 0, y: 0, width: 32, height: 32 }] });
    assert.deepEqual(calls.at(-2), [0, 0, 32, 32]);
    assert.deepEqual(calls.at(-1), [source, 0, 0, 32, 32, 0, 0, 32, 32]);
});
