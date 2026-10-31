/* Verify the deployed controls against the existing disposable native campaign. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, send, ready, state } = require('../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const url = 'https://dcss.iancaltabiano.com';
const out = __dirname;
const account = JSON.parse(fs.readFileSync(path.join(out, '../2026-10-27-multiplayer-performance/deploy/public/private-accounts.json'), 'utf8'));
assert.equal(account.gameId, 'e813e777-feac-4221-9b97-4c875be376a9');
const evidence = { passed: false, checks: [], errors: [], game_id: account.gameId };
let browser, page, saved = true;
const check = message => { evidence.checks.push(message); console.log(message); };

async function saveExit() {
    await page.bringToFront(); await ready(page);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#dock_session_menu').click();
    await page.locator('#session_menu [data-session-save="quit"]').click();
    await page.waitForFunction(() => !require('client').in_game());
    const response = await page.request.get(url + '/api/library/games/' + account.gameId);
    const record = await response.json();
    assert(record.loadable && record.status === 'saved'); saved = true;
}

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => evidence.errors.push(error.message));
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
        await page.evaluate(() => {
            window.uiProofSent = [];
            require('comm').register_send_listener(msg => window.uiProofSent.push(msg));
        });
        const before = await state(page);
        const dimensions = await page.locator('#direction_pad').evaluate(node => ({
            width: node.getBoundingClientRect().width,
            buttons: [...node.querySelectorAll('button')].map(button => ({
                width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
                label: button.getAttribute('aria-label') })) }));
        assert.equal(dimensions.width, 152);
        assert.equal(dimensions.buttons.length, 8);
        assert(dimensions.buttons.every(button => button.width >= 44 && button.height >= 44 && /Numpad/.test(button.label)));
        check('Compact keypad renders all eight labelled directions with accessible touch targets');
        const button = page.locator('#dock_common_hotkeys');
        assert.equal(await button.count(), 1); await button.click();
        await page.locator('#inspection_dialog[open]').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#inspection_heading').textContent(), 'Common hotkeys');
        await page.keyboard.press('j'); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        assert(await page.locator('#inspection_dialog').evaluate(node => node.contains(document.activeElement)));
        await page.keyboard.press('Escape');
        assert(await button.evaluate(node => node === document.activeElement));
        assert.deepEqual((await state(page)).members.map(hero => hero.turns), before.members.map(hero => hero.turns));
        assert.deepEqual(await page.evaluate(() => window.uiProofSent.filter(msg => ['key', 'input', 'text_input', 'click_cell', 'power_action'].includes(msg))), []);
        check('Common hotkeys opens in one click, contains focus, returns it on Escape and spends no turn');
        await page.keyboard.press('.');
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns === turns + 1, before.members[0].turns);
        assert.equal((await state(page)).members[1].turns, before.members[1].turns);
        check('Gameplay keys work immediately after closing help with exactly one owner action');
        await page.mouse.move(10, 10);
        await page.screenshot({ path: path.join(out, 'public-controls.png'), fullPage: true });
        await button.click();
        await page.screenshot({ path: path.join(out, 'public-hotkeys.png'), fullPage: true });
        await page.keyboard.press('Escape');
        await saveExit();
        assert.deepEqual(evidence.errors, []); evidence.passed = true;
    } catch (error) {
        evidence.error = String(error.stack);
        await page.screenshot({ path: path.join(out, 'public-ui-failure.png'), fullPage: true }); throw error;
    } finally {
        if (!saved) {
            try { await saveExit(); } catch (error) { evidence.cleanup_error = String(error); }
        }
        evidence.test_game_saved = saved;
        fs.writeFileSync(path.join(out, 'public-ui-result.json'), JSON.stringify(evidence, null, 2));
        await browser.close(); console.log(JSON.stringify(evidence));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
