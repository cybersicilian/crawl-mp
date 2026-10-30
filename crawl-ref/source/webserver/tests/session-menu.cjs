/* Keyboard isolation, ownership, and save routing with real browser events. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.SESSION_MENU_PROOF_DIR || '/tmp/dcss-session-menu-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><section id="party_lobby_panel"></section>'
            + '<main id="normal"><div id="dcss_quick_dock"></div></main><div id="ui-stack"></div>'
            + '<button id="outside">Dungeon focus</button><input id="draft" class="text">'
            + '<div id="chat"><button id="chat_button">Chat</button></div>'
            + '<details id="quickbar_more"><summary>Commands</summary></details>'
            + '<dialog id="other_modal"><button>Other dialog</button></dialog></body></html>');
        for (const file of ['gameplay-workflows.css', 'session-menu.css'])
            await page.addStyleTag({ path: path.join(root, 'game_data/static/styles', file) });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = []; window.qaHandlers = {};
            window.qaState = { playing: true, watching: false, ready: true };
            window.modules = {
                jquery: window.jQuery,
                comm: {
                    send_message(msg, fields) { window.qaPackets.push({ msg, ...fields }); },
                    register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }
                },
                client: { in_game: () => window.qaState.playing, is_watching: () => window.qaState.watching },
                chat: { focus() {} }, './workflow-actions': { ready: () => window.qaState.ready }
            };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.define.amd = true;
            window.crawl_party = { state: { members: [{ slot: 0 }] } };
        });
        for (const [name, file] of [
            ['expedition-url', 'static/scripts/expedition-url.js'],
            ['library-ui', 'static/scripts/library-ui.js'],
            ['key_conversion', 'static/scripts/key_conversion.js'],
            ['client-input', 'static/scripts/client-input.js'],
            ['./menu-keyboard', 'game_data/static/menu-keyboard.js'],
            ['./focus-trap', 'game_data/static/focus-trap.js'],
            ['./session-menu', 'game_data/static/session-menu.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.qaHandlers.game_library({ player_id: 'owner', games: [] });
            window.qaHandlers.record_identity({ owner_id: 'owner', game_id: 'qa-game', player_id: 'hero' });
            window.modules['library-ui'].set_ready(true);
            window.modules.key_conversion.enable_code_conversion();
            const input = window.modules['client-input']({ in_game: () => window.qaState.playing,
                hide_lobby_tooltip() {}, hide_dialog() {} },
                { watching: false, party_member_active: false });
            window.jQuery(document).on('keydown.client', input.handle_keydown).on('keypress.client', input.handle_keypress);
            for (let index = 0; index < 3; index++) window.modules['./session-menu'].init();
        });
        const packets = () => page.evaluate(() => { const result = window.qaPackets; window.qaPackets = []; return result; });
        const opened = () => page.locator('#session_menu[open]').count();
        const open = async () => {
            await page.locator('#outside').focus(); await page.keyboard.press('Escape');
            assert.equal(await opened(), 1);
        };
        assert.equal(await page.locator('#dock_session_menu').count(), 1);
        await page.locator('#dock_session_menu').click();
        assert.equal(await opened(), 1, 'Direct Menu button opens the same dialog');
        await page.keyboard.press('Escape');
        assert(await page.locator('#dock_session_menu').evaluate(button => button === document.activeElement));
        await open();
        assert.equal(await page.locator('#session_menu_resume').evaluate(button => button === document.activeElement), true);
        for (const key of ['j', '1', 'ArrowLeft', 'Space']) await page.keyboard.press(key);
        assert.equal(await opened(), 0, 'Space resumes through native button activation');
        assert.deepEqual(await packets(), [], 'Menu keys never reach dungeon input');
        assert.equal(await page.locator('#outside').evaluate(button => button === document.activeElement), true);

        await page.keyboard.down('Escape'); await page.keyboard.down('Escape');
        assert.equal(await opened(), 1, 'Held Esc opens once');
        await page.keyboard.up('Escape');
        await page.keyboard.down('Escape'); await page.keyboard.down('Escape');
        assert.equal(await opened(), 0, 'Held Esc closes once without reopening');
        await page.keyboard.up('Escape');
        assert.deepEqual(await packets(), []);

        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 700 }); await open();
            for (let index = 0; index < 5; index++) {
                await page.keyboard.press('Tab');
                assert(await page.locator('#session_menu').evaluate(dialog => dialog.contains(document.activeElement)));
            }
            const bounds = await page.locator('#session_menu').evaluate(dialog => {
                const rect = dialog.getBoundingClientRect();
                return { left: rect.left, right: rect.right, overflow: dialog.scrollWidth > dialog.clientWidth + 1 };
            });
            assert(bounds.left >= 0 && bounds.right <= width && !bounds.overflow);
            if (width === 390) await page.screenshot({ path: path.join(out, 'menu-narrow.png') });
            await page.keyboard.press('Escape');
        }
        await packets();
        for (const selector of ['#draft', '#chat_button']) {
            await page.locator(selector).focus(); await page.keyboard.press('Escape'); assert.equal(await opened(), 0);
        }
        await packets();
        for (const blocked of ['prompt', 'watching', 'disconnected', 'popup', 'dialog', 'palette', 'ping', 'layout']) {
            await page.evaluate(blocked => {
                const modal = document.getElementById('other_modal');
                if (modal.open) modal.close();
                window.qaState.ready = blocked !== 'prompt'; window.qaState.watching = blocked === 'watching';
                window.qaState.playing = blocked !== 'disconnected';
                document.getElementById('ui-stack').innerHTML = blocked === 'popup' ? '<div>Inventory</div>' : '';
                if (blocked === 'dialog') document.getElementById('other_modal').showModal();
                document.getElementById('quickbar_more').open = blocked === 'palette';
                window.crawl_party.armed_ping_kind = blocked === 'ping' ? 'danger' : null;
                document.body.classList.toggle('hud-layout-editing', blocked === 'layout');
            }, blocked);
            if (blocked !== 'dialog') await page.locator('#outside').focus();
            await page.keyboard.press('Escape'); assert.equal(await opened(), 0, blocked + ' retains Esc');
        }
        await page.evaluate(() => {
            window.qaState = { playing: true, watching: false, ready: true };
            document.body.classList.remove('hud-layout-editing');
        });
        await packets(); await open();
        await page.locator('[data-session-save="continue"]').focus(); await page.keyboard.press('Enter');
        assert.deepEqual(await packets(), [{ msg: 'library_save', exit: false }]);
        assert.equal(await opened(), 0);
        assert.equal(await page.evaluate(() => window.modules['library-ui'].save(true)), false, 'No concurrent saves');
        await page.evaluate(() => window.qaHandlers.record_save_result({ ok: true }));
        await open(); await page.locator('[data-session-save="quit"]').click();
        assert.deepEqual(await packets(), [{ msg: 'library_save', exit: true }]);
        await page.evaluate(() => {
            window.qaHandlers.record_save_result({ ok: true });
            window.crawl_party.state.members.push({ slot: 1 });
        });
        await open();
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('[data-session-save="quit"]').click();
        assert.equal(await opened(), 1); assert.deepEqual(await packets(), []);
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-session-save="quit"]').focus(); await page.keyboard.press('Space');
        assert.equal(await opened(), 0); assert.deepEqual(await packets(), [{ msg: 'library_save', exit: true }]);
        await page.evaluate(() => window.qaHandlers.record_save_result({ ok: true }));
        await open();
        await page.evaluate(() => window.modules['library-ui'].set_ready(false));
        assert(await page.locator('[data-session-save="quit"]').isDisabled());
        await page.evaluate(() => {
            window.modules['library-ui'].set_ready(true);
            window.qaHandlers.record_identity({ owner_id: 'someone-else', game_id: 'qa-game', player_id: 'hero' });
        });
        assert(await page.locator('[data-session-save="continue"]').isDisabled());
        assert((await page.locator('#session_menu_status').innerText()).includes('Only the expedition owner'));
        assert.equal(await page.evaluate(() => window.modules['library-ui'].save(true)), false);
        assert.deepEqual(await packets(), []);
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_cleanup'); window.modules['./session-menu'].init();
        });
        await open(); await page.keyboard.press('Escape');
        assert.deepEqual(await packets(), [], 'Lifecycle rebind does not leak or double-handle input');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, keyboardIsolation: true, ownership: true,
            confirmation: true, saveRoutes: ['continue', 'quit'], viewportWidths: [1280, 768, 390, 320] }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') });
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
