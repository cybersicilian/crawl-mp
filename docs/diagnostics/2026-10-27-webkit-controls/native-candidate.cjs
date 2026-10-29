/* The candidate transport with the public native game; menus spend no turns. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { signInTestAccount } = require('../../../crawl-ref/source/webserver/tests/helpers/test-account.cjs');
const { assert, send, ready, state } = require('../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const account = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../2026-10-27-multiplayer-performance/deploy/public/private-accounts.json'), 'utf8'));
const url = 'https://dcss.iancaltabiano.com';

module.exports = async function (browser, candidate) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [], result = { passed: false, errors };
    let saved = true, gameId;
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    if (candidate) await page.route('**/client-transport.js*', route => route.fulfill({ body: candidate,
        contentType: 'application/javascript' }));
    async function save() {
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()));
        for (let index = 0; index < 4 && await page.locator('#ui-stack > *').count(); index++) {
            await send(page, 'key', { keycode: 27 }); await page.waitForTimeout(100);
        }
        await ready(page);
        if (!await page.locator('#session_menu').evaluate(node => node.open).catch(() => false))
            await page.locator('#dock_session_menu').click();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#session_menu [data-session-save="quit"]').click();
        await page.waitForFunction(() => !require('client').in_game());
        const record = await (await page.request.get(url + '/api/library/games/' + gameId)).json();
        assert(record.loadable && record.status === 'saved'); saved = true;
    }
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof require === 'function' && require.defined('client'));
        assert(await page.evaluate(() => require('client-transport').toString().includes('Animation catch-up must yield')));
        const fresh = { username: 'SafariQA' + Date.now().toString(36), password: crypto.randomBytes(16).toString('hex') };
        fs.writeFileSync(path.join(__dirname, 'private-native-account.json'), JSON.stringify(fresh), { mode: 0o600 });
        await signInTestAccount(page, fresh.username, fresh.password);
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.evaluate(() => {
            const comm = require('comm'), handle = comm.handle_message;
            comm.handle_message = function (message) {
                if (message.msg === 'record_identity') window.nativeQAIdentity = message.game_id;
                return handle(message);
            };
        });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.waitForFunction(() => /1 hero\b/.test(document.getElementById('btn_launch_party_room').textContent));
        await page.locator('#btn_launch_party_room').click(); saved = false;
        await page.bringToFront();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1 && window.nativeQAIdentity);
        gameId = await page.evaluate(() => window.nativeQAIdentity);
        result.gameId = gameId;
        fs.writeFileSync(path.join(__dirname, 'private-native-account.json'), JSON.stringify({ ...fresh, gameId }), { mode: 0o600 });
        await ready(page);
        page.setDefaultTimeout(15000);
        console.log('WebKit single-hero native fixture ready; previous multiplayer campaign preserved.');
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
            console.log('WebKit native inventory cycle', index + 1);
        }
        assert.deepEqual((await state(page)).members.map(hero => hero.turns), before.members.map(hero => hero.turns));
        result.input = await page.evaluate(() => window.nativeKeyProof);
        assert.equal(result.input.starts.length, 4);
        assert.equal(result.input.sent.filter(entry => entry.msg === 'input').length, 4);
        const turns = (await state(page)).members[0].turns;
        await page.locator('#dungeon').focus(); await page.keyboard.press('.');
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns === turns + 1, turns);
        await ready(page);
        result.manualTurn = true;
        await send(page, 'key', { keycode: 111 });
        await page.waitForTimeout(1200);
        await send(page, 'key', { keycode: 27 });
        await ready(page);
        result.autoExplore = { before: turns + 1, after: (await state(page)).members[0].turns };
        await page.screenshot({ path: path.join(__dirname, 'webkit-candidate-native.png'), fullPage: true });
        await save(); assert.deepEqual(errors, []); result.passed = true;
        console.log('WebKit candidate: native inventory, interrupted waits, HUD focus, one turn, auto-explore and save passed.');
    } catch (error) {
        result.error = String(error.stack);
        result.body = (await page.locator('body').innerText().catch(() => '')).slice(-5000);
        await page.screenshot({ path: path.join(__dirname, 'native-candidate-failure.png') }).catch(() => {});
        throw error;
    } finally {
        if (!saved) await save().catch(error => result.cleanup_error = String(error));
        result.saved = saved;
        fs.writeFileSync(path.join(__dirname, 'native-candidate-result.json'), JSON.stringify(result, null, 2));
        await context.close();
    }
    return result;
};
