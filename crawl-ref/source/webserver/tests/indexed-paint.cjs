/* Rendering work stays bounded by visible, changed items, including large lists. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(withObserver = true) {
    const frames = new Map(), painted = [], observed = new Set();
    let serial = 0, callback, create;
    const window = { requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; },
        cancelAnimationFrame(id) { frames.delete(id); } };
    let frameUpdate;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/frame-update.js'), 'utf8'),
        { window, define(deps, factory) { frameUpdate = factory(); } });
    const context = { define(deps, factory) { create = factory(frameUpdate); } };
    if (withObserver) context.IntersectionObserver = class {
        constructor(fn) { callback = fn; }
        observe(node) { observed.add(node); }
        unobserve(node) { observed.delete(node); }
        disconnect() { observed.clear(); }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/indexed-paint.js'), 'utf8'), context);
    return { cache: create(node => painted.push(node.id)), painted, observed, frames,
        show(nodes, isIntersecting = true) { callback(nodes.map(target => ({ target, isIntersecting }))); },
        flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}
const f = fixture(), nodes = Array.from({ length: 500 }, (_, id) => ({ id, isConnected: true }));
nodes.forEach(node => f.cache.track(node, node.id, 0));
f.flush();assert.equal(f.painted.length, 0, 'Off-screen items allocate no portrait renderer');
f.show(nodes.slice(0, 8));f.flush();assert.equal(f.painted.length, 8);
f.painted.length = 0;
f.show(nodes.slice(0, 8));f.flush();
assert.equal(f.painted.length, 0, 'Repeated visible intersection notifications do not repaint unchanged portraits');
for (let repeat = 0; repeat < 100; ++repeat) {
    nodes.forEach(node => f.cache.track(node, node.id, 0));
    f.cache.changed([{ x: 499, y: 0 }, { x: 900, y: 0 }]);
}
assert.equal(f.frames.size, 1, 'Many notifications coalesce into one frame');
f.flush();assert.equal(f.painted.length, 0, 'Unrelated and off-screen changes repaint no visible portrait');
f.cache.changed([{ x: 3, y: 0 }, { x: 3, y: 0 }]);f.flush();
assert.deepEqual(f.painted, [3], 'A duplicate dirty cell repaints its visible portrait once');
f.painted.length = 0;
f.show([nodes[3]], false);f.cache.changed([{ x: 3, y: 0 }]);f.flush();assert.equal(f.painted.length, 0);
f.show([nodes[3]]);f.flush();assert.deepEqual(f.painted, [3], 'Scrolling back draws the latest dirty portrait');
f.painted.length = 0;
f.cache.track(nodes[3], 20, 20);f.flush();f.painted.length = 0;
f.cache.changed([{ x: 3, y: 0 }]);f.flush();assert.equal(f.painted.length, 0, 'Moving detaches the old coordinate');
f.cache.changed([{ x: 20, y: 20 }]);f.flush();assert.deepEqual(f.painted, [3]);
f.painted.length = 0;f.cache.invalidate(nodes[3]);f.cache.remove(nodes[3]);f.flush();
assert.equal(f.painted.length, 0, 'Removed actors cannot repaint from an already queued frame');
assert(!f.observed.has(nodes[3]));
f.cache.changed();f.flush();assert.equal(f.painted.length, 7, 'Legacy full invalidation still paints only visible items');
f.cache.changed();f.cache.clear();assert.equal(f.frames.size, 0);assert.equal(f.observed.size, 0);
f.show(nodes.slice(0, 8));f.flush();assert.equal(f.painted.length, 7, 'Late observer delivery cannot resurrect cleared actors');
f.cache.track(nodes[4], 4, 0);f.show([nodes[4]]);f.flush();assert.equal(f.painted.at(-1), 4);
const fallback = fixture(false);fallback.cache.track(nodes[0], 0, 0);fallback.flush();
assert.deepEqual(fallback.painted, [0], 'Older browsers retain functional painting');
console.log('500-item indexed paint: visible-only work, dirty coordinates, scroll, movement, removal and cleanup passed.');
