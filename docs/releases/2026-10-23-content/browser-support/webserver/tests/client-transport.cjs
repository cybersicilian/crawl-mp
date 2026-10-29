/* Animation waits are interruptible; loading barriers and message order are not. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/scripts/client-transport.js'), 'utf8');
const loadingSource = fs.readFileSync(path.join(__dirname, '../static/scripts/game-loading.js'), 'utf8');

function fixture() {
    let factory, beforeSend, imagesReady, now = 0, timerId = 0, loading, createStream;
    const timers = new Map(), received = [], immediate = [], errors = [];
    const window = {}, document = { hidden: false };
    vm.runInNewContext(loadingSource, { define(deps, init) { loading = init(); } });
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/state-stream.js'), 'utf8'), {
        define(deps, init) { createStream = init(); }
    });
    const jquery = () => ({ off() {}, html() {}, waitForImages(callback) { imagesReady = callback; } });
    const comm = {
        register_handlers() {},
        register_send_listener(listener) { beforeSend = listener; },
        handle_message_immediately(message) { immediate.push(message.msg); return message.msg === 'ping'; },
        handle_message(message) {
            received.push(message.msg);
            if (message.msg === 'delay') client.delay(message.t);
            if (message.msg === 'multi') client.handle_multi_message(message);
            if (message.msg === 'reenter') client.enqueue_messages('{"msg":"nested"}');
            if (message.msg === 'slow') now += 10;
            if (message.msg === 'bad') throw new Error('handler failed');
        }
    };
    vm.runInNewContext(source, { define(deps, init) {
        factory = init(jquery, comm, loading, () => ({ connect() {}, stop() {} }), createStream);
    },
        window, document, TextDecoder, Blob, Uint8Array, requirejs: { undef() {} },
        Date: { now: () => now }, console: { error: (...args) => errors.push(args) },
        setTimeout(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        setInterval(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
        clearInterval(id) { timers.delete(id); } });
    const client = factory({ bind_document_events() {}, show_loading_screen() {} }, {});
    return { client, loading, received, immediate, timers, errors, window,
        imagesReady: () => imagesReady(),
        send: msg => beforeSend(msg),
        enqueue: (...msgs) => client.enqueue_messages(JSON.stringify({ msgs })),
        tick() {
            const [id, timer] = timers.entries().next().value;
            timers.delete(id); timer.callback();
        } };
}
const message = msg => ({ msg });

{
    const f = fixture();
    f.client.delay(100); f.client.delay(200);
    f.enqueue(message('state'));
    assert.deepEqual(f.received, []);
    assert.equal(f.timers.size, 1, 'Replacing an animation must own only one wait');
    f.tick();
    assert.deepEqual(f.received, ['state'], 'Overlapping waits cannot permanently inhibit updates');
    f.client.delay_ended();
    f.enqueue(message('later'));
    assert.deepEqual(f.received, ['state', 'later'], 'Ending a wait twice is harmless');
}
for (const input of ['key', 'input', 'text_input', 'click_cell', 'power_action', 'inv_item_use', 'floor_item_action', 'switch_player']) {
    const f = fixture();
    f.enqueue({ msg: 'delay', t: 250 }, message('frame'), { msg: 'delay', t: 250 }, message('state'));
    f.send(input);
    assert.deepEqual(f.received, ['delay', 'frame', 'delay', 'state'], input + ' catches up in order');
    assert.equal(f.timers.size, 0);
}
{
    const f = fixture();
    f.client.inhibit_messages(); f.client.inhibit_messages();
    f.client.delay(200); f.enqueue(message('state'), message('ping'));
    f.send('key'); f.client.uninhibit_messages();
    assert.deepEqual(f.received, [], 'Input never bypasses nested loading barriers');
    assert(f.immediate.includes('ping'), 'Keepalives bypass animation and loading');
    f.client.uninhibit_messages();
    assert.deepEqual(f.received, ['state']);
}
{
    const f = fixture();
    f.enqueue({ msg: 'delay', t: 250 }, message('state'));
    f.send('chat_msg');
    assert.deepEqual(f.received, ['delay'], 'Chat does not cancel game animations');
    f.tick(); assert.deepEqual(f.received, ['delay', 'state']);
}
{
    const f = fixture();
    f.enqueue(message('first'), { msg: 'multi', msgs: [message('a'), message('b')] },
        message('reenter'), message('last'));
    assert.deepEqual(f.received, ['first', 'multi', 'a', 'b', 'reenter', 'last', 'nested']);
}
{
    const f = fixture();
    f.enqueue(message('slow'), message('state'));
    assert.deepEqual(f.received, ['slow'], 'Long batches yield to input events');
    f.send('key');
    assert.deepEqual(f.received, ['slow'], 'Normal sends do not synchronously drain an unrelated update backlog');
    f.tick(); assert.deepEqual(f.received, ['slow', 'state']);
    f.enqueue(message('bad'), message('after-error'));
    assert.equal(f.received.at(-1), 'after-error');
    assert(f.errors.length);
}
{
    const f = fixture();
    f.client.enqueue_messages('{msg:"legacy"}');
    assert.deepEqual(f.received, ['legacy'], 'Old non-standard JSON remains supported');
}
{
    const f = fixture();
    f.client.receive_game_client({ version: 'current',
        content: '<div data-loading-readiness="dungeon"></div><script>game_loading</script>' });
    f.enqueue(message('state'));
    f.loading.setLayer('normal');
    assert(f.loading.blocking(), 'Early native layout keeps the loading cover');
    f.loading.mark('player'); f.loading.mark('map');
    assert(f.loading.blocking(), 'Rendering cannot bypass tile asset loading');
    f.imagesReady();
    assert.equal(f.loading.blocking(), false);
    assert.deepEqual(f.received, [], 'Images alone never bypass native client initialization');
    f.window.game_loading = true; f.tick();
    assert.deepEqual(f.received, ['state']);
}
for (const content of ['<div>legacy client</div>', '<script>game_loading</script>']) {
    const f = fixture();
    f.loading.begin();
    f.client.receive_game_client({ version: 'legacy', content });
    assert.equal(f.loading.blocking(), false, 'Clients without readiness hooks retain native loading');
    f.enqueue(message('state')); f.imagesReady();
    if (content.includes('game_loading')) { f.window.game_loading = true; f.tick(); }
    assert.deepEqual(f.received, ['state']);
}
{
    const f = fixture();
    f.client.receive_game_client({ version: 'old', content: '<script>game_loading</script>' });
    f.enqueue(message('old-state'));
    f.client.reset_transport();
    f.imagesReady();
    f.enqueue(message('new-state'));
    assert.deepEqual(f.received, ['new-state'], 'Reset discards stale input barriers and queued updates');
    assert.equal(f.timers.size, 0, 'Stale asset callbacks cannot start polling the new session');
}
console.log('Transport ordering, interruptible delays, loading barriers, yielding and legacy messages passed.');
