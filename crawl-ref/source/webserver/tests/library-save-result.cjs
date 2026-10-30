/* Save response behavior in one isolated browser; no game or server. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const uiSource = process.env.LIBRARY_UI_PATH || path.join(root, 'static/scripts/library-ui.js');

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><section id="party_lobby_panel"></section>'
            + '<div id="dcss_quick_dock"></div></body></html>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = [];
            window.qaHandlers = {};
            const modules = {
                jquery: window.jQuery,
                require: { toUrl: () => 'data:text/css,' },
                'expedition-url': { hash: id => '#game-' + id },
                'library-browser': { init() {}, update() {} },
                comm: {
                    send_message(msg, fields) { window.qaPackets.push({ msg, ...fields }); },
                    register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }
                }
            };
            window.define = (dependencies, factory) => {
                window.qaLibrary = factory(...dependencies.map(name => modules[name]));
            };
        });
        await page.addScriptTag({ path: uiSource });
        await page.evaluate(() => {
            window.qaHandlers.game_library({ player_id: 'owner', games: [] });
            window.qaHandlers.record_identity({ owner_id: 'owner', game_id: 'game', player_id: 'hero' });
            window.qaLibrary.set_ready(true);
        });
        const save = page.locator('#dock_save_btn');
        const specific = 'Another hero is finishing an action. Your view is unchanged.';
        const outcomes = [
            { result: { ok: false, error: specific }, notice: specific },
            { result: { ok: false }, notice: 'Close the current menu or prompt, then save again.' },
            { result: { ok: true }, notice: 'Expedition saved. You can keep playing.' }
        ];
        for (const outcome of outcomes) {
            assert(await save.isEnabled());
            await save.click();
            assert(await save.isDisabled(), 'Pending save prevents duplicate submission');
            assert((await page.evaluate(() => window.qaLibrary.save_status())).saving);
            await page.evaluate(result => window.qaHandlers.record_save_result(result), outcome.result);
            assert(await save.isEnabled(), 'Every result allows a retry');
            assert.equal((await page.evaluate(() => window.qaLibrary.save_status())).saving, false);
            assert.equal(await page.locator('#library_notice').textContent(), outcome.notice);
            assert.equal(await page.locator('#library_notice').getAttribute('role'), 'status');
        }
        assert.deepEqual(await page.evaluate(() => window.qaPackets),
            outcomes.map(() => ({ msg: 'library_save', exit: false })));
        assert.deepEqual(errors, []);
        console.log('PASS: save rejection reason, generic fallback, retry, success and duplicate prevention');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
