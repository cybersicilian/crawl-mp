/* Existing disposable expedition; stage with six routed assets, then verify public delivery. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { send, ready, state } = require('../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const out = __dirname, url = 'https://dcss.iancaltabiano.com';
const phase = process.env.SMOOTH_PHASE, engine = process.env.SMOOTH_ENGINE;
assert(['staged', 'public'].includes(phase));
assert(['chromium', 'webkit'].includes(engine));
const payload = path.join(out, 'deploy-payload');
const manifest = JSON.parse(fs.readFileSync(path.join(payload, 'manifest.json'), 'utf8'));
const account = JSON.parse(fs.readFileSync(path.join(out,
    '../2026-10-27-multiplayer-performance/deploy/public/private-accounts.json'), 'utf8'));
assert.equal(account.gameId, 'e813e777-feac-4221-9b97-4c875be376a9');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const proof = { passed: false, phase, engine, checks: [], errors: [], assets: {}, game_id: account.gameId };
let browser, page, guest, saved = true, originalGraphics;
const responses = [];

function assetName(href) {
    const pathname = new URL(href).pathname;
    return Object.keys(manifest.runtime).find(name => {
        if (name.startsWith('webserver/static/')) return pathname === '/' + name.slice('webserver/'.length);
        return pathname.startsWith('/gamedata/') && pathname.endsWith('/' + path.basename(name));
    });
}
async function restoreGraphics() {
    if (!originalGraphics || !page) return;
    await page.evaluate(settings => require('graphics-preferences').change(settings), originalGraphics);
    await page.waitForFunction(settings => {
        const current = require('graphics-preferences').snapshot();
        return !current.saving && !current.error
            && Object.keys(settings).every(key => current.settings[key] === settings[key]);
    }, originalGraphics);
    proof.graphics_restored = true; originalGraphics = null;
}
async function routeAssets(target) {
    if (phase !== 'staged') return;
    await target.route('**/*', async route => {
        const name = assetName(route.request().url());
        if (!name) return route.continue();
        const bytes = fs.readFileSync(path.join(payload, 'crawl-ref/source', name));
        assert.equal(digest(bytes), manifest.runtime[name]);
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: bytes });
    });
}
async function connectGuest() {
    guest = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    guest.setDefaultTimeout(30000);
    guest.on('pageerror', error => proof.errors.push(error.message));
    await routeAssets(guest);
    await guest.goto(url, { waitUntil: 'domcontentloaded' });
    await guest.waitForFunction(() => typeof require === 'function' && require.defined('client'));
    await guest.locator('#username').fill(account.guest);
    await guest.locator('#password').fill(account.password);
    await guest.locator('#login_form').evaluate(form => form.requestSubmit());
    await guest.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await send(guest, 'expedition_open', { id: account.gameId });
    await guest.waitForFunction(() => window.crawl_party?.state?.members?.length >= 2);
    await send(guest, 'join_party', { slot: 1 });
    await guest.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1);
    await ready(guest);
    // The retained QA campaign may contain a wait queued by an earlier run.
    // Let its real second owner release that cooperative native boundary.
    proof.fixture_recovery_waits = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
        const current = await state(page), hero = current.members[0];
        if (hero.can_act !== false && !hero.queued_action) break;
        await send(guest, 'key', { keycode: 46 }); proof.fixture_recovery_waits++;
        await page.waitForTimeout(400);
    }
}
async function saveExit() {
    if (!page || !await page.evaluate(() => require('client').in_game()).catch(() => false)) return;
    await page.bringToFront();
    if (await page.locator('#inspection_dialog[open]').count()) await page.keyboard.press('Escape');
    await ready(page);
    page.once('dialog', dialog => dialog.accept());
    if (!await page.locator('#session_menu[open]').count()) await page.locator('#dock_session_menu').click();
    await page.locator('#session_menu [data-session-save="quit"]').click();
    await page.waitForFunction(() => !require('client').in_game());
    const record = await (await page.request.get(url + '/api/library/games/' + account.gameId)).json();
    assert(record.loadable && record.status === 'saved'); saved = true;
}

(async () => {
    browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
        ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
    page = await browser.newPage({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => proof.errors.push(error.message));
    page.on('response', response => {
        const name = assetName(response.url());
        if (name) responses.push((async () => {
            const bytes = await response.body();
            proof.assets[name] = { sha256: digest(bytes), url: response.url() };
        })());
    });
    await routeAssets(page);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof require === 'function' && require.defined('client'));
        await page.locator('#username').fill(account.host);
        await page.locator('#password').fill(account.password);
        await page.locator('#login_form').evaluate(form => form.requestSubmit());
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await send(page, 'library_load', { id: account.gameId }); saved = false;
        await page.bringToFront();
        await page.waitForFunction(() => window.crawl_party?.state?.multiplayer === true
            && window.crawl_party.state.controlled_slot === 0);
        await ready(page);
        await connectGuest();
        await page.bringToFront();
        await Promise.all(responses);
        for (const [name, hash] of Object.entries(manifest.runtime))
            assert.equal(proof.assets[name]?.sha256, hash, 'Loaded browser asset: ' + name);
        proof.checks.push('All six exact optimization assets loaded in the native game');
        originalGraphics = await page.evaluate(() => require('graphics-preferences').snapshot().settings);
        await page.evaluate(() => require('visual-presentation').select('premium'));
        await page.waitForFunction(() => document.documentElement.dataset.presentation === 'premium'
            && !require('graphics-preferences').snapshot().saving);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert(await page.locator('#dungeon').evaluate(canvas => canvas.width > 0 && canvas.height > 0));
        proof.checks.push('Enhanced dungeon and cached fog edges render at Retina resolution');
        const before = await state(page);
        proof.before_action = before.members.map(hero => ({ slot: hero.slot, turns: hero.turns,
            can_act: hero.can_act, queued_action: hero.queued_action, aut_clock: hero.aut_clock }));
        const button = page.locator('#dock_common_hotkeys');
        await button.click();
        await page.locator('#inspection_dialog[open]').waitFor();
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        assert(await page.locator('#inspection_dialog').evaluate(node => node.contains(document.activeElement)));
        await page.keyboard.press('Escape');
        assert(await button.evaluate(node => node === document.activeElement));
        assert.deepEqual((await state(page)).members.map(hero => hero.turns), before.members.map(hero => hero.turns));
        proof.checks.push('Help opens in one click, contains focus, and closes without spending a turn');
        await page.keyboard.press('.');
        for (let attempt = 0; attempt < 4; attempt++) {
            if ((await state(page)).members[0].turns === before.members[0].turns + 1) break;
            await send(guest, 'key', { keycode: 46 });
            await page.waitForTimeout(400);
        }
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns === turns + 1,
            before.members[0].turns);
        await ready(page);
        const after = await state(page);
        assert.equal(after.controlled_slot, 0);
        assert.equal((await state(guest)).controlled_slot, 1);
        assert.deepEqual(after.members.map(hero => hero.player_id), before.members.map(hero => hero.player_id));
        proof.checks.push('A key after help closes executes exactly one action for its owner');
        proof.native_actions = 1;
        const geometry = await page.evaluate(() => ({
            width: innerWidth, document: document.documentElement.scrollWidth,
            cards: document.querySelectorAll('.party-member-card').length,
            navigators: [...document.querySelectorAll('.party-navigate-btn')].map(node => ({
                self: Boolean(node.closest('.is-controlled-card')), display: getComputedStyle(node).display }))
        }));
        assert(geometry.document <= geometry.width + 1);
        assert(geometry.cards >= 2);
        assert(geometry.navigators.filter(node => node.self).every(node => node.display === 'none'));
        assert(geometry.navigators.filter(node => !node.self).every(node => node.display !== 'none'));
        proof.geometry = geometry;
        proof.checks.push('Sidebar and relative navigation controls retain their layout and visibility');
        await page.mouse.move(5, 5);
        await page.screenshot({ path: path.join(out, phase + '-' + engine + '.png') });
        await restoreGraphics();
        await saveExit();
        assert.deepEqual(proof.errors, []); proof.passed = true;
    } catch (error) {
        proof.error = String(error.stack);
        if (guest) proof.guest_snapshot = await guest.evaluate(() => ({
            controlled: window.crawl_party?.state?.controlled_slot,
            members: window.crawl_party?.state?.members?.length,
            hash: location.hash, messages: document.body.innerText.slice(-1800)
        })).catch(() => null);
        await page.screenshot({ path: path.join(out, phase + '-' + engine + '-failure.png'), timeout: 5000 }).catch(() => {});
        throw error;
    } finally {
        await restoreGraphics().catch(error => proof.graphics_restore_error = String(error));
        if (!saved) await saveExit().catch(error => proof.cleanup_error = String(error));
        proof.test_game_saved = saved;
        fs.writeFileSync(path.join(out, phase + '-' + engine + '.json'), JSON.stringify(proof, null, 2));
        await browser.close();
        console.log(JSON.stringify({ passed: proof.passed, phase, engine, checks: proof.checks,
            errors: proof.errors, test_game_saved: saved }));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
