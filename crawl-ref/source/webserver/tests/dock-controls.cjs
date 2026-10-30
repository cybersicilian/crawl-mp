/* Real browser activation of shared dock controls; no server or native game. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><section id="party_lobby_panel"></section>'
            + '<main id="normal"><div id="dcss_quick_dock">'
            + '<button id="dock_inventory" class="dcss-dock-btn" data-dock-key="i">Inventory</button>'
            + '</div></main><button id="outside">Outside dock</button></body></html>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = [];
            window.qaChatFocus = 0;
            window.qaHandlers = {};
            window.qaModules = {
                require: { toUrl: () => "data:text/css," },
                jquery: window.jQuery,
                comm: {
                    send_message(msg, fields) { window.qaPackets.push({ msg, ...fields }); },
                    register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }
                },
                chat: { focus() { window.qaChatFocus++; } },
                client: { is_watching() { return false; } },
                './status-icons': {
                    icon() { return document.createElementNS('http://www.w3.org/2000/svg', 'svg'); },
                    decorate() {}
                },
                'interface-polish': { observe() {} },
                './encyclopedia': { init() {} }, './gameplay-controls': { init() {} },
                './hud-inventory': { init() {} }, './panel-workspace': { init() {} }, './hud-iconography': { init() {} }, './hud-polish': { init() {} }, './viewport-zoom': { init() {} }, './quickbar': { init() {} },
                './player-card-details': { mount() {} }, './hud-bottom-strip': { init() {} },
                './player-card-sections': { init() {} }, './party-progress': { init() {} },
                './party-card-readings': { init() {} }, './floor-items': { init() {} }, './session-menu': { init() {} },
                './assimilation-panel': { init() {} }, './premium-dungeon': { init() {} }, './common-hotkeys': { init() {} }
            };
            window.define = (dependencies, factory) => {
                window.qaModules[window.qaName] = typeof dependencies === 'function'
                    ? dependencies() : factory(...dependencies.map(name => window.qaModules[name]));
            };
            window.qaBindDungeon = () => {
                const $ = window.jQuery;
                $(document).off('.qaDungeon').on('keydown.qaDungeon keypress.qaDungeon', event => {
                    window.qaPackets.push({ msg: 'input', type: event.type, key: event.key });
                }).on('click.qaDungeon', '[data-dock-key]', function () {
                    window.qaPackets.push({ msg: 'key', keycode: this.dataset.dockKey.charCodeAt(0) });
                });
            };
            window.qaName = 'expedition-url';
        });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/expedition-url.js') });
        for (const name of ['text-query', 'library-browser']) {
            await page.evaluate(name => { window.qaName = name; }, name);
            await page.addScriptTag({ path: path.join(root, 'static/scripts', name + '.js') });
        }
        await page.evaluate(() => { window.qaName = 'library-ui'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/library-ui.js') });
        for (const name of ['menu-keyboard', 'hud-input']) {
            await page.evaluate(name => { window.qaName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        await page.evaluate(() => {
            window.qaHandlers.game_library({ player_id: 'qa-owner', games: [] });
            window.qaHandlers.record_identity({ owner_id: 'qa-owner', game_id: 'qa-game', player_id: 'qa-hero' });
            window.qaName = 'adventure-ui';
        });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/adventure-ui.js') });
        await page.evaluate(() => {
            window.qaBindDungeon();
            for (let index = 0; index < 3; index++) window.qaModules['adventure-ui'].init();
        });
        assert(await page.locator('#dock_save_btn').isDisabled(), 'An early identity does not make initialization saveable');
        assert((await page.locator('#dock_save_btn').getAttribute('title')).includes('Finish the current action'));
        await page.evaluate(() => window.qaModules['library-ui'].set_ready(true));
        // Prove the simulated native keyboard listener can detect leaked keys.
        await page.locator('#outside').focus();
        await page.keyboard.press('ArrowLeft');
        assert((await page.evaluate(() => window.qaPackets)).some(packet => packet.msg === 'input'));

        async function activate(selector, key) {
            await page.evaluate(() => { window.qaPackets = []; });
            await page.locator(selector).focus();
            await page.keyboard.press(key);
            return page.evaluate(() => window.qaPackets);
        }
        for (const key of ['Enter', 'Space']) {
            let packets = await activate('#dock_save_btn', key);
            assert.deepEqual(packets, [{ msg: 'library_save', exit: false }], key + ' must save exactly once with no dungeon input');
            await page.evaluate(() => window.qaHandlers.record_save_result({ ok: true }));
            packets = await activate('#dock_inventory', key);
            assert.deepEqual(packets, [{ msg: 'key', keycode: 105 }], key + ' must invoke Inventory once without sending its own key');
            const chatBefore = await page.evaluate(() => window.qaChatFocus);
            packets = await activate('#dock_chat_btn', key);
            assert.deepEqual(packets, []);
            assert.equal(await page.evaluate(() => window.qaChatFocus), chatBefore + 1);
            packets = await activate('#dock_codex_btn', key);
            assert.deepEqual(packets, [{ msg: 'lookup_open' }]);
        }
        let confirmations = 0;
        page.on('dialog', async dialog => { confirmations++; await dialog.accept(); });
        await page.evaluate(() => { window.crawl_party = { state: { members: [{}, {}] } }; });
        assert.deepEqual(await activate('#dock_save_exit_btn', 'Enter'), [{ msg: 'library_save', exit: true }]);
        assert.equal(confirmations, 1, 'Saving and returning the whole party retains one consequential confirmation');
        await page.evaluate(() => window.qaHandlers.record_save_result({ ok: true }));

        await page.evaluate(() => {
            window.qaPackets = [];
            window.qaModules['library-ui'].set_ready(false);
            document.getElementById('dock_save_btn').click();
        });
        assert(await page.locator('#dock_save_btn').isDisabled(), 'Menus and prompts disable save actions immediately');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), []);
        await page.evaluate(() => window.qaModules['library-ui'].set_ready(true));

        // Delegation includes controls added after initialization; the handler
        // remains on the persistent dock when client loading clears document.
        await page.evaluate(() => {
            const input = document.createElement('input');
            input.id = 'dynamic_dock_input';
            document.getElementById('dcss_quick_dock').appendChild(input);
            window.jQuery(document).off();
            window.qaBindDungeon();
        });
        await page.evaluate(() => { window.qaPackets = []; });
        await page.locator('#dynamic_dock_input').pressSequentially('hjklyubn 2468');
        assert.equal(await page.locator('#dynamic_dock_input').inputValue(), 'hjklyubn 2468');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), []);
        assert.deepEqual(await activate('#dock_save_btn', 'Space'), [{ msg: 'library_save', exit: false }]);

        // Recreating the game dock binds the new node once without relying on
        // stale document events or keeping references to the previous game.
        await page.evaluate(() => {
            window.qaModules['library-ui'].reset();
            document.getElementById('normal').innerHTML = '<div id="dcss_quick_dock"></div>';
            window.qaHandlers.record_identity({ owner_id: 'qa-owner', game_id: 'qa-next', player_id: 'qa-next-hero' });
            window.qaModules['adventure-ui'].init();
            window.qaModules['adventure-ui'].init();
        });
        assert(await page.locator('#dock_save_btn').isDisabled(), 'A new game waits for its own command mode');
        await page.evaluate(() => window.qaModules['library-ui'].set_ready(true));
        assert.deepEqual(await activate('#dock_save_btn', 'Enter'), [{ msg: 'library_save', exit: false }]);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, nativeActivation: ['Enter', 'Space'],
            accidentalDungeonPackets: 0, repeatedInit: true, lifecycleRebind: true, confirmationPreserved: true }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
