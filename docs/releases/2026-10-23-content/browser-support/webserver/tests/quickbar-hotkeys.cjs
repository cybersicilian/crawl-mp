/* Real browser keys through the quickbar, action gates and native input translator. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const inventorySlots = [52, 1, 2, 126, 4, 5, 6, 7, 8, 9];

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('http://quickbar.test/**', route => route.fulfill({ contentType: 'text/html', body:
            '<!doctype html><html><body><main id="normal"><div id="dcss_quick_dock">'
            + '<span class="workflow-action-group" data-action-group="character">'
            + '<button class="dcss-dock-btn" id="qa_inventory" data-dock-key="i" aria-label="Inventory">Inventory</button></span>'
            + '<span class="workflow-action-group" data-action-group="expedition">'
            + '<button class="dcss-dock-btn" id="qa_hidden" hidden>Private action</button>'
            + '<details class="workflow-expedition-details"><summary>Expedition</summary><div class="hud-expedition-menu">'
            + '<a href="#records">Game record</a></div></details></span></div></main>'
            + '<div id="ui-stack"></div><input id="chat_input" class="text">'
            + '<textarea id="draft" class="text"></textarea><select id="choice" class="text"><option>1</option></select>'
            + '<div id="editor" class="text" contenteditable="true"><span id="editor_child">Draft</span></div>'
            + '<div id="chat"><button id="chat_button">Chat</button></div>'
            + '<button id="outside">Dungeon focus</button><dialog id="modal"><button>Dialog</button></dialog>'
            + '</body></html>' }));
        await page.goto('http://quickbar.test/');
        await page.addStyleTag({ path: path.join(root, 'game_data/static/styles/quickbar.css') });
        await page.addStyleTag({ content: '#normal { padding-top: 400px; }' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(async inventorySlots => {
            window.qaPackets = []; window.qaHandlers = {};
            window.qaSession = { watching: false, party_member_active: false };
            window.modules = {
                jquery: window.jQuery,
                comm: {
                    send_message(msg, fields) { window.qaPackets.push({ msg, ...fields }); },
                    register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }
                },
                client: { is_watching: () => window.qaSession.watching }, chat: { focus() {} },
                './hud-inventory': { itemIcon: () => 'item', drawTile: (canvas, entry, hero) => {
                    const item = hero.equipment_profile.items.find(item => item.inv_slot === entry.slot);
                    return window.modules['./native-tile-art'].draw(canvas, item?.art);
                }, artState: hero => hero.equipment_profile },
                './status-icons': { icon: () => document.createElement('span') },
                './party-power-cards': { attach() {} },
                './power-art': { create: () => document.createElement('span') }
            };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            const hero = { slot: 0, player_id: 'quickbar-test-hero', alive: true, hp: 20, mp: 10, xl: 1,
                inventory: inventorySlots.map((slot, index) => ({ slot, name: 'Test item ' + index, kind_name: 'Potions',
                    letter: String.fromCharCode(97 + index), qty: 2 })),
                spells: [{ id: 41, name: 'Magic Dart', letter: 'a', mp_cost: 1, level: 1 }],
                abilities: [{ id: 17, name: 'Blink', hotkey: 'b' }] };
            const source = document.createElement('canvas'); source.width = source.height = 32;
            source.getContext('2d').fillStyle = '#a1b23c'; source.getContext('2d').fillRect(0, 0, 32, 32);
            const atlas = document.createElement('img'); atlas.id = 'main'; atlas.src = source.toDataURL();
            atlas.hidden = true; document.body.append(atlas); await atlas.decode();
            hero.equipment_profile = { items: hero.inventory.map(item => ({ inv_slot: item.slot,
                art: { texture: 'main', layers: [{ sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, ymax: 32 }] } })) };
            window.crawl_party = { state: { snapshot_version: 2, inventory_use: true,
                controlled_slot: 0, active_slot: 0, members: [hero, { ...structuredClone(hero), slot: 1,
                    player_id: 'quickbar-second-hero' }] } };
            window.qaBindings = hero.inventory.map(item => ({ kind: 'item', id: item.slot }));
            window.qaBindings[1] = { kind: 'spell', id: 41 };
            window.qaBindings[2] = { kind: 'ability', id: 17 };
            localStorage.setItem('dcss.quickbar.v1.' + hero.player_id, JSON.stringify(window.qaBindings.slice(0, 8)));
        }, inventorySlots);
        for (const [name, file] of [
            ['./frame-update', 'game_data/static/frame-update.js'],
            ['spell-cost', 'static/scripts/spell-cost.js'],
            ['key_conversion', 'static/scripts/key_conversion.js'],
            ['client-input', 'static/scripts/client-input.js'],
            ['./enums', 'game_data/static/enums.js'],
            ['./party-model', 'game_data/static/party-model.js'],
            ['./menu-keyboard', 'game_data/static/menu-keyboard.js'],
            ['./workflow-actions', 'game_data/static/workflow-actions.js'],
            ['./context-menu', 'game_data/static/context-menu.js'],
            ['./party-skill-training', 'game_data/static/party-skill-training.js'],
            ['./item-context-menu', 'game_data/static/item-context-menu.js'],
            ['./native-tile-art', 'game_data/static/native-tile-art.js'],
            ['./quickbar-model', 'game_data/static/quickbar-model.js'],
            ['./quickbar-commands', 'game_data/static/quickbar-commands.js'],
            ['./quickbar', 'game_data/static/quickbar.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            const modules = window.modules, $ = window.jQuery;
            modules.key_conversion.enable_code_conversion();
            const input = modules['client-input']({ in_game: () => true }, window.qaSession);
            $(document).on('keydown.client', input.handle_keydown).on('keypress.client', input.handle_keypress);
            $(document).on('click.qaInventory', '#qa_inventory', () => modules.comm.send_message('key', { keycode: 105 }));
            $(document).trigger('game_input_changed', modules['./enums'].mouse_mode.COMMAND);
            modules['./quickbar'].init(); modules['./quickbar'].init();
        });
        const packets = () => page.evaluate(() => { const result = window.qaPackets; window.qaPackets = []; return result; });
        const press = async key => {
            await page.locator('#outside').focus(); await packets();
            await page.keyboard.press(key); return packets();
        };
        const mode = command => page.evaluate(command => window.jQuery(document).trigger('game_input_changed',
            command ? window.modules['./enums'].mouse_mode.COMMAND : window.modules['./enums'].mouse_mode.TARGET), command);
        const openCommands = async query => {
            await page.evaluate(() => { document.getElementById('quickbar_more').open = true; });
            await page.locator('[data-quick-category="command"]').click();
            await page.locator('#quickbar_search').fill(query);
        };
        assert.equal(await page.locator('[data-quick-category]').count(), 4);
        const commandCodes = { find: 6, shopping: 36, travel: 71, overview: 15, examine: 120,
            religion: 94, knowledge: 92, runes: 125, messages: 16, memorise: 77, help: 63 };
        for (const [id, code] of Object.entries(commandCodes)) {
            await openCommands(''); await packets();
            await page.locator('#quickbar_command_' + id).focus();
            await page.keyboard.press('Enter');
            assert.deepEqual(await packets(), [{ msg: 'key', keycode: code }], id + ' dispatches once');
            assert.equal(await page.locator('#quickbar_more').getAttribute('open'), null);
        }
        for (const query of ['shopping', '$', 'wishlist', 'cmd f', 'ctrl+f']) {
            await openCommands(query);
            const expectedId = /f$/.test(query) ? 'find' : 'shopping';
            assert(await page.locator('#quickbar_command_' + expectedId).isVisible(), query + ' finds its command');
            assert.equal(await page.locator('#quickbar_commands .dcss-dock-btn:visible').count(), 1);
        }
        await packets(); await page.locator('#quickbar_search').press('Enter');
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 6 }], 'Search Enter uses the matching command');
        assert.deepEqual(await press('Meta+f'), [{ msg: 'key', keycode: 6 }], 'Cmd+F shares the native Find route');
        assert.deepEqual(await press('Control+f'), [{ msg: 'key', keycode: 6 }], 'Ctrl+F retains its native route');
        await page.keyboard.down('Meta'); await page.keyboard.down('f'); await mode(false);
        await page.keyboard.down('f'); await page.keyboard.up('f'); await page.keyboard.up('Meta');
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 6 }], 'Held Cmd+F cannot repeat into its native prompt');
        await mode(true);
        await openCommands('inventory');
        assert(await page.locator('#qa_inventory').isVisible(), 'Existing commands participate in search');
        assert(!(await page.locator('#qa_hidden').isVisible()), 'Filtering cannot reveal a hidden control');
        await packets(); await page.locator('#quickbar_search').press('ArrowDown');
        assert(await page.locator('#qa_inventory').evaluate(button => button === document.activeElement));
        await page.keyboard.press('Space');
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 105 }]);
        await openCommands('game record');
        assert(await page.locator('.hud-expedition-menu a').isVisible(), 'Search directly reveals nested record links');
        await page.locator('#quickbar_search').fill('nothing can match this');
        assert.equal(await page.locator('.quickbar-empty').innerText(), 'No matching commands.');
        await page.locator('#quickbar_search').fill('');
        await page.locator('[data-quick-category="item"]').click();
        assert.equal(await page.locator('.workflow-expedition-details').getAttribute('open'), null, 'Category changes restore menu expansion');
        await page.locator('#quickbar_search').press('Escape');
        for (const selector of ['#chat_input', '#draft', '#choice', '#editor']) {
            await page.locator(selector).focus(); await packets(); await page.keyboard.press('Meta+f');
            assert.deepEqual(await packets(), [], 'Cmd+F leaves text editing alone');
        }
        await mode(false);
        await page.evaluate(() => { document.getElementById('quickbar_more').open = true; window.modules['./quickbar'].update(true); });
        assert(await page.locator('#quickbar_command_find').isDisabled(), 'Native prompts block palette commands');
        await page.evaluate(() => document.getElementById('quickbar_command_find').click());
        assert.deepEqual(await packets(), []);
        await page.locator('#quickbar_search').press('Escape'); await mode(true);
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 800 }); await openCommands('shopping');
            const bounds = await page.locator('#quickbar_more_content').evaluate(element => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top,
                    overflow: element.scrollWidth > element.clientWidth + 1 };
            });
            assert(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0);
            assert.equal(bounds.overflow, false, 'Search and command labels fit at ' + width);
            await page.locator('#quickbar_search').press('Escape');
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        assert.equal(await page.locator('.quickbar-key').count(), 8, 'Old eight-slot saves retain their assignments');
        for (let index = 8; index < 10; index++) {
            await page.locator('#quickbar_slot_' + index).click();
            await page.locator('#quickbar_entry_item_' + index).click();
        }
        assert.deepEqual(await page.locator('.quickbar-key').allTextContents(), Array.from('1234567890'));
        assert.equal(await page.locator('#quickbar_slot_9').getAttribute('aria-keyshortcuts'), '0');
        assert.match(await page.locator('#quickbar_slot_9').getAttribute('aria-label'), /slot 10 · key 0/);
        const expected = index => index === 1
            ? { msg: 'power_action', expected_slot: 0, id: 41, letter: 'a', kind: 'spell' }
            : index === 2 ? { msg: 'power_action', expected_slot: 0, id: 17, letter: 'b', kind: 'ability' }
                : { msg: 'inv_item_use', slot: inventorySlots[index], expected_slot: 0, expected_name: 'Test item ' + index };
        for (const [index, key] of Array.from('1234567890').entries()) {
            assert.deepEqual(await press(key), [expected(index)], key + ' activates exactly its assigned action');
        }
        await page.locator('#quickbar_slot_0').focus();
        await page.keyboard.press('2');
        assert.deepEqual(await packets(), [expected(1)], 'Shortcuts work with focus on the bar');
        await mode(false);
        await page.keyboard.press('2');
        assert.deepEqual(await packets(), [{ msg: 'input', text: '2' }], 'Using a focused slot releases focus for native targeting');
        await mode(true);
        await page.locator('#quickbar_slot_0').focus();
        await page.locator('#quickbar_slot_0').press('Enter');
        assert.deepEqual(await packets(), [expected(0)], 'Native button activation still works once');

        // A held key remains consumed if the first action enters targeting.
        await page.locator('#outside').focus();
        await page.keyboard.down('2'); await mode(false); await page.keyboard.down('2');
        await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keypress', {
            key: '2', code: 'Digit2', which: 50, charCode: 50, keyCode: 50, bubbles: true, cancelable: true
        })));
        await page.keyboard.up('2');
        assert.deepEqual(await packets(), [expected(1)], 'Holding a quick key dispatches once and never feeds targeting');
        assert.deepEqual(await press('2'), [{ msg: 'input', text: '2' }], 'Fresh targeting input stays native');
        await mode(true);

        await page.evaluate(() => { window.crawl_party.state.members[0].mp = 0; });
        assert.deepEqual(await press('2'), [], 'An unaffordable assigned spell cannot fall through into a native command');
        await page.evaluate(() => { Object.assign(window.crawl_party.state, { combat_locked: true, active_slot: 1 }); });
        assert.deepEqual(await press('5'), [], 'Waiting for a turn cannot turn an assigned action into rest');
        await page.evaluate(() => { Object.assign(window.crawl_party.state, { combat_locked: false, active_slot: 0 }); });
        const carriedArt = await page.locator('#quickbar_slot_4 canvas').evaluate(canvas => canvas.toDataURL());
        await page.evaluate(() => { window.crawl_party.state.members[0].mp = 10;
            window.crawl_party.state.members[0].inventory = [];
            window.crawl_party.state.members[0].equipment_profile.items = [];
            window.modules['./quickbar'].update(true); });
        assert.equal(await page.locator('#quickbar_slot_4').getAttribute('aria-disabled'), 'true');
        assert.match(await page.locator('#quickbar_slot_4').getAttribute('aria-label'), /Test item 4 · 0 remaining/);
        assert.match(await page.locator('#quickbar_slot_4').getAttribute('data-tip-meta'), /Out of stock/);
        assert.equal(await page.locator('#quickbar_slot_4 .quickbar-item-quantity').innerText(), '0');
        assert.equal(await page.locator('#quickbar_slot_4 canvas').evaluate(canvas => canvas.toDataURL()), carriedArt,
            'Depleted slots retain their exact native art');
        assert.equal(await page.locator('.quickbar-key').count(), 10, 'Depletion cannot hide an assignment');
        assert.deepEqual(await press('5'), [], 'A stale assigned item cannot become rest');
        await page.locator('#quickbar_slot_4').evaluate(button => button.click());
        assert.deepEqual(await packets(), [], 'A remembered item cannot send a native action');
        await page.locator('#quickbar_slot_4').click({ button: 'right', force: true });
        assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Reassign quick slot', 'Clear quick slot'],
            'Depleted items keep assignment controls without live item actions');
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_cleanup'); window.modules['./quickbar'].init();
        });
        await mode(true);
        assert.equal(await page.locator('#quickbar_slot_4 canvas').evaluate(canvas => canvas.toDataURL()), carriedArt,
            'Saved item art survives a new quickbar session while depleted');
        assert.equal(await page.locator('#quickbar_slot_4 .quickbar-item-quantity').innerText(), '0');
        await page.evaluate(() => { window.crawl_party.state.controlled_slot = 1; window.modules['./quickbar'].update(true); });
        assert.equal(await page.locator('.quickbar-key').count(), 0, 'Another hero does not inherit remembered items');
        await page.evaluate(() => { window.crawl_party.state.controlled_slot = 0; window.modules['./quickbar'].update(true); });
        assert.equal(await page.locator('#quickbar_slot_4 .quickbar-item-quantity').innerText(), '0');
        await page.evaluate(() => { window.crawl_party.state.members[0].inventory =
            structuredClone(window.crawl_party.state.members[1].inventory);
            window.crawl_party.state.members[0].equipment_profile = structuredClone(window.crawl_party.state.members[1].equipment_profile);
            window.modules['./quickbar'].update(true); });
        assert.equal(await page.locator('#quickbar_slot_4').getAttribute('aria-disabled'), 'false');
        assert.equal(await page.locator('#quickbar_slot_4 .quickbar-item-quantity').innerText(), '2');
        assert.deepEqual(await press('5'), [expected(4)], 'Replenishing restores the existing assignment automatically');

        for (const selector of ['#chat_input', '#draft', '#choice', '#editor', '#quickbar_search']) {
            if (selector === '#quickbar_search') await page.evaluate(() => { document.getElementById('quickbar_more').open = true; });
            await page.locator(selector).focus(); await packets(); await page.keyboard.press('1');
            assert.deepEqual(await packets(), [], selector + ' keeps text entry separate from game actions');
        }
        await page.locator('#quickbar_search').press('Escape');
        assert.equal(await page.locator('#chat_input').inputValue(), '1');
        await page.evaluate(() => { window.qaPrevented = document.getElementById('editor_child').dispatchEvent(
            new KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true, cancelable: true })); });
        assert(await page.evaluate(() => window.qaPrevented), 'Nested editable content retains its input');
        await page.locator('#chat_button').focus(); await page.keyboard.press('1');
        assert(!(await packets()).some(packet => packet.msg === 'inv_item_use'), 'Chat controls do not activate the bar');

        await page.evaluate(() => document.getElementById('modal').showModal());
        await page.keyboard.press('1');
        assert(!(await packets()).some(packet => packet.msg === 'inv_item_use'), 'Web dialogs keep their shortcuts');
        await page.evaluate(() => document.getElementById('modal').close());
        await page.evaluate(() => { document.getElementById('ui-stack').innerHTML = '<div class="ui-popup">Quantity prompt</div>'; });
        assert.deepEqual(await press('5'), [{ msg: 'input', text: '5' }], 'Native quantity prompts retain digits');
        await page.evaluate(() => { document.getElementById('ui-stack').innerHTML = ''; });
        for (const [key, code] of [['Numpad1', -1001], ['Numpad5', -1005], ['Control+5', null]]) {
            const result = await press(key);
            assert(!result.some(packet => ['inv_item_use', 'power_action'].includes(packet.msg)), key + ' remains native');
            if (key.startsWith('Numpad')) assert.deepEqual(result, [{ msg: 'key', keycode: code }]);
        }
        assert.deepEqual(await press('Shift+!'), [{ msg: 'input', text: '!' }]);
        assert.deepEqual(await press('Meta+1'), [], 'Browser modifier does not activate a quick action');
        await page.evaluate(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: '1', code: 'Digit1', isComposing: true, bubbles: true, cancelable: true })); });
        assert.deepEqual(await packets(), [], 'Composition never activates a quick action');

        await page.evaluate(() => { window.crawl_party.state.controlled_slot = 1; });
        assert.deepEqual(await press('1'), [{ msg: 'input', text: '1' }], 'An unassigned hero keeps the native number binding');
        await page.evaluate(() => {
            const key = 'dcss.quickbar.v1.quickbar-second-hero';
            localStorage.setItem(key, JSON.stringify([{ kind: 'ability', id: 17 }]));
            window.modules['./quickbar'].init();
        });
        // The current hero's live assignments are cached; switching refreshes identity.
        await page.evaluate(() => { window.crawl_party.state.controlled_slot = 0; window.modules['./quickbar'].update(true);
            window.crawl_party.state.controlled_slot = 1; });
        assert.deepEqual(await press('1'), [{ msg: 'power_action', expected_slot: 1, id: 17, letter: 'b', kind: 'ability' }]);
        await page.evaluate(() => { window.qaSession.watching = true; });
        assert.deepEqual(await press('1'), [], 'Spectators cannot activate assigned actions');
        await page.evaluate(() => { window.qaSession.watching = false; window.crawl_party.state.controlled_slot = 0;
            window.jQuery(document).trigger('game_cleanup'); });
        assert.deepEqual(await press('1'), [{ msg: 'input', text: '1' }], 'Cleanup detaches shortcut interception');
        await mode(true);
        await page.evaluate(() => { window.modules['./quickbar'].init(); window.modules['./quickbar'].init(); });
        assert.deepEqual(await press('0'), [expected(9)], 'Reinitialization restores saved slot ten without duplicate handlers');
        await page.locator('#quickbar_slot_4').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Reassign quick slot' }).click();
        await page.locator('#quickbar_clear').click(); await page.locator('#quickbar_search').press('Escape');
        assert.deepEqual(await press('5'), [{ msg: 'input', text: '5' }], 'Clearing a slot immediately restores its native key');
        assert.equal(await page.locator('#quickbar_slot_4').count(), 1);
        assert.equal(await page.locator('#quickbar_slot_4').getAttribute('aria-keyshortcuts'), '');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, assignedKeys: '1234567890', legacyStorage: true, consumableSlots: [52, 126],
            paletteCommands: Object.keys(commandCodes).length, paletteWidths: [1280, 768, 390, 320],
            inputIsolation: true, nativeFallback: true, heroScope: true, lifecycle: true, singleActivation: true,
            depletedAppearance: true, depletedSessionRestore: true, automaticRestock: true }));
    } catch (error) {
        await page.screenshot({ path: '/tmp/dcss-quickbar-hotkeys-failure.png' }).catch(() => {});
        console.error({ pageErrors: errors });
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
