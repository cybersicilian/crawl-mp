const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/scripts/client-connection.js'), 'utf8');

function fixture() {
    let create, hooks, cookie = 'token';
    const timers = new Map();
    const window = { WebSocket: class { constructor() { this.readyState = 1; } } };
    const state = { watching: true, party_member_active: true, party_slot: 2 };
    const calls = [], nodes = new Map();
    const document = {};
    function jquery(selector) {
        if (!nodes.has(selector)) nodes.set(selector, { length: 0,
            remove() { this.length = 0; }, text(value) { this.value = value; return this; },
            css() { return this; }, appendTo() { this.length = 1; return this; },
            trigger(event) { calls.push(event); return this; } });
        return nodes.get(selector);
    }
    jquery.cookie = () => cookie;
    const api = {
        cleanup() { calls.push('cleanup'); state.watching = false; state.party_member_active = false; },
        start_login() { calls.push('login'); state.logging_in = Boolean(cookie); },
        hash_changed() { calls.push('route'); }, set_layer() {}
    };
    vm.runInNewContext(source, { window, document, socket_server: 'ws://example.invalid',
        clearTimeout: id => timers.delete(id),
        setTimeout: callback => { timers.set(1, callback); return 1; },
        define(deps, init) { create = init(jquery, options => { hooks = options; return {
            connect() {}, stop() {}, active() { return true; }
        }; }, { connected() {}, disconnected() {} }); } });
    const connection = create(api, state, { reset() { calls.push('reset'); }, inflate_works_on_ua() { return false; },
        enqueue_messages() {}, decode_utf8() {} });
    const connected = hooks.connected;
    hooks.connected = () => connected({ send() {} });
    return { hooks, state, window, calls, timers, connection, setCookie: value => { cookie = value; } };
}
{
    const f = fixture(); f.hooks.disconnected({}, 1000); f.hooks.connected();
    f.connection.wait_for_game(); f.connection.wait_for_game();
    assert.equal(f.timers.size, 1, 'A half-open previous socket owns one bounded game retry');
    f.hooks.disconnected({}, 1000); f.hooks.connected();
    f.connection.wait_for_game();
    assert.equal(f.timers.size, 1, 'Another outage does not strand a canceled retry');
    f.connection.finish_recovery();
    assert.equal(f.timers.size, 0);
    assert.equal(f.state.reconnecting, false);
}
{
    const f = fixture(); f.hooks.connected();
    assert.deepEqual(f.calls, ['login'], 'Authentication completes before restoring game routes');
    f.hooks.disconnected({}, 1000);
    assert.equal(f.window.pending_auto_join_party, true);
    assert.equal(f.window.pending_auto_join_slot, 2, 'Guests remember their assigned hero');
    assert.equal(f.state.connection_lost, true);
    f.hooks.connected();
    assert.deepEqual(f.calls, ['login', 'game_connection_lost', 'reset', 'cleanup', 'reset', 'login']);
    assert.equal(f.state.current_user, null, 'Stale account state is cleared before reauthentication');
    f.state.watching = f.state.party_member_active = true;
    f.state.party_slot = 1;
    f.hooks.disconnected({}, 1000);
    assert.equal(f.window.pending_auto_join_slot, 1, 'Repeated outages remember current control');
}
{
    const f = fixture(); f.setCookie(null); f.state.logging_in = true;
    f.hooks.connected();
    assert.deepEqual(f.calls, ['login', 'route'], 'Anonymous connections restore their route immediately');
    assert.equal(f.state.logging_in, false, 'Interrupted authentication cannot leave a permanent barrier');
}
console.log('Authentication ordering, repeated guest recovery and stale session cleanup passed.');
