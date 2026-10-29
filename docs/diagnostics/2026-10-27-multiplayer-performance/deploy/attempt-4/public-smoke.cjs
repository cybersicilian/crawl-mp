/* Ordinary two-owner gameplay, compact updates and save/reconnect over HTTPS. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, send, state, ready, waitAction, resetPackets, packets, capture } =
    require('../../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const crypto = require('node:crypto');
const url = 'https://dcss.iancaltabiano.com';
const out = path.join(__dirname, 'public');
fs.mkdirSync(out, { recursive: true });
const evidence = { passed: false, checks: [], errors: [] }, clients = [];
let browser, gameId, saved = true;
function check(message) { evidence.checks.push(message); console.log(message); }
function credentials(account) {
    fs.writeFileSync(path.join(out, 'private-accounts.json'), JSON.stringify(account), { mode: 0o600 });
}

async function room(target, host) {
    return target.page.evaluate(host => window.qaPackets.filter(packet => packet.msg === 'party_rooms_list')
        .flatMap(packet => packet.rooms || []).filter(room => room.host === host).pop(), host);
}

async function client(username, slot, password) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const target = { page, context, username, slot };
    clients.push(target);
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    const requests = new Map();
    page.on('request', request => requests.set(request, request.url()));
    page.on('requestfinished', request => requests.delete(request));
    page.on('requestfailed', request => requests.delete(request));
    target.pendingRequests = requests;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('#reg_link').click();
    await page.locator('#reg_username').fill(username);
    await page.locator('#reg_password').fill(password);
    await page.locator('#reg_repeat_password').fill(password);
    await page.locator('#reg_submit').click();
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await capture(page);
    return target;
}

async function identity(target) {
    return target.page.evaluate(() => {
        const state = window.crawl_party.state;
        const member = state.members.find(hero => hero.slot === state.controlled_slot);
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/player'));
        const player = require(name);
        return { slot: state.controlled_slot, player_id: member.player_id, name: player.name,
            hp: player.hp, hp_max: player.hp_max, mp: player.mp, mp_max: player.mp_max,
            pos: player.pos, floor: state.floor, inventory: player.inv };
    });
}

async function saveExit(host) {
    await ready(host.page);
    host.page.once('dialog', dialog => dialog.accept());
    await host.page.locator('#dock_save_exit_btn').click();
    await host.page.waitForFunction(() => !window.crawl_party?.state ||
        document.querySelector('#lobby_navigation')?.getClientRects().length > 0);
    const response = await host.page.request.get(url + '/api/library/games/' + gameId);
    assert.equal(response.status(), 200);
    const record = await response.json();
    assert.equal(record.status, 'saved');
    assert.equal(record.loadable, true);
    saved = true;
}

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const suffix = Date.now().toString(36);
        const password = crypto.randomBytes(16).toString('hex');
        const account = { host: 'Perf0' + suffix, guest: 'Perf1' + suffix, password };
        credentials(account);
        for (let slot = 0; slot < 2; ++slot)
            await client('Perf' + slot + suffix, slot, password);
        const [host, guest] = clients;
        await host.page.locator('#lobby_home [data-lobby-create]').click();
        await host.page.locator('#party_room_view').waitFor({ state: 'visible' });
        const roomId = (await room(host, host.username)).room_id;
        await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
        await send(guest.page, 'party_room_join', { room_id: roomId, slot: 1 });
        for (const target of clients) await target.page.waitForFunction(({ host, guest }) => {
            const room = window.qaPackets.filter(packet => packet.msg === 'party_rooms_list')
                .flatMap(packet => packet.rooms || []).filter(room => room.host === host).pop();
            return room?.multiplayer === true && room.slots[1].state === 'player'
                && room.slots[1].username === guest;
        }, { host: host.username, guest: guest.username });
        await host.page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
        check('Authoritative staging state acknowledges both human seats before launch');
        await host.page.locator('#btn_launch_party_room').click();
        saved = false;
        await host.page.bringToFront();
        await host.page.waitForFunction(() => window.qaPackets.some(packet => packet.msg === 'record_identity'), null, { timeout: 90000 });
        gameId = (await packets(host)).find(packet => packet.msg === 'record_identity').game_id;
        account.gameId = gameId;
        credentials(account);
        evidence.game_id = gameId;
        for (const target of clients) {
            await target.page.bringToFront();
            await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
                && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 90000 });
            await ready(target.page);
            assert.equal((await state(target.page)).multiplayer, true);
        }
        check('Two authenticated humans launch with separate character ownership');
        await resetPackets(...clients);
        for (const target of [host, guest, host, guest]) {
            const before = await state(target.page);
            const other = 1 - target.slot;
            const { after } = await waitAction(target);
            assert.equal(after.members[target.slot].turns, before.members[target.slot].turns + 1);
            assert.equal(after.members[other].turns, before.members[other].turns);
        }
        const updates = (await Promise.all(clients.map(packets))).flat().filter(packet => packet.msg === 'player');
        assert(updates.length > 0);
        assert(updates.every(packet => !('inv' in packet)), 'Routine native turns omit unchanged inventories');
        evidence.player_updates = updates.length;
        check('Four alternating native turns retain ownership and omit unchanged inventory');
        const beforeReconnect = await identity(guest);
        await guest.page.reload();
        await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1);
        await ready(guest.page);
        assert.deepEqual(await identity(guest), beforeReconnect);
        await capture(guest.page);
        check('Guest reconnect restores its complete player, inventory, floor and position');
        const identities = await Promise.all(clients.map(identity));
        await host.page.screenshot({ path: path.join(out, 'multiplayer.png'), fullPage: true });
        await saveExit(host);
        await send(host.page, 'library_load', { id: gameId });
        saved = false;
        await host.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
        await ready(host.page);
        await guest.page.goto(url + '/#expedition-' + gameId);
        await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1);
        await ready(guest.page);
        assert.deepEqual(await Promise.all(clients.map(identity)), identities);
        check('Native save/resume preserves both characters, resources and inventories');
        await saveExit(host);
        assert.deepEqual(evidence.errors, []);
        evidence.passed = true;
    } catch (error) {
        evidence.error = String(error.stack);
        for (const target of clients) {
            const diagnostic = await target.page.evaluate(() => ({
                url: location.href, state: window.crawl_party?.state,
                packets: window.qaPackets?.slice(-20),
                gameLoading: window.game_loading, visibility: document.visibilityState,
                modules: typeof require === 'function' ? Object.keys(require.s.contexts._.defined) : [],
                images: [...document.querySelectorAll('#game img')].map(image => ({
                    id: image.id, url: image.src, complete: image.complete, width: image.naturalWidth })),
                styles: [...document.querySelectorAll('#game link[rel=stylesheet]')].map(link => ({
                    url: link.href, sheet: Boolean(link.sheet) })) })).catch(() => null);
            if (diagnostic) diagnostic.pendingRequests = [...target.pendingRequests.values()];
            fs.writeFileSync(path.join(out, 'diagnostic-' + target.slot + '.json'), JSON.stringify(diagnostic));
        }
        if (clients[0]) await clients[0].page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        throw error;
    } finally {
        if (!saved && gameId && clients[0]) {
            try { await saveExit(clients[0]); }
            catch (error) { evidence.cleanup_error = String(error); }
        }
        evidence.test_game_saved = saved;
        fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(evidence, null, 2));
        if (browser) await browser.close();
        console.log(JSON.stringify(evidence));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
