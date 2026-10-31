/* Run compact server updates through the actual browser player consumer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '../game_data/static/player.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const updates = [
    { msg: 'player', name: 'Host', hp: 20, hp_max: 20, mp: 5, mp_max: 5, time: 10, time_last_input: 0,
        pos: { x: 2, y: 3 }, status: [], inv: { 0: { name: 'sword', quantity: 1 }, 1: { name: 'potion', quantity: 2 } } },
    { msg: 'player', time: 20, time_last_input: 0, pos: { x: 3, y: 3 } },
    { msg: 'player', hp: 19, status: [{ text: 'poisoned' }] },
    { msg: 'player', inv: { 1: { quantity: 1 } } },
    { msg: 'player', inv: { 0: { quantity: 0 } }, status: [] },
    { msg: 'player', time: 30, time_last_input: 20, mp: 4 }
];
const compact = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', `
import json, sys
from webtiles.player_update import merge_player, player_update
state = {}
packets = []
for update in json.load(sys.stdin):
    current = merge_player(state, update)
    packets.append(player_update(state, current))
    state = current
print(json.dumps(packets))
`], { input: JSON.stringify(updates), encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: path.resolve(__dirname, '..') } }));

function consumer(watching) {
    let player, init, receive;
    const counts = { inventory: 0, health: 0, commands: 0 };
    const document = {};
    const jquery = selector => ({
        triggerHandler() { if (selector === '#action-panel') ++counts.inventory; },
        trigger() {}, off() { return this; }, on(event, callback) { init = callback; return this; }
    });
    jquery.extend = Object.assign;
    vm.runInNewContext(source, { document, define(deps, factory) {
        player = factory(jquery, { register_handlers(handlers) { receive = handlers.player; } },
            { is_watching: () => watching }, { touch() { ++counts.health; } },
            { new_command() { ++counts.commands; } }, { add_listener() {} },
            { create: () => () => {} }, { init() {} }, { mark() {} });
    } });
    init();
    return { player, counts, receive: packet => receive(copy(packet)) };
}

for (const watching of [false, true]) {
    const original = consumer(watching), filtered = consumer(watching);
    for (let index = 0; index < updates.length; ++index) {
        original.receive(updates[index]);
        filtered.receive(compact[index]);
        assert.deepEqual(copy(filtered.player), copy(original.player), 'Native client state after update ' + index);
        assert.equal(filtered.counts.commands, original.counts.commands, 'Clock marker preserves command boundaries');
    }
    assert.equal(filtered.counts.inventory, 3, 'Movement and health changes never rebuild the inventory panel');
    assert.equal(filtered.counts.health, 3, 'Only actual resource changes invalidate the player tile');
}

// Optional real native trace from the gated transport probe.
if (process.env.PLAYER_NATIVE_TRACE) {
    const trace = JSON.parse(fs.readFileSync(process.env.PLAYER_NATIVE_TRACE, 'utf8'));
    for (const slot of Object.keys(trace.before)) for (const watching of [false, true]) {
        const original = consumer(watching), filtered = consumer(watching);
        trace.before[slot].filter(packet => packet.msg === 'player').forEach(original.receive);
        trace.after[slot].filter(packet => packet.msg === 'player').forEach(filtered.receive);
        assert.deepEqual(copy(filtered.player), copy(original.player), 'Real native player state for slot ' + slot);
    }
}
console.log('Server player patches preserve the actual native browser consumer, inventory and timing for players and spectators');
