/* Real browser keys: incidental HUD focus yields to the native input stream. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><button id="outside">Outside</button>'
            + '<main id="normal"><button id="action">Action</button><span id="reading" tabindex="0">Stat</span>'
            + '<section id="assimilation"><span id="slot" tabindex="0">Empty slot</span></section>'
            + '<div id="dcss_quick_dock"><button id="dock">Dock action</button></div>'
            + '<input id="draft"><textarea id="notes"></textarea><select id="choice"><option>One</option></select>'
            + '<div id="editor" contenteditable="true"><span>Draft</span></div>'
            + '<div id="chat"><input id="chat_input" class="text"></div>'
            + '<details id="quickbar_more"><summary>Commands</summary><button id="tray">Tray action</button></details>'
            + '</main><div id="ui-stack"></div><dialog id="modal"><button>Close</button></dialog></body></html>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = []; window.qaClicks = 0; window.qaHotkeys = 0; window.qaChat = 0;
            window.qaState = { watching: false, party_member_active: false };
            window.modules = { jquery: window.jQuery,
                comm: { send_message: (msg, fields) => window.qaPackets.push({ msg, ...fields }) },
                chat: { focus: () => window.qaChat++ } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.qaName] = factory(...deps.map(name => window.modules[name]));
            };
        });
        for (const [name, file] of [
            ['key_conversion', 'static/scripts/key_conversion.js'],
            ['client-input', 'static/scripts/client-input.js'],
            ['./menu-keyboard', 'game_data/static/menu-keyboard.js'],
            ['./hud-input', 'game_data/static/hud-input.js']
        ]) {
            await page.evaluate(name => { window.qaName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            const $ = window.jQuery, modules = window.modules;
            modules.key_conversion.enable_code_conversion();
            const input = modules['client-input']({ in_game: () => true }, window.qaState);
            $(document).on('keydown.client', input.handle_keydown).on('keypress.client', input.handle_keypress);
            // These reproduce the existing dock, sidebar and assimilation guards.
            $('#normal').on('keydown keypress keyup', event => event.stopPropagation());
            $('#action, #dock').on('click', () => window.qaClicks++);
            // Registered after HUD init too: document capture must always win.
            modules['./hud-input'].init(); modules['./hud-input'].init();
            document.addEventListener('keydown', event => {
                if (event.key !== 'q') return;
                event.preventDefault(); event.stopImmediatePropagation(); window.qaHotkeys++;
            }, true);
        });
        const packets = () => page.evaluate(() => window.qaPackets.splice(0));
        const press = async key => { await page.keyboard.press(key); return packets(); };
        const keys = ['h', 'k', '.', 'Tab', 'Shift+Tab', 'ArrowLeft', 'ArrowUp', 'Numpad1', '1',
            'Escape', 'Control+p', 'Shift+ArrowLeft', 'Backspace'];
        let routes = 0;
        for (const key of keys) {
            await page.locator('#outside').focus();
            const expected = await press(key);
            assert.equal(expected.length, 1, key + ' baseline reaches the native translator once');
            for (const id of ['action', 'reading', 'slot', 'dock', 'tray']) {
                if (id === 'tray') {
                    if (key === 'Escape') continue; // Palette Escape remains local.
                    await page.evaluate(() => { document.getElementById('quickbar_more').open = true; });
                }
                await page.locator('#' + id).click(); await packets();
                assert.deepEqual(await press(key), expected, id + ': ' + key + ' retains native input');
                if (id === 'tray') assert.equal(await page.locator('#quickbar_more').getAttribute('open'), null);
                assert.equal(await page.evaluate(() => document.activeElement === document.body), true,
                    'Gameplay releases incidental HUD focus');
                routes++;
            }
        }
        for (const key of ['Enter', 'Space']) {
            await page.locator('#action').focus();
            const before = await page.evaluate(() => window.qaClicks);
            assert.deepEqual(await press(key), []);
            assert.equal(await page.evaluate(() => window.qaClicks), before + 1, key + ' activates exactly once');
        }
        await page.locator('#reading').click();
        assert.deepEqual(await press('q'), []);
        assert.equal(await page.evaluate(() => window.qaHotkeys), 1, 'Document capture hotkeys take precedence');
        await page.locator('#reading').click();
        assert.deepEqual(await press('F12'), []);
        assert.equal(await page.evaluate(() => window.qaChat), 1, 'Native chat hotkey remains available');
        for (const id of ['draft', 'notes', 'editor', 'chat_input']) {
            await page.locator('#' + id).click();
            assert.deepEqual(await press('h'), [], id + ' retains text entry');
            const text = await page.locator('#' + id).evaluate(node => node.value ?? node.textContent);
            assert(text.includes('h'));
        }
        await page.locator('#choice').focus();
        assert.deepEqual(await press('ArrowDown'), [], 'Select navigation stays local');
        // Enter the HUD from the browser focus order, without pointer focus.
        await page.locator('#outside').focus();
        await page.evaluate(() => document.activeElement.blur());
        await page.locator('#action').focus();
        assert.deepEqual(await press('Tab'), []);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'reading', 'Deliberate Tab order is preserved');
        assert.deepEqual(await press('Shift+Tab'), []);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'action');
        assert.deepEqual(await press('h'), [{ msg: 'input', text: 'h' }], 'Gameplay also exits deliberate UI focus');

        await page.locator('#quickbar_more > summary').click();
        await page.locator('#tray').focus();
        assert.deepEqual(await press('h'), [{ msg: 'input', text: 'h' }], 'Non-editing palette focus yields to gameplay');
        assert.equal(await page.locator('#quickbar_more').getAttribute('open'), null, 'Gameplay dismisses the palette');
        for (const guard of ['popup', 'dialog', 'layout']) {
            await page.evaluate(guard => {
                if (guard === 'popup') document.getElementById('ui-stack').innerHTML = '<div>Native menu</div>';
                if (guard === 'dialog') document.getElementById('modal').show();
                if (guard === 'layout') document.body.classList.add('hud-layout-editing');
            }, guard);
            await page.locator('#reading').click();
            assert.deepEqual(await press('h'), [], guard + ' owns its keyboard input');
            await page.evaluate(() => {
                document.getElementById('ui-stack').textContent = '';
                document.getElementById('modal').close();
                document.body.classList.remove('hud-layout-editing');
            });
        }
        await page.locator('#reading').click();
        await page.evaluate(() => {
            document.getElementById('reading').dispatchEvent(new KeyboardEvent('keydown',
                { key: 'h', code: 'KeyH', keyCode: 229, isComposing: true, bubbles: true }));
        });
        assert.deepEqual(await packets(), [], 'IME composition stays local');
        await page.evaluate(() => { window.qaState.watching = true; });
        await page.locator('#reading').click();
        assert.deepEqual(await press('h'), [], 'Spectators do not gain game input');
        await page.evaluate(() => { window.qaState.party_member_active = true; });
        await page.locator('#reading').click();
        assert.deepEqual(await press('h'), [{ msg: 'input', text: 'h' }], 'Controlled party guests retain input');
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        await page.locator('#reading').click();
        assert.deepEqual(await press('h'), [], 'Cleanup removes the routing boundary');
        await page.evaluate(() => window.modules['./hud-input'].init());
        await page.locator('#reading').click();
        assert.deepEqual(await press('h'), [{ msg: 'input', text: 'h' }], 'Reinit binds exactly once');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, nativeHudRoutes: routes, nativeKeys: keys.length,
            activation: true, hotkeys: true, editing: true, navigation: true, ownership: true, lifecycle: true }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
