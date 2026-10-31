/* Accepted pings render locally; stale floor packets cannot mark a new map. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '../game_data/static', name + '.js'), 'utf8');
const window = { crawl_party: { state: { multiplayer: true, floor: 'D:1' }, pings: [] } };
const packets = [], invalidated = [], draws = [];
const comm = { send_message(msg, fields) { packets.push({ msg, ...fields }); return true; } };
let pings, party;
vm.runInNewContext(source('party-ping'), {
    window, define(deps, factory) { pings = factory(comm); }
});
assert.equal(pings.send(-3, 5, 'danger'), true);
assert.deepEqual(packets.pop(), { msg: 'party_ping', x: -3, y: 5, kind: 'danger', floor: 'D:1' });
window.crawl_party.state.floor = 'D:2';
pings.send(2, 4);
assert.equal(packets.pop().floor, 'D:2', 'Each entry point uses the current personal floor');
delete window.crawl_party.state.floor;
assert.equal(pings.send(2, 4), false, 'Unknown multiplayer floor is not guessed');
window.crawl_party.state.floor = 'D:2';
for (const value of [true, 2.5, NaN, 257]) assert.equal(pings.send(value, 4), false);
assert.equal(packets.length, 0);
let dungeonMenu, entries;
Object.assign(window.crawl_party.state, {
    enabled: true, members: [{ slot: 0, pos: { x: 10, y: 10 }, place: 'D:2' }]
});
const menuModules = {
    comm, client: { is_watching: () => false }, './party-ping': pings,
    './context-menu': { open(event, menu) { entries = menu.entries; } },
    './workflow-actions': { controlledSlot: () => 0, reason: () => '' },
    './party-model': { canControl: () => false },
    './map_knowledge': { get: () => ({ t: {}, feature_name: 'floor' }), visible: () => true },
    './game-context': { can_target: () => false, can_describe: () => true,
        get_input_mode: () => 1, get_ui_state: () => 0 }
};
vm.runInNewContext(source('dungeon-context-menu'), {
    window, define(deps, factory) { dungeonMenu = factory(...deps.map(name => menuModules[name])); }
});
dungeonMenu.open({ cell: { x: 2, y: 4 }, preventDefault() {} });
for (const [label, kind] of [['Ping: look here', 'look'], ['Ping: danger', 'danger']]) {
    entries.find(entry => entry.label === label).run();
    assert.deepEqual(packets.pop(), { msg: 'party_ping', x: 2, y: 4, kind, floor: 'D:2' });
}
const modules = {
    './party-model': { colours: [] }, './party-inspector': {},
    './display': { invalidate_positions(locs) { invalidated.push(...locs); }, display() { draws.push('dungeon'); } },
    './minimap': { update_overlay() { draws.push('minimap'); } }
};
vm.runInNewContext(source('party'), {
    window, Date, setInterval() { return 1; }, clearInterval() {},
    define(deps, factory) { party = factory(...deps.map(name => modules[name] || {})); }
});
party.ping({ x: 2, y: 4, user: 'You', kind: 'danger', floor: 'D:2' });
assert.equal(window.crawl_party.pings.length, 1);
assert.equal(window.crawl_party.pings[0].user, 'You');
assert.deepEqual(draws, ['dungeon', 'minimap'], 'The accepted echo paints the sender map and minimap');
assert.equal(invalidated[0].x, 2);
party.ping({ x: 2, y: 4, user: 'You', floor: 'D:1' });
party.ping({ x: 2, y: 4, user: 'You' });
assert.equal(window.crawl_party.pings.length, 1, 'Late or unscoped pings cannot appear on the next floor');
console.log('Ping floor binding, local rendering, minimap invalidation and stale delivery checks passed.');
