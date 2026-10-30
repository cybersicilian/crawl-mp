/* Browser contracts for personal inspection while initiative or a peer is busy. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><body><div id="normal"><div id="dcss_quick_dock">'
            + ['i', 'm', 'A', '%', 'z', 'a'].map(key => `<button class="dcss-dock-btn" data-dock-key="${key}">${key}</button>`).join('')
            + '</div><div id="party_turn_banner"><span class="party-banner-label"></span></div>'
            + '<div id="message_pane"><div id="messages_container" style="height:100px;overflow:auto">'
            + '<div id="messages" style="line-height:20px"></div></div><div id="more"></div></div></div>'
            + '<div id="ui-stack"></div><canvas id="minimap" width="100" height="100"></canvas>'
            + '<canvas id="minimap_overlay" width="100" height="100"></canvas>'
            + '<dialog id="party_inspector_modal"><div id="party_insp_body"></div><button id="inspect_item">Inspect</button></dialog>'
            + '<dialog id="power_picker_dialog"><button>Close</button></dialog>'
            + '<input id="draft"><div id="chat"><input id="chat_input"></div></body>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.packets = []; window.handlers = {}; window.views = [];
            window.modules = { jquery: window.jQuery, require: { toUrl: () => 'data:text/css,' },
                client: { is_watching: () => false },
                comm: { send_message(msg, fields) { window.packets.push({ msg, ...fields }); },
                    register_handlers(handlers) { Object.assign(window.handlers, handlers); } },
                'spell-cost': { reason: () => '' },
                'rich-text': { render: text => { const span = document.createElement('span'); span.textContent = text; return span.innerHTML; } },
                './minimap': { fit_to() {}, update_overlay() {} },
                './power-picker': { open(kind) { window.views.push(kind); document.getElementById('power_picker_dialog').showModal(); } },
                './textinput': { input_active: () => false }, './util': { formatted_string_to_html: text => text },
                './options': { add_listener() {} }, './nested-tips': { linkify() {} }, './message-references': {} };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.hero = { slot: 0, name: 'Reader', alive: true, can_act: false, inventory: [],
                spells_known: true, abilities_known: true, spells: [{ id: 1 }], abilities: [{ id: 2 }] };
            window.crawl_party = { state: { snapshot_version: 2, multiplayer: true,
                combat_locked: true, inventory_use: true, controlled_slot: 0, active_slot: 1, members: [window.hero] },
                open_inspector(slot, section) {
                    window.views.push({ slot, section }); document.getElementById('party_inspector_modal').showModal();
                } };
        });
        for (const [name, file] of [
            ['scrollback', 'static/scripts/scrollback.js'],
            ['./party-model', 'game_data/static/party-model.js'], ['./enums', 'game_data/static/enums.js'],
            ['./frame-update', 'game_data/static/frame-update.js'],
            ['./inspection-dialog', 'game_data/static/inspection-dialog.js'],
            ['./workflow-actions', 'game_data/static/workflow-actions.js'],
            ['./gameplay-controls', 'game_data/static/gameplay-controls.js'],
            ['./messages', 'game_data/static/messages.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.modules['./gameplay-controls'].init();
            window.jQuery(document).trigger('game_init');
            // Any keys reaching this listener would enter native gameplay.
            window.jQuery(document).on('keydown.probe keypress.probe', event => window.packets.push({ key: event.key }));
        });
        for (const ready of [true, false]) {
            await page.evaluate(ready => window.jQuery(document).trigger('game_input_changed',
                ready ? window.modules['./enums'].mouse_mode.COMMAND : -1), ready);
            for (const [key, section] of [['i', 'equipment'], ['m', 'skills'], ['A', 'mutations'], ['%', 'overview'], ['I', 'abilities']]) {
                await page.evaluate(() => document.activeElement.blur());
                await page.keyboard.press(key);
                assert.deepEqual(await page.evaluate(() => window.views.at(-1)), { slot: 0, section });
                await page.evaluate(() => document.getElementById('party_inspector_modal').close());
            }
            for (const key of ['z', 'a']) {
                await page.locator(`[data-dock-key="${key}"]`).click();
                assert.equal(await page.evaluate(() => window.views.at(-1)), key === 'z' ? 'spell' : 'ability');
                await page.evaluate(() => document.getElementById('power_picker_dialog').close());
            }
            assert.deepEqual(await page.evaluate(() => window.packets), [], 'Inspection sends no game input');
            assert.match(await page.evaluate(() => window.modules['./workflow-actions'].reason(window.hero)), /combat queue/);
            await page.evaluate(() => window.modules['./workflow-actions'].itemAction(window.hero, { slot: 2 }, false));
            assert.deepEqual(await page.evaluate(() => window.packets), [], 'Using an item remains gated');
        }
        await page.locator('[data-dock-key="i"]').click();
        await page.evaluate(() => {
            document.getElementById('inspect_item').onclick = () => window.modules['./workflow-actions'].describe(window.hero,
                { slot: 2, name: 'A known item', description: 'Readable while recovering.' });
        });
        await page.locator('#inspect_item').click();
        assert.equal(await page.locator('#inspection_body').innerText(), 'Readable while recovering.');
        await page.keyboard.press('Escape');
        assert(await page.locator('#party_inspector_modal').evaluate(node => node.open));
        assert(await page.locator('#inspect_item').evaluate(node => node === document.activeElement));
        await page.evaluate(() => document.getElementById('party_inspector_modal').close());

        await page.locator('#workflow_map_btn').click();
        assert.equal(await page.locator('#inspection_heading').innerText(), 'Level map');
        assert.equal(await page.locator('.inspection-map').count(), 1);
        await page.keyboard.press('Escape');
        assert.deepEqual(await page.evaluate(() => window.packets), []);

        await page.evaluate(() => window.handlers.msgs({ messages: Array.from({ length: 80 }, (_, i) => ({ text: 'Line ' + i })) }));
        const log = page.locator('#messages_container');
        assert(await log.evaluate(node => node.scrollTop + node.clientHeight >= node.scrollHeight - 2));
        await log.evaluate(node => { node.scrollTop = 400; });
        const position = await log.evaluate(node => node.scrollTop);
        await page.evaluate(() => window.handlers.msgs({ messages: [{ text: 'New turn' }] }));
        assert.equal(await log.evaluate(node => node.scrollTop), position, 'New turns preserve the reading position');
        await log.focus();
        await page.keyboard.press('PageUp');
        assert.deepEqual(await page.evaluate(() => window.packets), [], 'Scrolling the log cannot move a hero');
        // Chrome animates keyboard scrolling. Finish that gesture before the
        // independent pruning probe assigns a precise reading position.
        await page.waitForTimeout(400);
        await log.evaluate(node => { node.scrollTop = 1000; });
        const anchor = await page.evaluate(() => {
            const position = window.modules.scrollback.capture(document.getElementById('messages_container'),
                document.querySelectorAll('.game_message'));
            return { text: position.anchor.textContent, offset: position.offset };
        });
        await page.evaluate(() => window.handlers.msgs({ messages: Array.from({ length: 450 }, (_, i) => ({ text: 'More ' + i })) }));
        assert.equal(await page.locator('.game_message').count(), 500, 'Scrollback stays bounded');
        const offset = await page.evaluate(text => {
            const entry = [...document.querySelectorAll('.game_message')].find(node => node.textContent === text);
            return entry.getBoundingClientRect().top - document.getElementById('messages_container').getBoundingClientRect().top;
        }, anchor.text);
        assert(Math.abs(offset - anchor.offset) <= 1,
            `Pruning retains the visible entry within browser pixel rounding (${anchor.offset} → ${offset})`);
        await page.evaluate(() => { document.activeElement.blur(); window.packets = []; });
        await page.keyboard.press('Control+p');
        assert.equal(await page.locator('#inspection_heading').innerText(), 'Message history');
        assert.equal(await page.locator('#inspection_body p').count(), 500);
        await page.keyboard.press('Escape');
        await page.locator('#draft').fill('');
        await page.locator('#draft').press('i');
        assert.equal(await page.locator('#draft').inputValue(), 'i', 'Typing retains native text editing');
        assert.equal(await page.locator('dialog[open]').count(), 0);
        await page.evaluate(() => {
            document.activeElement.blur(); window.packets = []; window.hero.can_act = true;
            window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
        });
        await page.keyboard.press('i');
        assert((await page.evaluate(() => window.packets)).some(packet => packet.key === 'i'), 'On-turn inventory retains its native path');
        assert.equal(await page.locator('dialog[open]').count(), 0);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, offTurnWindows: true, busyWindows: true,
            actionGates: true, logScrollback: 500, personalMap: true, description: true }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
