/* A game must never consume a failed, undecoded or superseded atlas. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(images) {
    let wait, next = 0, ready = 0, now = 0;
    const timers = new Map(), errors = [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,
        '../static/scripts/asset-readiness.js'), 'utf8'), {
        define(deps, factory) { wait = factory(); }, URL, document: { baseURI: 'https://game.test/' },
        setTimeout(callback, ms) { timers.set(++next, {callback, ms, due: now + ms}); return next; },
        clearTimeout(id) { timers.delete(id); }
    });
    const cancel = wait({querySelectorAll: () => images}, () => ready++, error => errors.push(error));
    return {cancel, timers, errors, ready: () => ready,
        advance(ms) {
            const end = now + ms;
            while (true) {
                const entry = [...timers].filter(([, value]) => value.due <= end)
                    .sort((a, b) => a[1].due - b[1].due)[0];
                if (!entry) break;
                now = entry[1].due; timers.delete(entry[0]); entry[1].callback();
            }
            now = end;
        },
        tick(ms) {
            const entry = [...timers].find(([, value]) => value.ms === ms);
            assert(entry, 'Expected timer ' + ms);
            timers.delete(entry[0]); entry[1].callback();
        }};
}

class ImageFixture extends EventTarget {
    constructor(complete = false, width = 0) {
        super(); this.tagName = 'IMG'; this.complete = complete; this.naturalWidth = width;
        this.url = 'https://game.test/floor.png?v=frozen'; this.requests = [];
    }
    get src() { return this.url; }
    set src(url) {
        this.url = url; this.requests.push(url); this.complete = false; this.naturalWidth = 0;
    }
    getAttribute(name) { return name === 'src' || name === 'href' ? this.url : name === 'data-asset-optional' && this.optional ? '' : null; }
    load() { this.complete = true; this.naturalWidth = 1024; this.dispatchEvent(new Event('load')); }
    fail() { this.complete = true; this.naturalWidth = 0; this.dispatchEvent(new Event('error')); }
}


class StyleFixture extends ImageFixture {
    constructor() { super(); this.tagName = 'LINK'; this.sheet = null; this.url = 'https://game.test/view.css?v=frozen'; }
    get href() { return this.url; }
    set href(url) { this.src = url; this.sheet = null; }
    load() { this.sheet = {}; this.dispatchEvent(new Event('load')); }
}

async function main() {
    {
        const optional = new ImageFixture(true, 0); optional.optional = true;
        const f = fixture([new ImageFixture(true, 1024), optional]);
        assert.equal(f.ready(), 1, 'Failed optional artwork never blocks native assets');
        assert.equal(f.errors.length, 0); assert.equal(f.timers.size, 0);
    }
    assert.equal(fixture([]).ready(), 1, 'Empty legacy clients can continue');
    assert.equal(fixture([new ImageFixture(true, 1024)]).ready(), 1, 'Cached images work without decode API');
    {
        const image = new ImageFixture();
        let decoded;
        image.decode = () => new Promise(resolve => { decoded = resolve; });
        const f = fixture([image]); image.load();
        assert.equal(f.ready(), 0, 'The real DOM image must finish decoding');
        decoded(); await Promise.resolve();
        assert.equal(f.ready(), 1); assert.equal(f.timers.size, 0);
    }
    {
        const broken = new ImageFixture(true, 0), other = new ImageFixture();
        const f = fixture([broken, other]);
        assert.equal(f.ready(), 0, 'complete=true includes broken images');
        f.tick(250);
        assert.equal(broken.src, 'https://game.test/floor.png?v=frozen&asset_retry=1');
        broken.load(); assert.equal(f.ready(), 0, 'Every consumed image must succeed');
        other.load(); assert.equal(f.ready(), 1); assert.equal(f.timers.size, 0);
    }
    {
        const image = new ImageFixture(); let count = 0;
        image.decode = () => ++count === 1 ? Promise.reject(new Error('decode failed')) : Promise.resolve();
        const f = fixture([image]); image.load(); await Promise.resolve();
        f.tick(250); image.load(); await Promise.resolve();
        assert.equal(f.ready(), 1, 'Decode errors receive the same bounded recovery as download errors');
    }
    {
        const image = new ImageFixture(), f = fixture([image]);
        image.fail(); f.tick(250); image.fail(); f.tick(500); image.fail();
        assert.equal(f.ready(), 0); assert.equal(f.errors.length, 1);
        assert.equal(image.requests.length, 2, 'Permanent failure must stop retrying');
        assert.equal(f.timers.size, 0); image.load(); assert.equal(f.ready(), 0);
    }
    {
        const image = new ImageFixture(); let lateDecode;
        image.decode = () => new Promise(resolve => { lateDecode = resolve; });
        const f = fixture([image]); image.load();
        f.tick(120000); lateDecode(); await Promise.resolve();
        assert.equal(f.ready(), 0, 'A timed-out decode cannot release the barrier for its replacement');
        f.cancel(); assert.equal(f.timers.size, 0);
    }
    {
        const image = new ImageFixture(), f = fixture([image]);
        f.advance(45000);
        assert.equal(image.requests.length, 0, 'A healthy slow atlas keeps its download progress');
        assert.equal(f.errors.length, 0); assert.equal(f.ready(), 0);
        image.load(); assert.equal(f.ready(), 1);
        f.advance(180000); assert.equal(image.requests.length, 0);
    }
    {
        const style = new StyleFixture(), f = fixture([style]);
        f.advance(30000); f.advance(250);
        assert.equal(style.requests.length, 1, 'A stalled stylesheet retains its shorter recovery deadline');
        style.load(); assert.equal(f.ready(), 1);
    }
    {
        const image = new ImageFixture(), f = fixture([image]);
        image.fail(); f.cancel(); image.load();
        assert.equal(f.timers.size, 0); assert.equal(image.requests.length, 0);
        assert.equal(f.ready(), 0, 'Changing expeditions cancels stale retries and callbacks');
    }
    {
        const image = new ImageFixture(true, 1024), style = new StyleFixture();
        const f = fixture([image, style]);
        assert.equal(f.ready(), 0, 'Loaded images cannot expose a view before its styles');
        style.fail(); f.tick(250); style.load();
        assert.equal(f.ready(), 1, 'Stylesheet retries restore the view before native layout');
        assert.equal(style.href, 'https://game.test/view.css?v=frozen&asset_retry=1');
        assert.equal(f.timers.size, 0);
        assert.equal(fixture([style]).ready(), 1, 'An existing stylesheet can continue immediately');
    }
    console.log('Actual image and stylesheet readiness, decoding, bounded retries, timeouts and cancellation passed.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
