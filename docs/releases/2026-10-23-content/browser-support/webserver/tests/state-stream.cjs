/* Exercise the real Python encoder against the browser decoder. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
let create;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/state-stream.js'), 'utf8'), {
    define(deps, init) { create = init(); }
});
const copy = value => JSON.parse(JSON.stringify(value));
const states = [];
let state = { msg: 'party_state', members: [{ slot: 0, hp: 20, pos: { x: 1, y: 2 },
    inventory: [{ name: 'a long description '.repeat(1000), amount: 1 }] }], flag: true, optional: null };
for (let index = 0; index < 120; index++) {
    state = copy(state); state.members[0].pos.x = index;
    if (index % 4 === 0) state.members[0].hp--;
    if (index % 7 === 0) state.optional = index % 14 ? null : { nested: [1, 'two', false] };
    if (index % 11 === 0) delete state.optional;
    if (index % 13 === 0) state.flag = state.flag === true ? 1 : true;
    if (index === 35) state.members.push({ slot: 1, hp: 10 });
    if (index === 80) state.members.pop();
    states.push(state);
}
const packets = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c',
    'import json,sys; from webtiles.state_transport import StateEncoder; encoder=StateEncoder("party_state"); print(json.dumps([json.loads(encoder.frame(state)) for state in json.load(sys.stdin)]))'], {
    input: JSON.stringify(states), encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: path.resolve(__dirname, '..') }
}));
const resync = [], stream = create(channel => resync.push(channel));
packets.forEach((packet, index) => {
    const delivered = stream.accept(packet);
    assert.deepEqual(copy(delivered), states[index]);
    delivered.members[0].hp = -999; delivered.members[0].inventory.length = 0;
});
assert.equal(resync.length, 0, 'Consumer mutation cannot corrupt the delta baseline');
assert(JSON.stringify(packets[1]).length < JSON.stringify(states[1]).length / 10);
const invalid = { msg: 'state_frame', channel: 'party_state', revision: 999, base: 998, changes: [] };
assert.equal(stream.accept(invalid), null); stream.accept(invalid);
assert.deepEqual(resync, ['party_state'], 'A gap requests one full-state resync');
assert.deepEqual(copy(stream.accept(packets[0])), states[0], 'A full frame repairs the stream');
stream.reset(); assert.equal(stream.accept(packets[1]), null);
stream.accept(packets[0]);
assert.equal(stream.accept({ msg: 'state_frame', channel: 'party_state', base: 1, revision: 2,
    changes: [[['__proto__', 'polluted'], true]] }), null);
assert.equal({}.polluted, undefined);
console.log('120 Python/browser delta round trips, null/deletion, arrays, mutation isolation, size, gaps and safe paths passed');
