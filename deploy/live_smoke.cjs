/* Real deployment verification using new, disposable accounts and native saves. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.WEBTILES_URL || 'https://dcss.iancaltabiano.com';
assert.equal(new URL(url).hostname, 'dcss.iancaltabiano.com');
assert.equal(new URL(url).protocol, 'https:');
const phase = process.argv[2] || 'save';
assert(['save', 'resume'].includes(phase));
const out = process.env.DEPLOYMENT_PROOF_DIR || '/tmp/dcss-live-proof';
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
const credentials = path.join(out, 'credentials.json');
const errors = [];
let browser, page;
let evidence = {};

async function visit(context) {
    const target = await context.newPage();
    target.setDefaultTimeout(45000);
    target.on('pageerror', error => errors.push(error.message));
    target.on('response', response => {
        if (response.status() >= 400 && /\.(css|js|png|svg)(\?|$)/.test(response.url()))
            errors.push(response.status() + ' ' + response.url());
    });
    await target.goto(url, { waitUntil: 'domcontentloaded' });
    return target;
}

async function register(context, username, password) {
    const target = await visit(context);
    await target.locator('#reg_link').click();
    await target.locator('#reg_username').fill(username);
    await target.locator('#reg_password').fill(password);
    await target.locator('#reg_repeat_password').fill(password);
    await target.locator('#reg_submit').click();
    await target.locator('#party_lobby_panel').waitFor({ state: 'visible' });
    return target;
}

async function login(context, username, password) {
    const target = await visit(context);
    await target.locator('#username').fill(username);
    await target.locator('#password').fill(password);
    await target.locator('#login_form').evaluate(form => form.requestSubmit());
    await target.locator('#party_lobby_panel').waitFor({ state: 'visible' });
    return target;
}

async function record(id) {
    const response = await fetch(url + '/api/library/games/' + id);
    assert.equal(response.status, 200);
    return response.json();
}

async function ready() {
    await page.waitForFunction(() => {
        const module = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/enums'));
        return module && window.game?.get_input_mode?.() === require(module).mouse_mode.COMMAND;
    });
}

async function saveExit(id) {
    await ready();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#dock_save_exit_btn').click();
    await page.locator(`[data-library-load='${id}']`).waitFor({ state: 'visible' });
    const saved = await record(id);
    assert.equal(saved.status, 'saved');
    assert.equal(saved.loadable, true);
    return saved;
}

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
        if (phase === 'save') {
            const suffix = Date.now().toString(36);
            const account = { host: 'DeployQA' + suffix, guest: 'GuestQA' + suffix,
                password: crypto.randomBytes(12).toString('hex') };
            fs.writeFileSync(credentials, JSON.stringify(account), { mode: 0o600 });
            page = await register(context, account.host, account.password);
            const guestContext = await browser.newContext();
            const guest = await register(guestContext, account.guest, account.password);
            await page.locator('#lobby_home [data-lobby-create]').click();
            await page.locator(".party-slot-box[data-slot='1'] .party-mode-btn[data-mode='companion']").click();
            for (const slot of [2, 3])
                await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='closed']`).click();
            await page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
            await page.locator('#btn_launch_party_room').click();
            await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
            const id = (await page.locator('.library-game-link').getAttribute('href')).split('/').pop();
            await guest.locator(`#player_list .username a[href='#watch-${account.host}']`).click();
            await guest.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
            await guest.locator('#party_join_btn').click();
            await guest.waitForFunction(() => window.crawl_party_slot === 1);
            for (const target of [page, guest]) {
                if (!await target.locator('#chat_input').isVisible()) await target.locator('#dock_chat_btn').click();
            }
            const message = 'Deployment validation ' + suffix;
            await page.locator('#chat_input').fill(message);
            await page.locator('#chat_send_btn').click();
            await guest.locator('#chat_history .chat-line').filter({ hasText: message }).waitFor();
            await guest.locator('#chat_input').fill('Companion connected ' + suffix);
            await guest.locator('#chat_input').press('Enter');
            await page.locator('#chat_history .chat-line').filter({ hasText: 'Companion connected ' + suffix }).waitFor();
            await page.screenshot({ path: path.join(out, 'live-coop.png'), fullPage: true });
            await guestContext.close();
            await ready();
            await page.locator('#dock_save_btn').click();
            await page.waitForFunction(() => document.getElementById('library_notice')?.textContent.includes('saved.'));
            const saved = await saveExit(id);
            account.gameId = id;
            fs.writeFileSync(credentials, JSON.stringify(account), { mode: 0o600 });
            evidence = { phase, gameId: id, saved, account: account.host,
                registration: true, guestClaim: true, bidirectionalChat: true };
        } else {
            const account = JSON.parse(fs.readFileSync(credentials));
            const before = JSON.parse(fs.readFileSync(path.join(out, 'save.json')));
            page = await login(context, account.host, account.password);
            await page.locator(`[data-library-load='${account.gameId}']`).click();
            await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
            const heroes = await page.evaluate(() => window.crawl_party.state.members.map(member => ({
                id: member.player_id, hp: member.hp, hp_max: member.hp_max,
                mp: member.mp, mp_max: member.mp_max, xl: member.xl, place: member.place
            })));
            for (const saved of before.saved.state.players) {
                const loaded = heroes.find(hero => hero.id === saved.id);
                assert(loaded, 'Stable hero identity survived server restart');
                for (const key of ['hp', 'hp_max', 'mp', 'mp_max', 'xl', 'place'])
                    assert.equal(loaded[key], saved[key], key + ' survived restart');
            }
            await page.screenshot({ path: path.join(out, 'live-resumed.png'), fullPage: true });
            await saveExit(account.gameId);
            const strangerContext = await browser.newContext();
            const stranger = await login(strangerContext, account.guest, account.password);
            await stranger.evaluate(id => require('comm').send_message('library_load', { id }), account.gameId);
            await stranger.waitForFunction(() => document.getElementById('library_notice')?.textContent.includes('not owned'));
            assert(await stranger.locator('#party_lobby_panel').isVisible());
            await strangerContext.close();
            const profile = await context.newPage();
            await profile.goto(url + '/games/' + account.gameId);
            assert(await profile.locator('h1').innerText());
            await profile.screenshot({ path: path.join(out, 'live-record.png'), fullPage: true });
            evidence = { phase, gameId: account.gameId, heroes, login: true,
                restartResume: true, ownershipEnforced: true, publicRecord: true };
        }
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify({ ...evidence, errors }, null, 2));
        console.log(JSON.stringify({ success: true, phase, gameId: evidence.gameId, out }));
    } catch (error) {
        if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, phase + '-failure.png'), fullPage: true });
        fs.writeFileSync(path.join(out, phase + '-failure.json'), JSON.stringify({ stage: phase, evidence, errors, error: String(error.stack) }, null, 2));
        throw error;
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
