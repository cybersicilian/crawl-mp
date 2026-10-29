/* Capture real local gameplay with one account and an unchanged native world. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const origin = process.env.WEBTILES_URL, output = process.env.UI_THEME_PROOF_DIR;
assert(origin && ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], proof = { nativeEngine: true, themes: [] };
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
        return name && require(name).ready() && !document.querySelector('#ui-stack > *');
    });
    const shot = async name => {
        await page.mouse.move(1, 1);
        await page.evaluate(() => { if (window.dcss_tooltips) window.dcss_tooltips.hide(); return document.fonts.ready; });
        await page.screenshot({ path: path.join(output, name + '.png') });
    };
    try {
        await page.goto(origin);
        proof.account = 'ThemeQA' + Date.now().toString(36);
        await signInTestAccount(page, proof.account, 'crawl');
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        for (let slot = 0; slot < 4; slot++) {
            if (slot) await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-slot-species`).selectOption('Human');
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-slot-job`).selectOption('Fighter');
        }
        await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('4 heroes'));
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 60000 });
        await page.locator('#loader').waitFor({ state: 'hidden' }); await ready();
        proof.initialClock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        for (const theme of ['folio', 'dungeon', 'contrast']) {
            await page.locator('#dock_session_menu').click();
            await page.locator('[data-session-graphics]').click();
            const before = await page.evaluate(() => {
                window.themeInputMessages = [];
                const comm = require('comm'), original = comm.send_message;
                window.themeRestoreComm = () => { comm.send_message = original; };
                comm.send_message = function (type) {
                    if (type === 'input' || type === 'key') window.themeInputMessages.push(type);
                    return original.apply(this, arguments);
                };
                return window.crawl_party.state.world_aut_clock;
            });
            await page.locator('[data-graphics-field="ui_theme"]').selectOption(theme);
            await page.waitForFunction(() => document.querySelector('.graphics-save-status')?.textContent === 'Saved to your account.');
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => document.documentElement.dataset.uiTheme), theme);
            const after = await page.evaluate(() => {
                window.themeRestoreComm();
                return { clock: window.crawl_party.state.world_aut_clock, inputs: window.themeInputMessages };
            });
            assert.equal(after.clock, before); assert.deepEqual(after.inputs, []);
            await shot(`game-${theme}`);
            await page.evaluate(() => require('comm').send_message('key', { keycode: 105 }));
            await page.locator('.menu_inventory').waitFor(); await shot(`inventory-${theme}`);
            await page.evaluate(() => require('comm').send_message('key', { keycode: 27 })); await ready();
            await page.evaluate(() => window.crawl_party.open_inspector(0, 'overview'));
            await page.locator('#party_inspector_modal[open]').waitFor(); await shot(`character-${theme}`);
            await page.locator("[data-insp-tab='equipment']").click(); await shot(`equipment-${theme}`);
            await page.locator('#party_inspector_close_btn').click();
            await page.waitForFunction(() => !document.querySelector('#party_inspector_modal')?.open);
            proof.themes.push({ theme, unchangedWorldClock: true, settingsSentNoNativeCommands: true });
        }
        proof.finalClock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        assert.equal(proof.finalClock, proof.initialClock);
        assert.deepEqual(errors, []); proof.errors = errors; proof.passed = true;
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(proof, null, 2));
        console.log(JSON.stringify(proof));
    } catch (error) {
        await shot('failure').catch(() => {});
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ errors, message: error.message }, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
