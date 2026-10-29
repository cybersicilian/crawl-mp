const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real localhost sockets and native games; disposable accounts only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18991';
const endpoint = new URL(url);
const live = endpoint.hostname === 'dcss.iancaltabiano.com' && endpoint.protocol === 'https:';
assert(['localhost', '127.0.0.1'].includes(endpoint.hostname)
    || (live && process.env.SOCKET_RECOVERY_ALLOW_LIVE === '1'));
const output = process.env.SOCKET_RECOVERY_PROOF || '/tmp/dcss-socket-recovery.json';
const evidence = { compression: Boolean(process.env.SOCKET_COMPRESSION), errors: [], recoveries: [] };
evidence.consoleErrors = [];
evidence.closes = [];
const clients = [];
const suffix = Date.now().toString(36);
let browser;

async function client(role) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (!process.env.SOCKET_COMPRESSION)
        await context.addCookies([{ name: 'no-compression', value: 'true', url }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const result = { page, context, username: 'Socket' + role + suffix, connections: 0 };
    clients.push(result);
    page.on('pageerror', error => evidence.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
    page.on('websocket', socket => {
        result.connections++;
        socket.on('close', () => evidence.closes.push({ user: result.username, at: Date.now() }));
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.socket?.readyState === 1);
    await signInTestAccount(page, result.username, crypto.randomBytes(8).toString('hex'));
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.evaluate(() => {
        window.socketProof = { messages: [], identity: null };
        const comm = require('comm'), handle = comm.handle_message;
        comm.handle_message = function (message) {
            if (message.msg === 'record_identity') window.socketProof.identity = message;
            if (['game_started', 'game_ended', 'party_joined', 'login_success'].includes(message.msg))
                window.socketProof.messages.push(message);
            return handle(message);
        };
    });
    return result;
}

async function ready(page, slot) {
    await page.waitForFunction(slot => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return window.socket?.readyState === 1 && window.crawl_party?.state?.controlled_slot === slot
            && !document.getElementById('connection_status') && name && require(name).ready();
    }, slot);
}
const snapshot = page => page.evaluate(() => ({
    identity: window.socketProof.identity,
    clock: window.crawl_party.state.world_aut_clock,
    slot: window.crawl_party.state.controlled_slot,
    hash: location.hash,
    messages: window.socketProof.messages
}));

async function drop(client, slot) {
    const before = await snapshot(client.page), connections = client.connections;
    await client.page.evaluate(() => {
        window.socketProof.identity = null;
        window.socket.close(4000, 'Disposable recovery test');
    });
    await client.page.locator('#connection_status').waitFor({ state: 'visible' });
    assert.equal(await client.page.evaluate(() => require('comm').send_message('key', { keycode: 46 })), false);
    await client.page.waitForFunction(() => window.socketProof.identity !== null);
    await ready(client.page, slot);
    const after = await snapshot(client.page);
    assert(client.connections > connections);
    assert.equal(after.identity.game_id, before.identity.game_id, 'Recovery keeps the same expedition');
    assert.equal(after.clock, before.clock, 'Recovery and offline input spend no turns');
    assert.equal(after.hash, before.hash, 'Recovery preserves the current route');
    evidence.recoveries.push({ user: client.username, before, after });
}

async function networkDrop(client, slot) {
    const before = await snapshot(client.page), connections = client.connections;
    await client.context.setOffline(true);
    await client.page.locator('#connection_status').waitFor({ state: 'visible' });
    assert.equal(await client.page.evaluate(() => require('comm').send_message('key', { keycode: 46 })), false);
    await client.page.evaluate(() => { window.socketProof.identity = null; });
    await client.context.setOffline(false);
    await client.page.waitForFunction(() => window.socketProof.identity !== null);
    await ready(client.page, slot);
    const after = await snapshot(client.page);
    assert(client.connections > connections);
    assert.equal(after.identity.game_id, before.identity.game_id);
    assert.equal(after.clock, before.clock, 'Network restoration cannot replay offline input');
    evidence.recoveries.push({ user: client.username, network: true, before, after });
}

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const host = await client('Host'), guest = await client('Guest');
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await host.page.locator(".party-slot-box[data-slot='1'] [data-mode='companion']").click();
    for (const slot of [2, 3])
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
    await host.page.locator('#btn_launch_party_room').click();
    await host.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
    await ready(host.page, 0);
    await guest.page.evaluate(username => { location.hash = '#watch-' + username; }, host.username);
    await guest.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
    await guest.page.evaluate(() => require('comm').send_message('join_party', { slot: 1 }));
    await ready(guest.page, 1);
    const guestClock = (await snapshot(guest.page)).clock;
    await drop(host, 0);
    await ready(guest.page, 1);
    assert.equal((await snapshot(guest.page)).clock, guestClock, 'Host recovery leaves the guest game intact');
    assert(!(await snapshot(guest.page)).messages.some(message => message.msg === 'game_ended'),
        'The guest native game must remain running while the host recovers');
    await drop(guest, 1);
    await networkDrop(host, 0);
    await drop(host, 0);
    // A real native menu action proves input and fresh client handlers still work.
    await host.page.evaluate(() => document.activeElement.blur());
    await host.page.keyboard.press('i');
    await host.page.waitForFunction(() => Boolean(document.querySelector('#ui-stack > *')));
    await host.page.keyboard.press('Escape');
    await host.page.waitForFunction(() => !document.querySelector('#ui-stack > *'));
    if (live) {
        const id = (await snapshot(host.page)).identity.game_id;
        await host.page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        await host.page.waitForFunction(async id => {
            const response = await fetch('/api/library/games/' + id);
            const game = await response.json();
            return game.status === 'saved' && game.loadable === true;
        }, id);
        evidence.saved = { gameId: id, loadable: true };
    }
    assert.deepEqual(evidence.errors, []);
    evidence.connections = clients.map(({ username, connections }) => ({ username, connections }));
    console.log(JSON.stringify(evidence.connections));
})().catch(error => {
    evidence.failure = error.stack;
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (evidence.failure) {
        evidence.pages = await Promise.all(clients.map(async client => ({ username: client.username,
            state: await client.page.evaluate(() => ({ hash: location.hash,
                text: document.body.innerText.slice(-10000), socketState: window.socket?.readyState,
                proof: window.socketProof })).catch(error => ({ failure: error.message })) })));
    }
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
