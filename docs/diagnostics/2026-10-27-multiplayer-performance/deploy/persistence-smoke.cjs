/* Complete the remaining persistence checks with the same disposable campaign. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, send, ready, capture } =
    require('../../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const url = 'https://dcss.iancaltabiano.com';
const out = path.join(__dirname, 'public');
const account = JSON.parse(fs.readFileSync(path.join(out, 'private-accounts.json'), 'utf8'));
assert(account.gameId === 'e813e777-feac-4221-9b97-4c875be376a9');
const evidence = { passed: false, game_id: account.gameId, checks: [], errors: [] };
const clients = [];
let browser, saved = true;
const check = message => { evidence.checks.push(message); console.log(message); };

async function login(username, slot) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    const target = { page, context, slot };
    clients.push(target);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof require === 'function' && require.defined('client'));
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(account.password);
    await page.locator('#login_form').evaluate(form => form.requestSubmit());
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await capture(page);
    return target;
}

async function loaded(target) {
    await target.page.bringToFront();
    await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
        && window.crawl_party.state.multiplayer === true
        && window.crawl_party.state.controlled_slot === slot, target.slot);
    await ready(target.page);
}

async function identity(target) {
    return target.page.evaluate(() => {
        const state = window.crawl_party.state;
        const member = state.members.find(hero => hero.slot === state.controlled_slot);
        const key = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/player'));
        const player = require(key);
        return { slot: state.controlled_slot, player_id: member.player_id, name: player.name,
            hp: player.hp, hp_max: player.hp_max, mp: player.mp, mp_max: player.mp_max,
            pos: player.pos, floor: state.floor, inventory: player.inv };
    });
}

async function saveExit(host) {
    await host.page.bringToFront();
    await ready(host.page);
    host.page.once('dialog', dialog => dialog.accept());
    await host.page.locator('#dock_session_menu').click();
    await host.page.locator('#session_menu [data-session-save="quit"]').click();
    await host.page.waitForFunction(() => !require('client').in_game());
    const response = await host.page.request.get(url + '/api/library/games/' + account.gameId);
    assert.equal(response.status(), 200);
    const record = await response.json();
    assert.equal(record.status, 'saved');
    assert.equal(record.loadable, true);
    saved = true;
}

async function open(host, guest) {
    await host.page.bringToFront();
    await send(host.page, 'library_load', { id: account.gameId });
    saved = false;
    await loaded(host);
    await guest.page.goto(url + '/#expedition-' + account.gameId, { waitUntil: 'domcontentloaded' });
    await loaded(guest);
}

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const host = await login(account.host, 0), guest = await login(account.guest, 1);
        await open(host, guest);
        const before = await Promise.all(clients.map(identity));
        check('Both authenticated owners resume the exact saved multiplayer campaign');
        await saveExit(host);
        check('The current game menu saves the native campaign and returns to the lobby');
        await open(host, guest);
        const after = await Promise.all(clients.map(identity));
        assert.deepEqual(after, before);
        evidence.identities = after.map(({ inventory, ...identity }) => identity);
        check('Native save/resume preserves both character IDs, resources, positions, floors and inventories');
        await saveExit(host);
        assert.deepEqual(evidence.errors, []);
        evidence.passed = true;
    } catch (error) {
        evidence.error = String(error.stack);
        if (clients[0]) await clients[0].page.screenshot({ path: path.join(out, 'persistence-failure.png'), fullPage: true });
        throw error;
    } finally {
        if (!saved && clients[0]) {
            try { await saveExit(clients[0]); }
            catch (error) { evidence.cleanup_error = String(error); }
        }
        evidence.test_game_saved = saved;
        fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(evidence, null, 2));
        if (browser) await browser.close();
        console.log(JSON.stringify(evidence));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
