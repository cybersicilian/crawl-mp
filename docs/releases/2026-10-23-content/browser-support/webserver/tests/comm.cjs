const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const window = {};
const navigator = { onLine: true };
let comm, interrupted = 0;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/comm.js'), 'utf8'), {
    window, navigator, console, define(deps, init) { comm = init({ toJSON: JSON.stringify }); }
});
comm.register_send_listener(() => interrupted++);
assert.equal(comm.send_message('key'), false);
for (const readyState of [0, 2, 3]) {
    window.socket = { readyState, send() { throw new Error('Must not send'); } };
    assert.equal(comm.send_message('key'), false);
}
assert.equal(interrupted, 0, 'Offline input cannot drain stale animations');
const packets = [];
window.socket = { readyState: 1, send: packet => packets.push(JSON.parse(packet)) };
assert.equal(comm.send_message('key', { keycode: 105 }), true);
assert.deepEqual(packets, [{ msg: 'key', keycode: 105 }], 'Offline commands are never replayed');
navigator.onLine = false;
assert.equal(comm.send_message('key'), false, 'Offline input is rejected even before the socket closes');
navigator.onLine = true;
window.socket.send = () => { const error = new Error('closed'); error.name = 'InvalidStateError'; throw error; };
assert.equal(comm.send_message('key'), false);
console.log('Closed/connecting sends, send races and no input replay passed.');
