const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
let factory;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/deferred-images.js'), 'utf8'), {
    define(deps, create) { factory = create(); }
});
class ImageFixture extends EventTarget {
    constructor() { super(); this.dataset = { src: '/optional.png?v=first' }; this.requests = []; this.complete = true; this.naturalWidth = 0; }
    getAttribute() { return this.url || null; }
    set src(url) { this.url = url; this.complete = false; this.requests.push(url); }
    load() { this.complete = true; this.naturalWidth = 128; this.dispatchEvent(new Event('load')); }
    fail() { this.complete = true; this.naturalWidth = 0; this.dispatchEvent(new Event('error')); }
}
test('optional image activation is explicit and repeated draws share one request', () => {
    let loaded = 0; const loader = factory.create({ onLoad: () => loaded++ }), image = new ImageFixture();
    assert.equal(image.requests.length, 0);
    for (let i = 0; i < 100; i++) assert.equal(loader.request(image), image);
    assert.equal(image.requests.length, 1); image.load();
    for (let i = 0; i < 100; i++) loader.request(image);
    image.load(); assert.equal(loaded, 1); assert.equal(image.requests.length, 1);
});
test('a failed sheet cannot create a render-loop retry storm but a new URL can recover', () => {
    let errors = 0, loaded = 0;
    const loader = factory.create({ onError: () => errors++, onLoad: () => loaded++ }), image = new ImageFixture();
    loader.request(image); image.fail();
    for (let i = 0; i < 100; i++) loader.request(image);
    assert.equal(image.requests.length, 1); assert.equal(errors, 1);
    image.dataset.src = '/optional.png?v=repaired'; loader.request(image); image.load();
    assert.equal(image.requests.length, 2); assert.equal(loaded, 1); assert.equal(errors, 1);
});
test('missing elements and already loaded sources require no network or completion callback', () => {
    let loaded = 0; const loader = factory.create({ onLoad: () => loaded++ }), image = new ImageFixture();
    assert.equal(loader.request(null), null);
    image.url = image.dataset.src; image.complete = true; image.naturalWidth = 128;
    loader.request(image); assert.equal(image.requests.length, 0); assert.equal(loaded, 0);
});
test('superseded pending URLs remove their event listeners before replacement', () => {
    let loaded = 0; const loader = factory.create({ onLoad: () => loaded++ }), image = new ImageFixture();
    const callbacks = [], add = image.addEventListener.bind(image);
    image.addEventListener = (name, callback) => { if (name === 'load') callbacks.push(callback); add(name, callback); };
    loader.request(image); image.dataset.src = '/optional.png?v=second'; loader.request(image);
    image.naturalWidth = 128; callbacks[0](); assert.equal(loaded, 0);
    image.load(); assert.equal(loaded, 1); assert.equal(image.requests.length, 2);
});
