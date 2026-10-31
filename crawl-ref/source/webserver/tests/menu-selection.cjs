/* Native Menu packets must distinguish confirmation from row selection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<main id="game"><div id="ui-stack"><div class="ui-popup-outer">'
            + '<div class="ui-popup-inner"></div></div></div></main>'
            + fs.readFileSync(path.join(root, 'game_data/templates/popup-templates.html'), 'utf8'));
        for (const file of ['styles/game-menus.css', 'styles/gameplay-workflows.css', 'styles/menu-surfaces.css', 'styles/menu-polish.css', 'styles/menu-columns.css'])
            await page.addStyleTag({ path: path.join(root, 'game_data/static', file) });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = []; window.qaHandlers = {}; window.qaCapture = true;
            const $ = window.jQuery;
            window.modules = {
                jquery: $, comm: {
                    send_message(msg, data) { window.qaPackets.push({ msg, ...data }); },
                    register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }
                },
                client: { is_watching: () => Boolean(window.qaWatching) }, './cell_renderer': {},
                './options': { get: key => key === 'tile_display_mode' ? 'tiles' : false, add_listener() {} },
                './scroller': element => ({ scrollElement: element }),
                './ui': {
                    show_popup(element) { $('#ui-stack .ui-popup-inner').append(element.addClass('workflow-surface')); },
                    hide_popup() { $('#ui-stack .ui-popup-inner').children().last().remove(); },
                    top_popup() { return $('#ui-stack .ui-popup-inner').children().last(); }
                }
            };
            window.define = (dependencies, factory) => {
                if (typeof dependencies === 'function') { factory = dependencies; dependencies = []; }
                window.modules[window.qaModule] = factory(...dependencies.map(name => window.modules[name]));
            };
            document.addEventListener('keydown', event => {
                if (window.qaCapture) window.modules['./menu-keyboard'].handle(
                    window.modules['./ui'].top_popup()[0], event);
            }, true);
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const name of ['util', 'enums', 'menu-keyboard', 'menu-columns', 'menu-search', 'menu-actions', 'menu-presentation', 'context-menu', 'menu-items', 'menu-navigation', 'menu-selection-controls', 'menu']) {
            await page.evaluate(name => { window.qaModule = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        const open = async (multiple, arrows = true) => {
            await page.evaluate(({ multiple, arrows }) => {
                const flags = window.modules['./enums'].menu_flag;
                window.qaHandlers.menu({ tag: multiple ? 'pickup' : 'inventory', type: 'menu',
                    flags: (multiple ? flags.MULTISELECT : flags.SINGLESELECT) | (arrows ? flags.ARROWS_SELECT : 0),
                    title: { text: multiple ? 'Pick up what? 3/52 gear slots (_ for help)' : 'Inventory' },
                    more: '', alt_more: '', total_items: 2, chunk_start: 0, last_hovered: 0,
                    items: [{ level: 2, text: 'a + 3 potions of curing', hotkeys: [97], q: 3, selected_qty: 3,
                        label: '3 potions of curing', letter: 'a' },
                        { level: 2, text: 'b - a scroll of teleportation', hotkeys: [98], q: 1, selected_qty: 0,
                            label: 'a scroll of teleportation', letter: 'b' }] });
            }, { multiple, arrows });
            await page.locator('#ui-stack li.selectable').first().focus();
            await page.evaluate(() => window.qaHandlers.update_menu_items({ chunk_start: 0,
                items: [{ level: 2, text: 'a # 2 potions of curing', hotkeys: [97], q: 3, selected_qty: 2 }] }));
            assert(await page.locator('#ui-stack li.selectable').first().evaluate(element => element === document.activeElement),
                'Native selection updates preserve row focus');
            await page.evaluate(() => { window.qaPackets = []; });
        };
        const packets = () => page.evaluate(() => window.qaPackets.filter(packet => packet.msg === 'key'));
        const close = () => page.evaluate(() => window.qaHandlers.close_menu());
        await open(true);
        const rows = page.locator('#ui-stack li.selectable');
        assert.equal(await page.locator('.menu_title').innerText(), 'Pick up what?');
        assert.equal(await page.locator('.workflow-menu-caption > span').innerText(), '3/52 gear slots');
        await page.getByRole('button', { name: 'Inventory help', exact: true }).click();
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 95 }], 'Visible Help preserves the native command');
        await page.evaluate(() => { window.qaPackets = []; });
        assert.equal(await rows.first().getAttribute('aria-pressed'), 'true');
        assert.equal(await rows.last().getAttribute('aria-pressed'), 'false');
        assert.equal(await rows.first().locator('.workflow-selection-mark').innerText(), '✓');
        assert.equal(await rows.first().locator('.workflow-selection-state').innerText(), '2 of 3 selected');
        const summary = page.locator('.workflow-selection-summary');
        const confirm = page.locator('.workflow-selection-tools button');
        assert.equal(await summary.innerText(), '2 items in 1 stack selected');
        await confirm.click();
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 13 }], 'Pointer confirmation sends native Enter once');
        await page.evaluate(() => { window.qaPackets = []; });
        if (process.env.MENU_SELECTION_PROOF_DIR) {
            fs.mkdirSync(process.env.MENU_SELECTION_PROOF_DIR, { recursive: true });
            await page.locator('.menu_pickup').screenshot({
                path: path.join(process.env.MENU_SELECTION_PROOF_DIR, 'selected-rows.png') });
        }
        for (const width of [390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            assert(await rows.first().evaluate(element => element.scrollWidth <= element.clientWidth + 1),
                'Selected quantities fit inside the row at ' + width);
            assert(await rows.first().locator('.workflow-selection-state').isVisible());
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        // Focus and hover can move without concealing the pending selection.
        await rows.last().focus(); await rows.last().hover();
        const colour = row => row.evaluate(element => getComputedStyle(element).backgroundColor);
        await page.waitForFunction(() => ['rgb(217, 229, 198)', 'rgb(204, 221, 177)']
            .includes(getComputedStyle(document.querySelector('.workflow-selected')).backgroundColor));
        assert.notEqual(await colour(rows.first()), await colour(rows.last()));
        await page.evaluate(() => window.qaHandlers.update_menu_items({ chunk_start: 0, items: [
            { level: 2, text: 'a + 3 potions of curing', hotkeys: [97], selected_qty: 3 },
            { level: 2, text: 'b + a scroll of teleportation', hotkeys: [98], selected_qty: 1 }
        ] }));
        assert.equal(await page.getByRole('button', { pressed: true }).count(), 2);
        assert.equal(await rows.first().locator('.workflow-selection-state').innerText(), 'Selected');
        assert.equal(await summary.innerText(), '4 items in 2 stacks selected');
        // A later packet clears state, including after repeated native redraws.
        await page.evaluate(() => window.qaHandlers.update_menu_items({ chunk_start: 0, items: [
            { level: 2, text: 'a - 3 potions of curing', hotkeys: [97], selected_qty: 0 }
        ] }));
        assert.equal(await rows.first().getAttribute('aria-pressed'), 'false');
        assert.equal(await rows.first().locator('.workflow-selection-state').count(), 0);
        assert.equal(await rows.first().locator('.workflow-selection-mark').count(), 1);
        assert.equal(await rows.first().locator('.workflow-key').innerText(), 'a');
        assert.equal(await rows.first().evaluate(element => element.classList.contains('workflow-selected')), false);
        assert.equal(await summary.innerText(), '1 item in 1 stack selected');
        await close();
        await open(false);
        assert.equal(await rows.first().getAttribute('aria-pressed'), null);
        assert.equal(await rows.first().locator('.workflow-selection-mark').count(), 0);
        assert.equal(await page.locator('.workflow-selection-tools').count(), 0);
        await close();
        await page.evaluate(() => {
            const flags = window.modules['./enums'].menu_flag;
            window.qaHandlers.menu({ tag: 'quiet', type: 'menu', flags: flags.MULTISELECT | flags.QUIET_SELECT,
                title: { text: 'Quiet selection' }, more: '', alt_more: '', total_items: 1, chunk_start: 0, last_hovered: 0,
                items: [{ level: 2, text: 'a - A choice', hotkeys: [97], selected_qty: 1 }] });
        });
        assert.equal(await rows.first().getAttribute('aria-pressed'), null);
        assert.equal(await rows.first().locator('.workflow-selection-mark').count(), 0);
        assert.equal(await page.locator('.workflow-selection-tools').count(), 0);
        await close();
        await page.evaluate(() => {
            window.qaHandlers.menu({ tag: 'pickup', type: 'menu', flags: window.modules['./enums'].menu_flag.MULTISELECT,
                title: { text: 'Pick up what?' }, more: '', alt_more: '', total_items: 2, chunk_start: 0, last_hovered: 0,
                items: [{ level: 2, text: 'a - Potion', hotkeys: [97], selected_qty: 0 }] });
        });
        assert.equal(await summary.innerText(), 'Selection still loading…', 'Unloaded quantities are not treated as zero');
        assert(await confirm.isEnabled());
        await page.evaluate(() => window.qaHandlers.update_menu_items({ chunk_start: 1,
            items: [{ level: 2, text: 'b - Scroll', hotkeys: [98], selected_qty: 0 }] }));
        assert.equal(await summary.innerText(), 'Nothing selected');
        assert(await confirm.isDisabled());
        await page.evaluate(() => {
            window.qaWatching = true;
            window.qaHandlers.update_menu_items({ chunk_start: 0,
                items: [{ level: 2, text: 'a + Potion', hotkeys: [97], selected_qty: 1 }] });
        });
        assert.equal(await summary.innerText(), '1 item in 1 stack selected');
        assert(await confirm.isDisabled(), 'Spectators can read selection without confirming it');
        await page.evaluate(() => { window.qaWatching = false; });
        await close();
        // Stores send both a plain inventory label and richer native row text.
        // Rendering the label alone used to discard the price and stock details.
        await page.evaluate(() => {
            const flags = window.modules['./enums'].menu_flag;
            window.qaHandlers.menu({ tag: 'shop', type: 'menu', flags: flags.MULTISELECT | flags.QUIET_SELECT,
                title: { text: "Welcome to Jaed's Distillery! What would you like to do?" },
                more: 'You have 106 gold pieces.', alt_more: '', total_items: 3, chunk_start: 0, last_hovered: 0,
                items: [
                    { level: 2, text: ' <lightgreen>a - </lightgreen><lightgrey>  32 gold   potion of curing (owned: 2)</lightgrey>',
                        label: 'potion of curing', letter: 'a', hotkeys: [97], selected_qty: 0 },
                    { level: 2, text: ' <red>b - </red><yellow>12345 gold   the extraordinarily long-named legendary sword of testing (unknown)</yellow>',
                        label: 'the extraordinarily long-named legendary sword of testing', letter: 'b', hotkeys: [98], selected_qty: 0 },
                    { level: 2, text: ' <lightcyan>c $ </lightcyan><lightgrey>  96 gold   3 potions of might</lightgrey>',
                        label: '3 potions of might', letter: 'c', hotkeys: [99], q: 3, selected_qty: 0 }
                ] });
        });
        const prices = page.locator('.menu_shop .workflow-table-stats');
        assert.deepEqual(await prices.allTextContents(), ['Price: 32 gold', 'Price: 12345 gold', 'Price: 96 gold']);
        assert.match(await rows.first().locator('.workflow-table-name').innerText(), /\(owned: 2\)/);
        assert.match(await rows.nth(1).locator('.workflow-table-name').innerText(), /\(unknown\)/);
        assert.equal(await rows.nth(1).locator('.workflow-table-name .fg14').count(), 1, 'Native item colours survive');
        assert.equal(await rows.last().locator('.workflow-state').innerText(), 'Shopping list');
        assert.deepEqual(await rows.locator('kbd').allTextContents(), ['a', 'b', 'c']);
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.locator('.workflow-table-head').isVisible(), width > 700);
            for (const row of await rows.all()) {
                assert(await row.evaluate(element => element.scrollWidth <= element.clientWidth + 1),
                    'Shop names and prices fit at ' + width);
            }
            assert(await prices.first().isVisible(), 'Price stays visible at ' + width);
        }
        await rows.first().focus();
        await page.evaluate(() => window.qaHandlers.update_menu_items({ chunk_start: 0, items: [
            { level: 2, text: ' <lightgreen>a + </lightgreen><lightgrey>  32 gold   potion of curing (owned: 2)</lightgrey>',
                hotkeys: [97], selected_qty: 1 }
        ] }));
        assert(await rows.first().evaluate(element => element === document.activeElement), 'Shop updates preserve focus');
        assert.equal(await rows.first().locator('.workflow-state').innerText(), 'Selected');
        assert.equal(await prices.first().innerText(), 'Price: 32 gold');
        assert.equal(await rows.first().locator('kbd').count(), 1);
        await page.evaluate(() => { window.qaPackets = []; });
        await page.keyboard.press('Enter');
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 13 }], 'Store Enter still confirms marked purchases');
        await page.evaluate(() => window.qaHandlers.update_menu_items({ chunk_start: 0, items: [
            { level: 2, text: ' <lightgreen>a - </lightgreen><lightgrey>  32 gold   potion of curing (owned: 2)</lightgrey>',
                hotkeys: [97], selected_qty: 0 }
        ] }));
        assert.equal(await rows.first().locator('.workflow-state').count(), 0);
        assert.equal(await prices.first().innerText(), 'Price: 32 gold');
        if (process.env.MENU_SELECTION_PROOF_DIR) {
            for (const width of [1280, 320]) {
                await page.setViewportSize({ width, height: 800 });
                await page.locator('.menu_shop').screenshot({
                    path: path.join(process.env.MENU_SELECTION_PROOF_DIR, 'shop-prices-' + width + '.png') });
            }
        }
        await page.evaluate(() => window.qaHandlers.update_menu_items({ chunk_start: 0, items: [
            { level: 2, text: 'a - Unrecognized stock format: 42 gold', hotkeys: [97], selected_qty: 0 }
        ] }));
        assert.match(await rows.first().innerText(), /Unrecognized stock format: 42 gold/,
            'Unknown shop grammar keeps native text instead of falling back to a price-free inventory label');
        assert.equal(await rows.first().evaluate(element => element.classList.contains('workflow-table-row')), false);
        await close();
        await page.setViewportSize({ width: 1280, height: 800 });
        // Exercise both the shared popup capture and the row's own fallback.
        for (const capture of [true, false]) {
            await page.evaluate(value => { window.qaCapture = value; }, capture);
            for (const arrows of [true, false]) {
                await open(true, arrows);
                await page.keyboard.press('Enter');
                assert.deepEqual(await packets(), [{ msg: 'key', keycode: 13 }],
                    'Enter confirms selected pickup quantities; it must not toggle the focused row');
                await close();
                for (const key of ['Shift+Enter', 'Control+Enter', 'Alt+Enter', 'Shift+Space', 'Shift+ArrowDown']) {
                    await open(true, arrows);
                    await page.keyboard.press(key);
                    assert.deepEqual(await packets(), [], 'Modified keys stay available to native translation: ' + key);
                    await close();
                }
                await open(true, arrows);
                await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
                assert.deepEqual(await packets(), [{ msg: 'key', keycode: 13 }], 'Held Enter confirms once');
                await close();
                await open(true, arrows);
                await page.keyboard.press('Space');
                assert.deepEqual(await packets(), [{ msg: 'key', keycode: arrows ? 32 : 97 }],
                    'Space keeps selecting the focused row');
                await close();
                await open(true, arrows);
                await page.locator('#ui-stack li.selectable').first().click();
                assert.deepEqual(await packets(), [{ msg: 'key', keycode: arrows ? 32 : 97 }],
                    'Pointer selection keeps its native toggle behavior');
                await close();
                for (const key of ['Enter', 'Space']) {
                    await open(false, arrows);
                    await page.keyboard.press(key);
                    assert.deepEqual(await packets(), [{ msg: 'key', keycode: arrows ? 13 : 97 }],
                        'Single selection still activates the focused item once');
                    await close();
                }
            }
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, captureAndFallback: true, nativeArrowAndLetterMenus: true,
            visibleSelection: true, partialQuantities: true, deselection: true, quietMenus: true, shopPrices: true }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
