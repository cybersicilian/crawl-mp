/* Real authenticated HTTP persistence and profile UI; no native world or commands. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const url = process.env.PROFILE_TEST_URL, output = process.env.PROFILE_PROOF_DIR;
assert(url && output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions(process.env.ART_DIRECTION_BROWSER_CHANNEL));
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const page = await context.newPage(), errors = [], mutations = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') mutations.push(new URL(request.url()).pathname); });
    const saved = () => page.waitForFunction(() => document.querySelector('.profile-save-status').textContent.startsWith('Saved'));
    try {
        await page.goto(url + '/fixture-login/Aster'); await page.goto(url + '/profile');
        await page.waitForFunction(() => typeof require === 'function' && require.defined('profile-appearance'));
        assert(await page.locator('input[value="classic"]').isChecked());
        const probe = await context.newPage(); await probe.goto(url + '/pack-probe');
        await probe.waitForFunction(() => window.packProbe?.current() === 'classic');
        await page.locator('input[value="illustrated"]').check(); await saved();
        await probe.waitForFunction(() => window.packProbe.current() === 'illustrated');
        assert.equal((await (await page.request.get(url + '/api/profile/appearance')).json()).texture_pack, 'illustrated');
        await page.reload(); await page.waitForFunction(() => require.defined('profile-appearance'));
        assert(await page.locator('input[value="illustrated"]').isChecked());
        await page.screenshot({ path: path.join(output, 'profile-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, 'profile-mobile.png'), fullPage: true });
        await page.locator('input[value="classic"]').check(); await saved();
        let delayed = false;
        await page.route('**/api/profile/appearance', async route => {
            if (route.request().method() === 'POST' && !delayed) {
                delayed = true; await new Promise(resolve => setTimeout(resolve, 200));
            }
            await route.continue();
        });
        await page.locator('input[value="illustrated"]').check();
        await page.waitForFunction(() => document.querySelector('.profile-save-status').textContent === 'Saving…');
        await page.locator('input[value="classic"]').check(); await saved();
        assert.equal((await (await page.request.get(url + '/api/profile/appearance')).json()).texture_pack, 'classic');
        await page.unroute('**/api/profile/appearance');
        await page.route('**/api/profile/appearance', route => route.request().method() === 'POST'
            ? route.fulfill({ status: 503, body: 'Controlled save failure' }) : route.continue());
        await page.locator('input[value="illustrated"]').check();
        await page.waitForFunction(() => document.querySelector('.profile-save-status').textContent.startsWith('Could not save'));
        assert(await page.locator('input[value="classic"]').isChecked());
        await probe.waitForFunction(() => window.packProbe.current() === 'classic');
        await page.unroute('**/api/profile/appearance');
        const peer = await browser.newContext(), peerPage = await peer.newPage();
        await peerPage.goto(url + '/fixture-login/Rowan'); await peerPage.goto(url + '/profile');
        await peerPage.waitForFunction(() => require.defined('profile-appearance'));
        assert(await peerPage.locator('input[value="classic"]').isChecked());
        await page.locator('input[value="illustrated"]').check(); await saved();
        assert.equal((await (await peerPage.request.get(url + '/api/profile/appearance')).json()).texture_pack, 'classic');
        await page.setViewportSize({ width: 1280, height: 850 });
        await page.locator('input[value="illustrated"]').focus(); await page.keyboard.press('ArrowLeft'); await saved();
        assert(await page.locator('input[value="classic"]').isChecked());
        await page.keyboard.press('ArrowRight'); await saved();
        assert(await page.locator('input[value="illustrated"]').isChecked());
        await page.request.get(url + '/fixture-login/Rowan');
        await page.locator('input[value="classic"]').check();
        await page.waitForFunction(() => document.querySelector('.profile-save-status').textContent.startsWith('Could not save'));
        assert(await page.locator('input[value="illustrated"]').isChecked());
        assert.equal((await (await page.request.get(url + '/api/profile/appearance')).json()).texture_pack, 'classic');
        assert(mutations.every(name => name === '/api/profile/appearance'));
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: true, nativeEngine: false,
            realHTTPPersistence: true, crossTabImmediate: true, reloadPersists: true, lastRapidChoiceWins: true,
            failedSaveRestoresPrevious: true, accountsIsolated: true, staleProfileCannotWrite: true, radioKeyboard: true,
            noGameplayMutations: true, mutations, errors }, null, 2));
        console.log('Profile HTTP, cross-tab application, reload, rapid toggles, rollback, keyboard and account isolation passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
