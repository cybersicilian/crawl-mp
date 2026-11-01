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
            if (name.endsWith('.css')) {
                const file = ['game_data/static/styles', 'static/tabletop'].map(dir => path.join(root, dir, name))
                    .find(candidate => fs.existsSync(candidate));
                return route.fulfill({ contentType: 'text/css', body: file ? fs.readFileSync(file) : '' });
            }
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
        /* close is queued after native dismissal and releases the focus trap, which eats outside input until then. */
        const dismiss = async () => {
            await dialog.evaluate(node => {
                window.qaClosed = new Promise(resolve => node.addEventListener('close', resolve, { once: true }));
            });
            await page.keyboard.press('Escape');
            await page.evaluate(() => window.qaClosed.then(() => true));
        };
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
        await dismiss();
        assert.equal(await dialog.isVisible(), false);
        assert(await button.evaluate(node => node === document.activeElement), 'Closing restores the opener');
        await button.focus(); await page.keyboard.press('Enter');
        assert(await dialog.isVisible(), 'Keyboard activation opens the same reference');
        await dismiss();
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
            await dismiss();
        }
        await page.locator('#outside').focus(); await page.keyboard.press('j');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [{ msg: 'input', text: 'j' }],
            'Normal gameplay still receives one native command after help closes');

        /* Paper is a light surface in folio and a dark one elsewhere, so measure every theme. */
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.addStyleTag({ url: 'http://hotkeys.test/ui-themes.css' });
        for (const theme of ['folio', 'dungeon', 'contrast']) {
            await page.evaluate(name => { document.documentElement.dataset.uiTheme = name; }, theme);
            await button.click();
            await dialog.waitFor({ state: 'visible' });
            const failures = await dialog.evaluate(node => {
                const probe = node.appendChild(document.createElement('i'));
                const rgb = value => {
                    probe.style.color = value;
                    return getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
                };
                const luminance = color => {
                    const [r, g, b] = color.map(value => {
                        const channel = value / 255;
                        return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
                    });
                    return .2126 * r + .7152 * g + .0722 * b;
                };
                const ratio = (a, b) => {
                    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
                    return (high + .05) / (low + .05);
                };
                const token = name => rgb(getComputedStyle(node).getPropertyValue(name).trim());
                const paper = [token('--ui-page'), token('--ui-page-raised')];
                const tile = [token('--ui-page-inset')];
                const lowest = (color, backgrounds) => Math.min(...backgrounds.map(background => ratio(color, background)));
                const failed = [
                    ['#inspection_heading', paper], ['.common-hotkeys h2', paper], ['.common-hotkey-row kbd', paper],
                    ['.common-hotkeys dd', paper], ['.common-hotkey-movement p', paper], ['#inspection_context', paper],
                    ['.common-hotkey-compass kbd', tile], ['.common-hotkey-compass small', tile]
                ].flatMap(([selector, backgrounds]) => {
                    const measured = lowest(rgb(getComputedStyle(node.querySelector(selector)).color), backgrounds);
                    return measured < 4.5 ? [selector + ' ' + measured.toFixed(2)] : [];
                });
                const ring = lowest(token('--ui-focus'), paper);
                if (ring < 3) failed.push('focus ring ' + ring.toFixed(2));
                probe.remove();
                return failed;
            });
            assert.deepEqual(failures, [], theme + ' keeps the reference readable on its paper');
            await page.screenshot({ path: path.join(out, 'common-hotkeys-' + theme + '.png') });
            await dismiss();
        }

        await button.click();
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        assert.equal(await button.count(), 0);
        assert.equal(await dialog.isVisible(), false);
        assert.deepEqual(errors, []);
        console.log('Common hotkeys: eight canonical directions, keyboard isolation, focus return, four viewport widths, three theme contrasts and cleanup passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
