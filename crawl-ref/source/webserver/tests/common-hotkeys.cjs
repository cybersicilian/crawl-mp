/* Actual reference, native keyboard translator, modal focus and narrow layouts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.HOTKEYS_PROOF_DIR || '/tmp/dcss-common-hotkeys';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('http://hotkeys.test/**', route => {
            const name = path.basename(new URL(route.request().url()).pathname);
            if (name.endsWith('.css')) return route.fulfill({ contentType: 'text/css',
                body: fs.readFileSync(path.join(root, 'game_data/static/styles', name)) });
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>'
                + '<main id="normal"><div id="dcss_quick_dock"></div></main>'
                + '<button id="outside">Dungeon focus</button><div id="ui-stack"></div></body>' });
        });
        await page.goto('http://hotkeys.test/');
        await page.addStyleTag({ content: 'body { background:#111b19;color:#e9e3d2; font-family:system-ui; padding:20px; }' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = [];
            window.modules = { jquery: window.jQuery, require: { toUrl: name => 'http://hotkeys.test/' + name.replace(/^\.\//, '') },
                'rich-text': { render: text => text }, chat: { focus() {} } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.define.amd = true;
        });
        for (const [name, file] of [
            ['comm', 'static/scripts/comm.js'], ['key_conversion', 'static/scripts/key_conversion.js'],
            ['client-input', 'static/scripts/client-input.js'], ['./route-plan', 'game_data/static/route-plan.js'],
            ['./quickbar-model', 'game_data/static/quickbar-model.js'], ['./focus-trap', 'game_data/static/focus-trap.js'],
            ['./inspection-dialog', 'game_data/static/inspection-dialog.js'],
            ['./common-hotkeys', 'game_data/static/common-hotkeys.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.socket = { readyState: 1, send: packet => window.qaPackets.push(JSON.parse(packet)) };
            window.modules.key_conversion.enable_code_conversion();
            const input = window.modules['client-input']({ in_game: () => true },
                { watching: false, party_member_active: false });
            window.jQuery(document).on('keydown.client', input.handle_keydown).on('keypress.client', input.handle_keypress);
            window.modules['./common-hotkeys'].init();
            window.modules['./common-hotkeys'].init();
        });
        const button = page.locator('#dock_common_hotkeys');
        const dialog = page.locator('#inspection_dialog');
        assert.equal(await button.count(), 1);
        await button.click();
        await dialog.waitFor({ state: 'visible' });
        assert.equal(await page.locator('#inspection_heading').textContent(), 'Common hotkeys');
        assert.equal(await dialog.locator('[role=listitem]').count(), 8);
        assert.match(await dialog.innerText(), /Numpad 5/);
        assert.match(await dialog.innerText(), /Assigned quickbar actions/);
        assert.match(await dialog.innerText(), /takes no turn/);
        for (const key of ['j', '1', 'ArrowLeft', 'Control+p', 'F12', 'Tab', 'Shift+Tab'])
            await page.keyboard.press(key);
        assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Modal focus stays inside the reference');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [], 'Reading and navigating help sends no game input');
        await page.keyboard.press('Escape');
        assert.equal(await dialog.isVisible(), false);
        assert(await button.evaluate(node => node === document.activeElement), 'Closing restores the opener');
        await button.focus(); await page.keyboard.press('Enter');
        assert(await dialog.isVisible(), 'Keyboard activation opens the same reference');
        await page.keyboard.press('Escape');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), []);

        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 700 });
            await button.click();
            await page.waitForFunction(() => document.getElementById('inspection_dialog').getBoundingClientRect().width > 200);
            const geometry = await dialog.evaluate(node => {
                const rect = node.getBoundingClientRect();
                return { left: rect.left, right: rect.right, overflow: node.scrollWidth > node.clientWidth + 1 };
            });
            assert(geometry.left >= 0 && geometry.right <= width && !geometry.overflow);
            if (width === 1280 || width === 390)
                await page.screenshot({ path: path.join(out, 'common-hotkeys-' + width + '.png') });
            await page.keyboard.press('Escape');
        }
        await page.locator('#outside').focus(); await page.keyboard.press('j');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [{ msg: 'input', text: 'j' }],
            'Normal gameplay still receives one native command after help closes');
        await button.click();
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        assert.equal(await button.count(), 0);
        assert.equal(await dialog.isVisible(), false);
        assert.deepEqual(errors, []);
        console.log('Common hotkeys: eight canonical directions, keyboard isolation, focus return, four viewport widths and cleanup passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
