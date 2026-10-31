/* Native per-entry actions: exact packets, focus, keyboard, spectators and geometry. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.MENU_ACTIONS_PROOF_DIR || '/tmp/dcss-menu-actions-proof';

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><main id="game"><div id="ui-stack"></div></main>'
            + fs.readFileSync(path.join(root, 'game_data/templates/popup-templates.html'), 'utf8')
            + '<style>.templates { display: none; }</style>');
        for (const file of ['game_data/static/styles/game-menus.css', 'game_data/static/styles/game-popups.css',
            'static/tabletop/tokens.css', 'static/tabletop/typography.css',
            'game_data/static/styles/gameplay-workflows.css', 'game_data/static/styles/menu-surfaces.css',
            'game_data/static/styles/menu-columns.css', 'game_data/static/styles/menu-search.css'])
            await page.addStyleTag({ path: path.join(root, file) });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = []; window.qaWatching = false; window.qaHandlers = {};
            window.jQuery.fx.off = true;
            const renderer = function () { this.cell_width = 32; this.cell_height = 32; };
            renderer.prototype.init = renderer.prototype.draw_from_texture = () => {};
            window.modules = { jquery: window.jQuery,
                comm: { send_message(msg, data) { window.qaPackets.push({ msg, ...data }); },
                    register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); } },
                client: { is_watching: () => window.qaWatching }, 'game-loading': { setPopupCount() {} },
                './options': { get: key => key === 'tile_display_mode' ? 'tiles' : false, add_listener() {} },
                './focus-trap': (element, options) => ({ activate() { options.onActivate(); return this; }, deactivate() { options.onDeactivate(); } }),
                './scroller': element => ({ scrollElement: element }),
                './cell_renderer': { DungeonCellRenderer: renderer } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.qaModule] = factory(...deps.map(dep => window.modules[dep]));
            };
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const name of ['util', 'enums', 'menu-keyboard', 'menu-columns', 'menu-search', 'menu-actions', 'menu-presentation',
            'popup-controls', 'ui', 'context-menu', 'menu-items', 'menu-navigation', 'menu-selection-controls', 'menu']) {
            await page.evaluate(name => { window.qaModule = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        const open = async (hidden = false, replace = false, unavailable = false) => {
            await page.evaluate(({ hidden, replace, unavailable }) => {
                const flags = window.modules['./enums'].menu_flag;
                const pad = (text, width) => text.padEnd(width);
                window.qaHandlers.menu({ tag: 'spell', type: 'menu', replace: replace ? 1 : 0,
                    flags: flags.SINGLESELECT | flags.ARROWS_SELECT,
                    title: { text: 'Spells (Memorise)                   Type                      Failure  Level' },
                    action_title: 'Spell library', menu_actions_label: 'Spell visibility',
                    menu_actions: [{ id: 'available', label: 'Available spells', active: !hidden },
                        { id: 'hidden', label: 'Hidden spells', active: hidden }],
                    more: '5 spell levels left\nChoose an action beside a spell.', alt_more: '',
                    total_items: 1, chunk_start: 0, last_hovered: unavailable ? -1 : 0,
                    items: [{ level: 2, text: (unavailable ? '     ' : ' a - ') + pad('Kiss of Death', 32)
                        + pad('Conjuration/Necromancy', 26) + pad('77%', 9) + '1',
                        hotkeys: unavailable ? [] : [97], q: 1, entry_id: 42, action_name: 'Kiss of Death',
                        entry_actions: [...(hidden ? [] : [{ id: 'primary', label: 'Memorise', enabled: !unavailable }]),
                            { id: 'describe', label: 'Describe', enabled: true },
                            { id: hidden ? 'show' : 'hide', label: hidden ? 'Show' : 'Hide', enabled: true }] }] });
            }, { hidden, replace, unavailable });
        };
        const packets = () => page.evaluate(() => window.qaPackets.filter(packet => packet.msg === 'key' || packet.msg === 'menu_action'));
        const clear = () => page.evaluate(() => { window.qaPackets = []; });
        const control = action => page.locator(`.workflow-entry-actions [data-entry-action='${action}']`);
        await open();
        assert.equal(await page.locator('.menu_title').innerText(), 'Spell library');
        assert.equal(await page.locator('li').getAttribute('role'), 'group');
        assert.equal(await page.locator('li').getAttribute('tabindex'), '-1');
        assert.equal(await page.locator('.workflow-entry-actions button').count(), 3);
        assert.notEqual(await page.locator('.workflow-menu-actions [aria-pressed=true]').evaluate(node => getComputedStyle(node).backgroundColor),
            await page.locator('.workflow-menu-actions [aria-pressed=false]').evaluate(node => getComputedStyle(node).backgroundColor));
        await clear(); await page.locator('.workflow-menu-actions [aria-pressed=true]').click();
        assert.deepEqual(await packets(), [], 'The active filter preserves context without a refresh');
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            for (const selector of ['.workflow-action-menu', '.workflow-menu-actions', 'li'])
                assert(await page.locator(selector).evaluate(node => node.scrollWidth <= node.clientWidth + 1), selector + ' fits at ' + width);
            await page.locator('#ui-stack .ui-popup-outer').screenshot({ path: path.join(output, `actions-${width}.png`) });
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        for (const action of ['primary', 'describe', 'hide']) {
            await clear(); await control(action).click();
            assert.deepEqual(await packets(), [{ msg: 'menu_action', action, entry: 42 }], 'One direct native action');
        }
        for (const key of ['Enter', 'Space']) {
            await control('describe').focus(); await clear(); await page.keyboard.press(key);
            assert.deepEqual(await packets(), [{ msg: 'menu_action', action: 'describe', entry: 42 }], key + ' activates exactly once');
        }
        // Independent native title updates rebuild columns without losing actions.
        await page.evaluate(() => window.qaHandlers.update_menu({ title: {
            text: 'Spells (Describe)                   Type                      Failure  Level' } }));
        await page.waitForFunction(() => document.activeElement?.dataset.entryAction === 'describe');
        assert.equal(await page.locator('.workflow-entry-actions button').count(), 3);
        // Native descriptions can refresh their parent while it is covered.
        await control('describe').click();
        await page.evaluate(() => {
            window.modules['./ui'].show_popup(window.jQuery('<div class="probe-description" tabindex="-1">Spell description</div>'));
            document.querySelector('.probe-description').focus();
            window.qaHandlers.update_menu({ title: {
                text: 'Spells (Memorise)                   Type                      Failure  Level' } });
        });
        await page.waitForTimeout(50);
        assert(await page.locator('.probe-description').evaluate(node => node === document.activeElement), 'Covered menus do not steal focus');
        await page.evaluate(() => window.modules['./ui'].hide_popup());
        await page.waitForFunction(() => document.activeElement?.dataset.entryAction === 'describe');
        await page.evaluate(() => document.activeElement.blur());
        await clear(); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close panel');
        assert.deepEqual(await packets(), [], 'Tab moves focus without cycling native modes');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.dataset.entryAction), 'available');
        await page.locator(".workflow-menu-actions [data-entry-action='hidden']").focus();
        await clear(); await page.keyboard.press('Enter');
        assert.deepEqual(await packets(), [{ msg: 'menu_action', action: 'hidden', entry: -1 }]);
        await open(true, true);
        await page.waitForFunction(() => document.activeElement?.dataset.entryAction === 'hidden');
        assert.equal(await control('primary').count(), 0);
        assert.equal(await control('show').count(), 1);
        await clear(); await control('show').click();
        assert.deepEqual(await packets(), [{ msg: 'menu_action', action: 'show', entry: 42 }]);
        await open(false, true, true);
        assert(await control('primary').isDisabled());
        assert(await control('describe').isEnabled());
        await clear(); await control('describe').click();
        assert.deepEqual(await packets(), [{ msg: 'menu_action', action: 'describe', entry: 42 }], 'Unavailable spells remain inspectable');
        await page.evaluate(() => { window.qaWatching = true; });
        await open(false, true);
        assert.equal(await page.locator('.workflow-action-menu button:enabled').count(), 0, 'Spectators cannot mutate a library');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, exactActions: true, keyboard: true, focusRetained: true,
            unavailableInspection: true, spectators: true, widths: [1280, 768, 390, 320] }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
