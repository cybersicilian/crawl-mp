/* Verify deployed code and keyboard behavior with the saved Safari QA campaign. */
const fs = require('node:fs');
const path = require('node:path');
const { webkit } = require('playwright');
const { assert, send, ready, state } = require('../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const account = JSON.parse(fs.readFileSync(path.join(__dirname, 'private-native-account.json'), 'utf8'));
const url = 'https://dcss.iancaltabiano.com';
const proof = { passed: false, errors: [], checks: [], gameId: account.gameId };
let browser, page, saved = true;

async function save() {
    await ready(page);
    if (!await page.locator('#session_menu').evaluate(node => node.open).catch(() => false))
        await page.locator('#dock_session_menu').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#session_menu [data-session-save="quit"]').click();
    await page.waitForFunction(() => !require('client').in_game());
    const record = await (await page.request.get(url + '/api/library/games/' + account.gameId)).json();
    assert(record.status === 'saved' && record.loadable); saved = true;
}

(async () => {
    browser = await webkit.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => proof.errors.push(error.message));
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof require === 'function' && require.defined('client'));
        assert(await page.evaluate(() => require('client-transport').toString().includes('Animation catch-up must yield')));
        proof.checks.push('Fresh public WebKit client loads the deployed cooperative catch-up code');
        await page.locator('#username').fill(account.username);
        await page.locator('#password').fill(account.password);
        await page.locator('#login_form').evaluate(form => form.requestSubmit());
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await send(page, 'library_load', { id: account.gameId }); saved = false;
        await page.bringToFront();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1);
        await ready(page); page.setDefaultTimeout(15000);
        const before = (await state(page)).members[0].turns;
        await page.locator('#dungeon').focus();
        await page.evaluate(() => require('client').delay(1000));
        await page.keyboard.press('i');
        await page.waitForFunction(() => document.querySelector('#ui-stack')?.children.length > 0);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('#ui-stack')?.children.length === 0);
        await ready(page);
        assert.equal((await state(page)).members[0].turns, before);
        proof.checks.push('Native inventory key interrupts animation wait and closes without spending a turn');
        await page.locator('#dock_common_hotkeys').focus(); await page.keyboard.press('.');
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns === turns + 1, before);
        await ready(page);
        proof.checks.push('A gameplay key from toolbar focus produces exactly one native turn');
        await save(); proof.checks.push('Native campaign saves successfully after the service restart');
        assert.deepEqual(proof.errors, []); proof.passed = true;
    } catch (error) {
        proof.error = String(error.stack);
        await page.screenshot({ path: path.join(__dirname, 'public-after-failure.png') }).catch(() => {});
        throw error;
    } finally {
        if (!saved) {
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close())).catch(() => {});
            for (let i = 0; i < 3 && await page.locator('#ui-stack > *').count().catch(() => 0); i++)
                await send(page, 'key', { keycode: 27 }).catch(() => {});
            await save().catch(error => proof.cleanup_error = String(error));
        }
        proof.saved = saved;
        fs.writeFileSync(path.join(__dirname, 'public-after-result.json'), JSON.stringify(proof, null, 2));
        await browser.close(); console.log(JSON.stringify(proof));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
