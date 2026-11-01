/* Real account HTTP persistence and shared controls; no native game fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const checkThemes = require('./helpers/ui-theme-checks.cjs');
const origin = process.env.GRAPHICS_TEST_URL, output = process.env.GRAPHICS_PROOF_DIR;
assert(origin && output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const page = await context.newPage(), errors = [], writes = [];
    const observe = target => {
        target.on('pageerror', error => errors.push(error.message));
        target.on('request', request => { if (request.method() === 'POST') writes.push(new URL(request.url()).pathname); });
    };
    observe(page);
    const saved = async target => target.waitForFunction(() => document.querySelector('.graphics-save-status')?.textContent === 'Saved to your account.');
    const graphics = async target => (await (await target.request.get(origin + '/api/profile/graphics')).json()).settings;
    try {
        await page.goto(origin + '/fixture-login/Aster'); await page.goto(origin + '/settings/graphics');
        await page.waitForSelector('[data-graphics-preset="classic"][aria-pressed="true"]');
        const tilesetSaved = target => target.waitForFunction(() => document.querySelector('.tileset-save-status')?.textContent.startsWith('Saved'));
        await tilesetSaved(page);
        assert(await page.getByRole('radio', { name: 'Default tiles', exact: false }).isChecked());
        await page.getByRole('radio', { name: 'Premium tiles', exact: false }).check(); await tilesetSaved(page);
        assert.equal((await (await page.request.get(origin + '/api/profile/appearance')).json()).texture_pack, 'illustrated');
        assert.equal((await graphics(page)).mode, 'classic', 'Tileset selection does not enable effects');
        const profile = await context.newPage(); observe(profile); await profile.goto(origin + '/profile');
        await profile.waitForFunction(() => require.defined('profile-appearance'));
        assert(await profile.locator('input[value="illustrated"]').isChecked());
        await profile.locator('input[value="classic"]').check();
        await profile.waitForFunction(() => document.querySelector('.profile-save-status').textContent.startsWith('Saved'));
        await page.waitForFunction(() => require('texture-pack').current() === 'classic');
        await profile.locator('input[value="illustrated"]').check();
        await profile.waitForFunction(() => document.querySelector('.profile-save-status').textContent.startsWith('Saved'));
        await page.waitForFunction(() => require('texture-pack').current() === 'illustrated');
        await profile.close();
        const probe = await context.newPage(); observe(probe); await probe.goto(origin + '/probe');
        await probe.waitForFunction(() => window.graphicsProbe?.prefs.snapshot().ready);
        assert.equal(await probe.evaluate(() => graphicsProbe.visual.current()), 'classic');
        const themeProof = await checkThemes(page, probe, output, saved);
        await page.locator('[data-graphics-preset="balanced"]').click(); await saved(page);
        await probe.waitForFunction(() => graphicsProbe.visual.enabled('lighting'));
        assert.equal(await page.locator('[data-graphics-field="ui_theme"]').inputValue(), 'dungeon');
        assert.equal((await graphics(page)).materials, false);
        await page.locator('[data-graphics-preset="premium"]').click(); await saved(page);
        await page.locator('[data-graphics-field="clouds"]').uncheck(); await saved(page);
        assert.equal((await graphics(page)).clouds, false);
        assert.equal(await page.locator('.graphics-current').textContent(), 'Custom');
        await page.locator('[data-graphics-field="motion"]').selectOption('reduced'); await saved(page);
        await probe.waitForFunction(() => !graphicsProbe.visual.animated());
        await page.screenshot({ path: path.join(output, 'graphics-desktop.png'), fullPage: true });
        await page.reload(); await saved(page);
        await tilesetSaved(page); assert(await page.locator('[data-tileset="illustrated"]').isChecked());
        assert.equal(await page.locator('[data-graphics-field="clouds"]').isChecked(), false);
        assert.equal(await page.locator('[data-graphics-field="motion"]').inputValue(), 'reduced');
        const otherDevice = await browser.newContext(), remote = await otherDevice.newPage(); observe(remote);
        await remote.goto(origin + '/fixture-login/Aster'); await remote.goto(origin + '/settings/graphics'); await saved(remote);
        await tilesetSaved(remote); assert(await remote.locator('[data-tileset="illustrated"]').isChecked());
        assert.equal(await remote.locator('[data-graphics-field="clouds"]').isChecked(), false);
        assert.equal(await remote.locator('[data-graphics-field="motion"]').inputValue(), 'reduced');
        assert.equal(await remote.locator('[data-graphics-field="ui_theme"]').inputValue(), 'dungeon');
        const peerContext = await browser.newContext(), peer = await peerContext.newPage(); observe(peer);
        await peer.goto(origin + '/fixture-login/Rowan'); await peer.goto(origin + '/settings/graphics'); await saved(peer);
        await tilesetSaved(peer); assert(await peer.locator('[data-tileset="classic"]').isChecked());
        assert.equal((await graphics(peer)).mode, 'classic');
        assert.equal((await graphics(peer)).ui_theme, 'folio');
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, 'graphics-mobile.png'), fullPage: true });
        await page.locator('[data-graphics-preset="classic"]').click(); await saved(page);
        assert(await page.locator('[data-tileset="illustrated"]').isChecked(), 'Effect presets preserve the chosen tileset');
        let delayed = false;
        await page.route('**/api/profile/graphics', async route => {
            if (route.request().method() === 'POST' && !delayed) { delayed = true; await new Promise(resolve => setTimeout(resolve, 180)); }
            await route.continue();
        });
        await page.locator('[data-graphics-preset="premium"]').click();
        await page.locator('[data-graphics-preset="classic"]').click(); await saved(page);
        assert.equal((await graphics(page)).mode, 'classic'); await page.unroute('**/api/profile/graphics');
        await page.route('**/api/profile/graphics', route => route.request().method() === 'POST'
            ? route.fulfill({ status: 503, body: 'Controlled save failure' }) : route.continue());
        await page.locator('[data-graphics-preset="premium"]').click();
        await page.waitForFunction(() => document.querySelector('.graphics-save-status').textContent.startsWith('Could not save'));
        assert.equal(await page.locator('[data-graphics-preset="classic"]').getAttribute('aria-pressed'), 'true');
        await probe.waitForFunction(() => graphicsProbe.visual.current() === 'classic'); await page.unroute('**/api/profile/graphics');
        await probe.locator('#graphics_probe_open').click(); await saved(probe);
        await tilesetSaved(probe);
        assert(await probe.locator('[data-tileset="illustrated"]').isChecked());
        await probe.locator('[data-tileset="classic"]').check(); await tilesetSaved(probe);
        assert.equal(await probe.evaluate(() => require('texture-pack').current()), 'classic');
        await probe.locator('[data-tileset="classic"]').focus(); await probe.keyboard.press('ArrowDown'); await tilesetSaved(probe);
        assert(await probe.locator('[data-tileset="illustrated"]').isChecked());
        assert.equal(await probe.evaluate(() => window.nativeKeys), 0);
        await probe.route('**/api/profile/appearance', route => route.request().method() === 'POST'
            ? route.fulfill({ status: 503, body: 'Controlled tileset save failure' }) : route.continue());
        await probe.locator('[data-tileset="classic"]').check();
        await probe.waitForFunction(() => document.querySelector('.tileset-save-status').textContent.startsWith('Could not save'));
        assert(await probe.locator('[data-tileset="illustrated"]').isChecked());
        assert.equal(await probe.evaluate(() => require('texture-pack').current()), 'illustrated');
        await probe.unroute('**/api/profile/appearance');
        await probe.locator('[data-graphics-preset="premium"]').click(); await saved(probe);
        await probe.locator('[data-graphics-field="lighting"]').focus(); await probe.keyboard.press('Space'); await saved(probe);
        assert.equal(await probe.evaluate(() => graphicsProbe.visual.enabled('lighting')), false);
        assert.equal(await probe.evaluate(() => window.nativeKeys), 0);
        await probe.locator('[data-graphics-field="ui_theme"]').focus(); await probe.keyboard.press('Home');
        await probe.keyboard.press('Enter'); await saved(probe);
        assert.equal(await probe.evaluate(() => window.nativeKeys), 0);
        await probe.screenshot({ path: path.join(output, 'graphics-dialog.png') });
        await probe.keyboard.press('Escape');
        assert.equal(await probe.locator('#settings_dialog').evaluate(node => node.open), false);
        assert.equal(await probe.evaluate(() => document.activeElement.id), 'graphics_probe_open');
        await page.request.get(origin + '/fixture-login/Rowan');
        await page.locator('[data-graphics-preset="balanced"]').click();
        await page.waitForFunction(() => document.querySelector('.graphics-save-status').textContent.startsWith('Could not save'));
        assert.equal((await graphics(page)).mode, 'classic');
        assert(writes.every(route => ['/api/profile/graphics', '/api/profile/appearance'].includes(route)));
        assert.deepEqual(errors, []);
        if (process.env.THEME_DESIGN_REPORT) {
            const report = await context.newPage();
            await report.goto(require('node:url').pathToFileURL(process.env.THEME_DESIGN_REPORT).href);
            assert(await report.locator('h2').count() >= 8);
            assert(await report.locator('.tpd-logo').evaluate(node => node.complete && node.naturalWidth > 0));
            await report.screenshot({ path: path.join(output, 'design-brief-desktop.png') });
            await report.setViewportSize({ width: 390, height: 844 });
            assert(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await report.screenshot({ path: path.join(output, 'design-brief-mobile.png') });
            await report.close();
        }
        const result = { passed: true, realHTTPPersistence: true, nativeEngine: false, classicDefault: true,
            freshDevicePersists: true, crossTabImmediate: true, accountsIsolated: true, rapidLastChoiceWins: true,
            failedSaveRestores: true, staleAccountRejected: true, mobileNoOverflow: true,
            dialogKeyboardAndFocus: true, noNativeCommands: true, tilesetIndependentOfEffects: true,
            tilesetDialogPersistenceAndRollback: true, themeProof,
            UIThemeAccountPersistence: true, UIThemePresetIndependence: true, errors, writes: writes.length };
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
    } catch (error) {
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ errors, message: error.message }, null, 2));
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true, timeout: 5000 }).catch(() => {});
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
