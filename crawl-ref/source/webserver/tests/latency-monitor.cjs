const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let create, now = 0, timer;
const document = { hidden: false }, updates = [], sent = [];
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/latency-monitor.js'), 'utf8'), {
    define(deps, init) { create = init(); }, document,
    performance: { now: () => now },
    setInterval(callback) { timer = callback; return 1; }, clearInterval() { timer = undefined; }
});
const monitor = create(state => updates.push(state));
const socket = { readyState: 1, bufferedAmount: 0, send(text) { sent.push(JSON.parse(text)); } };
monitor.start(socket);
now = 78; monitor.receive({ sequence: sent.at(-1).sequence });
assert.equal(updates.at(-1).milliseconds, 78);
assert.equal(updates.at(-1).status, 'connected');
monitor.receive({ sequence: 0 }); assert.equal(updates.at(-1).milliseconds, 78);
now = 5000; timer(); now = 5100; monitor.receive({ sequence: sent.at(-1).sequence });
assert.equal(updates.at(-1).jitter, 22);
now = 10000; timer(); now = 15001; timer();
assert.equal(updates.at(-1).status, 'waiting');
const count = sent.length; document.hidden = true; now = 20000; timer();
assert.equal(sent.length, count, 'Hidden tabs do not send indicator probes');
monitor.receive({ sequence: sent.at(-1).sequence });
assert.equal(updates.at(-1).status, 'waiting', 'Sleep cannot become a false huge ping sample');
monitor.stop(); assert.equal(timer, undefined);
document.hidden = false; monitor.start(socket);
now += 45; monitor.receive({ sequence: sent.at(-1).sequence });
assert.equal(updates.at(-1).milliseconds, 45);
assert.equal(updates.at(-1).jitter, 0, 'Reconnect discards old samples');
console.log('Round-trip, jitter, timeout, stale pong, background suspension and reconnect sampling passed');
