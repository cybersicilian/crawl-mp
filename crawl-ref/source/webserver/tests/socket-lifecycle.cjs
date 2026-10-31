/* Deterministic outages, hung handshakes, sleep/wake and stale socket events. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/scripts/socket-lifecycle.js'), 'utf8');

function fixture() {
    let create, now = 0, nextTimer = 0;
    const timers = new Map(), sockets = [], drops = [], received = [], listeners = new Map();
    const window = {
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: name => listeners.delete(name)
    };
    const document = { ...window, hidden: false }, navigator = { onLine: true };
    function timer(callback, ms, interval = false) {
        timers.set(++nextTimer, { callback, at: now + ms, ms, interval });
        return nextTimer;
    }
    vm.runInNewContext(source, { define(deps, init) { create = init(); }, window, document, navigator,
        Date: { now: () => now }, Math: { ...Math, min: Math.min, pow: Math.pow, random: () => .5 },
        console: { error() {} }, setTimeout: timer, clearTimeout: id => timers.delete(id),
        setInterval: (callback, ms) => timer(callback, ms, true), clearInterval: id => timers.delete(id) });
    const lifecycle = create({
        create() {
            const socket = { readyState: 0, sent: [], close(code) { this.readyState = 3; this.code = code; } };
            sockets.push(socket);
            return socket;
        },
        connected() {}, disconnected: (event, delay) => drops.push({ event, delay }),
        heartbeat: socket => socket.sent.push('ping'),
        message: event => { if (event.data === 'bad') throw new Error('bad frame'); received.push(event.data); }
    });
    return { lifecycle, sockets, drops, received, timers, navigator, document,
        open() { const socket = sockets.at(-1); socket.readyState = 1; socket.onopen(); return socket; },
        wake(name = 'online') { listeners.get(name)(); },
        jump(ms) { now += ms; },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                const [id, t] = next;
                now = t.at;
                if (t.interval) t.at += t.ms; else timers.delete(id);
                t.callback();
            }
            now = end;
        } };
}

{
    const f = fixture(); f.lifecycle.connect(); f.lifecycle.connect();
    assert.equal(f.sockets.length, 1, 'Only one handshake can be active');
    const old = f.open(), late = old.onmessage, lateClose = old.onclose;
    old.onerror(); lateClose({ code: 1006 });
    assert.equal(f.drops.length, 1, 'Error plus close schedules one retry');
    assert.equal(f.drops[0].delay, 1000);
    f.advance(1000); f.open(); late({ data: 'stale' });
    assert.deepEqual(f.received, []);
    assert.equal(f.lifecycle.active(old), false);
    f.sockets.at(-1).onmessage({ data: 'current' });
    assert.deepEqual(f.received, ['current']);
}
{
    const f = fixture(); f.lifecycle.connect();
    for (let attempt = 0; attempt < 9; attempt++) {
        f.sockets.at(-1).onerror();
        assert(f.drops.at(-1).delay <= 30000);
        f.advance(f.drops.at(-1).delay);
    }
    f.open();
    for (let step = 0; step < 2; step++) {
        f.advance(20000); f.sockets.at(-1).onmessage({ data: 'pong' });
    }
    f.sockets.at(-1).onerror();
    assert.equal(f.drops.at(-1).delay, 1000, 'Backoff resets after a stable connection');
}
{
    const f = fixture(); f.lifecycle.connect(); f.advance(15000);
    assert.equal(f.sockets[0].readyState, 3, 'Hung handshakes are retired');
    assert.equal(f.drops.length, 1);
}
{
    const f = fixture(); f.lifecycle.connect(); const socket = f.open();
    f.advance(80000); assert.equal(f.drops.length, 0);
    f.advance(20000); assert.equal(f.drops.length, 1, 'Silent connections recover');
    assert(socket.sent.length > 0);
}
{
    const f = fixture(); f.lifecycle.connect(); const socket = f.open();
    f.jump(600000); f.wake('visibilitychange');
    assert.equal(f.drops.length, 0, 'Waking gets a fresh heartbeat window');
    socket.onmessage({ data: 'pong' });
    assert.equal(socket.sent.length, 1);
}
{
    const f = fixture(); f.navigator.onLine = false; f.lifecycle.connect();
    assert.equal(f.sockets.length, 0);
    f.navigator.onLine = true; f.wake();
    assert.equal(f.sockets.length, 1, 'Network recovery bypasses retry delay');
}
for (const code of [1000, 1008, 1009]) {
    const f = fixture(); f.lifecycle.connect(); const socket = f.open();
    socket.onclose({ code, reason: 'intentional' }); f.advance(120000); f.wake();
    assert.equal(f.sockets.length, 1, 'Intentional/policy closes do not retry');
    assert.equal(f.drops[0].delay, undefined);
}
{
    const f = fixture(); f.lifecycle.connect(); const socket = f.open();
    socket.onclose({ code: 1012 }); f.advance(1000);
    assert.equal(f.sockets.length, 2, 'Server restarts permit automatic reconnects');
}
{
    const f = fixture(); f.lifecycle.connect(); const socket = f.open();
    f.navigator.onLine = false; f.wake('offline');
    assert.equal(socket.readyState, 3, 'Offline retires the old socket before input can buffer');
    f.advance(1000); assert.equal(f.sockets.length, 1);
    f.navigator.onLine = true; f.wake(); f.open();
    assert.equal(f.sockets.length, 2);
}
{
    const f = fixture(); f.lifecycle.connect(); const socket = f.open();
    socket.onmessage({ data: 'bad' });
    assert.equal(f.drops.length, 1, 'Decode failures abandon the damaged compression stream');
    f.lifecycle.stop(); f.advance(120000);
    assert.equal(f.sockets.length, 1);
    assert.equal(f.timers.size, 0);
}
{
    const f = fixture(); f.lifecycle.connect(); const socket = f.open();
    const late = socket.onmessage;
    f.lifecycle.stop(); late({ data: 'stopped' });
    assert.deepEqual(f.received, []);
}
console.log('Socket retries, liveness, terminal closes, stale callbacks and sleep/wake passed.');
