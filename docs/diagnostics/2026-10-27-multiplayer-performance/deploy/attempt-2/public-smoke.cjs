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

async function client(username, slot, password) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const target = { page, context, username, slot };
    clients.push(target);
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => evidence.errors.push(error.message));
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
        for (let slot = 0; slot < 2; ++slot)
            await client('Perf' + slot + suffix, slot, password);
        const [host, guest] = clients;
        await host.page.locator('#lobby_home [data-lobby-create]').click();
        await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
        await send(guest.page, 'party_room_join', { room_id: host.username, slot: 1 });
        await host.page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
        await host.page.locator('#btn_launch_party_room').click();
        saved = false;
        for (const target of clients) {
            await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
                && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 90000 });
            await ready(target.page);
        }
        gameId = (await packets(host)).find(packet => packet.msg === 'record_identity').game_id;
        evidence.game_id = gameId;
        evidence.checks.push('Two authenticated humans launch with separate character ownership');
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
        evidence.checks.push('Four alternating native turns retain ownership and omit unchanged inventory');
        const beforeReconnect = await identity(guest);
        await guest.page.reload();
        await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1);
        await ready(guest.page);
        assert.deepEqual(await identity(guest), beforeReconnect);
        await capture(guest.page);
        evidence.checks.push('Guest reconnect restores its complete player, inventory, floor and position');
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
        evidence.checks.push('Native save/resume preserves both characters, resources and inventories');
        await saveExit(host);
        assert.deepEqual(evidence.errors, []);
        evidence.passed = true;
    } catch (error) {
        evidence.error = String(error.stack);
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
