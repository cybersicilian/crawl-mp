/* The candidate transport with the public native game; menus spend no turns. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, send, ready, state } = require('../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const account = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../2026-10-27-multiplayer-performance/deploy/public/private-accounts.json'), 'utf8'));
const url = 'https://dcss.iancaltabiano.com';

module.exports = async function (browser, candidate) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [], result = { passed: false, errors };
    let saved = true;
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    if (candidate) await page.route('**/client-transport.js*', route => route.fulfill({ body: candidate,
        contentType: 'application/javascript' }));
    async function save() {
        await ready(page);
        if (!await page.locator('#session_menu').evaluate(node => node.open).catch(() => false))
            await page.locator('#dock_session_menu').click();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#session_menu [data-session-save="quit"]').click();
        await page.waitForFunction(() => !require('client').in_game());
        const record = await (await page.request.get(url + '/api/library/games/' + account.gameId)).json();
        assert(record.loadable && record.status === 'saved'); saved = true;
    }
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof require === 'function' && require.defined('client'));
        assert(await page.evaluate(() => require('client-transport').toString().includes('Animation catch-up must yield')));
        await page.locator('#username').fill(account.host);
        await page.locator('#password').fill(account.password);
        await page.locator('#login_form').evaluate(form => form.requestSubmit());
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await send(page, 'library_load', { id: account.gameId }); saved = false;
        await page.bringToFront();
        await page.waitForFunction(() => window.crawl_party?.state?.multiplayer === true
            && window.crawl_party.state.controlled_slot === 0);
        await ready(page);
        const before = await state(page);
        await page.evaluate(() => {
            window.nativeKeyProof = { sent: [], starts: [] };
            document.addEventListener('keydown', event => {
                if (event.key === 'i') window.nativeKeyProof.starts.push(performance.now());
            }, true);
            require('comm').register_send_listener(msg => {
                if (['input', 'key'].includes(msg)) window.nativeKeyProof.sent.push({ msg, at: performance.now() });
            });
        });
        for (let index = 0; index < 4; index++) {
            await page.locator(index % 2 ? '#dock_common_hotkeys' : '#dungeon').focus();
            await page.evaluate(() => require('client').delay(1000));
            await page.keyboard.press('i');
            await page.waitForFunction(() => document.querySelector('#ui-stack')?.children.length > 0);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.querySelector('#ui-stack')?.children.length === 0);
            await ready(page);
        }
        assert.deepEqual((await state(page)).members.map(hero => hero.turns), before.members.map(hero => hero.turns));
        result.input = await page.evaluate(() => window.nativeKeyProof);
        assert.equal(result.input.starts.length, 4);
        assert.equal(result.input.sent.filter(entry => entry.msg === 'input').length, 4);
        await page.screenshot({ path: path.join(__dirname, 'webkit-candidate-native.png'), fullPage: true });
        await save(); assert.deepEqual(errors, []); result.passed = true;
        console.log('WebKit candidate: four native inventory open/close cycles, interrupted waits, HUD focus and saved game passed.');
    } finally {
        if (!saved) await save().catch(error => result.cleanup_error = String(error));
        result.saved = saved;
        fs.writeFileSync(path.join(__dirname, 'native-candidate-result.json'), JSON.stringify(result, null, 2));
        await context.close();
    }
    return result;
};
