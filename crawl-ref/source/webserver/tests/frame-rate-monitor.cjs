const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let create, next = 0;
const callbacks = new Map(), listeners = new Set(), updates = [];
const document = { hidden: false,
    addEventListener(event, callback) { assert.equal(event, 'visibilitychange'); listeners.add(callback); },
    removeEventListener(event, callback) { listeners.delete(callback); } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/frame-rate-monitor.js'), 'utf8'), {
    define(deps, init) { create = init(); }, document,
    window: { requestAnimationFrame(callback) { callbacks.set(++next, callback); return next; },
        cancelAnimationFrame(id) { callbacks.delete(id); } }
});
function tick(now) {
    const entries = [...callbacks]; callbacks.clear();
    for (const [, callback] of entries) callback(now);
}
function visibility(hidden) {
    document.hidden = hidden;
    for (const callback of listeners) callback();
}
const monitor = create(value => updates.push(value));
monitor.start();
assert.equal(callbacks.size, 1);
tick(0);
for (let i = 1; i <= 60; i++) tick(i * 1000 / 60);
assert.equal(updates.at(-1), 60);
assert.equal(updates.length, 3, 'Only resets and one-second samples update the badge');
visibility(true);
assert.equal(callbacks.size, 0, 'Hidden tabs cancel animation sampling');
assert.equal(updates.at(-1), null, 'Hidden tabs discard stale FPS');
visibility(false);
tick(100000);
for (let i = 1; i <= 30; i++) tick(100000 + i * 1000 / 30);
assert.equal(updates.at(-1), 30, 'Resume starts a fresh window excluding hidden time');
monitor.start(); monitor.start();
assert.equal(callbacks.size, 1, 'Reconnect never duplicates the frame loop');
assert.equal(listeners.size, 1);
tick(0);
for (let i = 1; i <= 144; i++) tick(i * 1000 / 144);
assert.equal(updates.at(-1), 144, 'High refresh displays are not capped at 60');
monitor.stop(); monitor.stop();
assert.equal(callbacks.size, 0);
assert.equal(listeners.size, 0);
visibility(false);
assert.equal(callbacks.size, 0, 'Disconnect cannot restart on visibility change');
document.hidden = true; monitor.start();
assert.equal(callbacks.size, 0, 'Connecting while hidden does not schedule frames');
visibility(false);
assert.equal(callbacks.size, 1);
monitor.stop();
console.log('FPS cadence, refresh rates, hidden tabs, reconnect and teardown passed');
