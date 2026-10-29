/* Real browser input: compact labels, transient feedback and native command isolation. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = process.env.DIRECTION_PAD_ROOT || path.resolve(__dirname, '..');
const overlay = process.env.DIRECTION_PAD_OVERLAY || root;
const directions = [
    ['northwest', 'y', 7, 'Home'], ['north', 'k', 8, 'ArrowUp'],
    ['northeast', 'u', 9, 'PageUp'], ['west', 'h', 4, 'ArrowLeft'],
    ['east', 'l', 6, 'ArrowRight'], ['southwest', 'b', 1, 'End'],
    ['south', 'j', 2, 'ArrowDown'], ['southeast', 'n', 3, 'PageDown']
];

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<main id="normal"><div id="left_column"><canvas id="dungeon" width="640" height="480"></canvas></div></main>'
            + '<div id="ui-stack"></div><input class="text" id="chat_input"><textarea id="draft"></textarea>'
            + '<div contenteditable="true" id="editor">Draft</div><button id="outside">Dungeon focus</button>'
            + '<dialog id="modal"><button>Close</button></dialog>');
        await page.addStyleTag({ content: '#left_column { position: relative; width: 640px; height: 480px; } body { background: black; }' });
        await page.addStyleTag({ path: path.join(overlay, 'game_data/static/styles/direction-pad.css') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = []; window.qaSession = { watching: false, party_member_active: false };
            window.qaUiState = 0;
            window.modules = { jquery: window.jQuery,
                client: { is_watching: () => window.qaSession.watching }, chat: { focus() {} },
                './game-context': { get_ui_state: () => window.qaUiState } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.crawl_party = { state: { snapshot_version: 2, controlled_slot: 0, active_slot: 0,
                members: [{ slot: 0, alive: true }] } };
        });
        for (const [name, file] of [
            ['comm', 'static/scripts/comm.js'], ['spell-cost', 'static/scripts/spell-cost.js'],
            ['./frame-update', 'game_data/static/frame-update.js'],
            ['key_conversion', 'static/scripts/key_conversion.js'], ['client-input', 'static/scripts/client-input.js'],
            ['./enums', 'game_data/static/enums.js'], ['./party-model', 'game_data/static/party-model.js'],
            ['./workflow-actions', 'game_data/static/workflow-actions.js'], ['./route-plan', 'game_data/static/route-plan.js'],
            ['./direction-pad', 'game_data/static/direction-pad.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(name === './direction-pad' ? overlay : root, file) });
        }
        await page.evaluate(() => {
            const modules = window.modules, $ = window.jQuery;
            window.socket = { readyState: 1, send: payload => window.qaPackets.push(JSON.parse(payload)) };
            modules.key_conversion.enable_code_conversion();
            window.qaUiState = modules['./enums'].ui.NORMAL;
            const input = modules['client-input']({ in_game: () => true }, window.qaSession);
            $(document).on('keydown.client', input.handle_keydown).on('keypress.client', input.handle_keypress);
            $(document).trigger('game_input_changed', modules['./enums'].mouse_mode.COMMAND);
            modules['./direction-pad'].init();
            modules['./direction-pad'].init();
        });
        await page.clock.install();
        const active = () => page.locator('#direction_pad .is-activated').evaluateAll(nodes => nodes.map(node => node.dataset.direction));
        const packets = () => page.evaluate(() => window.qaPackets.splice(0));
        const clear = () => page.clock.runFor(200);
        assert.equal(await page.locator('#direction_pad button').count(), 8);
        assert.equal(await page.locator('.direction-pad-center').innerText(), '');
        assert.equal(await page.locator('.direction-pad-legend').count(), 0);
        for (const [name, letter, numpad, navigation] of directions) {
            const button = page.locator('[data-direction="' + name + '"]');
            assert.deepEqual(await button.locator('kbd').allTextContents(), [letter, String(numpad)]);
            await button.click();
            assert.deepEqual(await packets(), [{ msg: 'key', keycode: -1000 - numpad }]);
            assert.deepEqual(await active(), [name], 'Pointer activates only the matching direction');
            await clear();
            for (const key of [letter, 'Numpad' + numpad, navigation]) {
                await page.locator('#outside').focus();
                await page.keyboard.press(key);
                assert.equal((await packets()).length, 1, key + ' sends one native command');
                assert.deepEqual(await active(), [name], key + ' activates the matching direction');
                await clear(); assert.deepEqual(await active(), [], 'Feedback clears automatically');
            }
        }
        const north = page.locator('[data-direction="north"]');
        for (const key of ['Enter', 'Space']) {
            await north.focus(); await page.keyboard.press(key);
            assert.deepEqual(await packets(), [{ msg: 'key', keycode: -1008 }]);
            assert.deepEqual(await active(), ['north']); await clear();
        }
        await page.locator('#outside').focus();
        await page.keyboard.press('k'); await page.clock.runFor(120);
        await page.keyboard.press('k'); await page.clock.runFor(100);
        assert.deepEqual(await active(), ['north'], 'Repeated activation restarts the full feedback interval');
        await page.clock.runFor(80); assert.deepEqual(await active(), []);
        await page.keyboard.press('k'); await page.keyboard.press('j');
        assert.deepEqual(await active(), ['south'], 'A new direction replaces the old highlight');
        await clear(); await packets();
        for (const key of ['1', 'Shift+k', 'Control+k', 'Alt+k', 'Meta+k']) {
            await page.keyboard.press(key); assert.deepEqual(await active(), [], key + ' is not ordinary movement');
        }
        for (const id of ['chat_input', 'draft', 'editor']) {
            await page.locator('#' + id).focus(); await page.keyboard.press('k');
            assert.deepEqual(await active(), [], 'Editing does not flash movement');
        }
        await page.locator('#outside').focus();
        for (const state of ['menu', 'dialog', 'targeting', 'spectator', 'downed', 'queue']) {
            await page.evaluate(state => {
                const $ = window.jQuery, enums = window.modules['./enums'], party = window.crawl_party.state;
                if (state === 'menu') $('#ui-stack').append('<div id="qa_menu"></div>');
                if (state === 'dialog') document.getElementById('modal').showModal();
                if (state === 'targeting') $(document).trigger('game_input_changed', enums.mouse_mode.TARGET);
                if (state === 'spectator') window.qaSession.watching = true;
                if (state === 'downed') party.members[0].alive = false;
                if (state === 'queue') Object.assign(party, { combat_locked: true, active_slot: 1 });
            }, state);
            await page.keyboard.press('k');
            assert.deepEqual(await active(), [], state + ' does not flash movement');
            await page.evaluate(() => {
                document.getElementById('qa_menu')?.remove(); document.getElementById('modal').close();
                window.qaSession.watching = false;
                Object.assign(window.crawl_party.state, { combat_locked: false, active_slot: 0 });
                window.crawl_party.state.members[0].alive = true;
                window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
            });
        }
        await page.clock.runFor(32);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await north.click(); assert.deepEqual(await active(), ['north']);
        await page.mouse.move(0, 0);
        await page.locator('#direction_pad').screenshot({ path: '/tmp/dcss-direction-pad-active.png' });
        await clear(); assert.deepEqual(await active(), []);
        await page.locator('#direction_pad').screenshot({ path: '/tmp/dcss-direction-pad-compact.png' });
        await north.click();
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        await clear(); assert.equal(await page.locator('#direction_pad').count(), 0);
        assert.deepEqual(errors, []);
        console.log('Eight directions: pointer, letters, numpad, navigation, Enter/Space, repeat timing, guards, reduced motion and cleanup passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
