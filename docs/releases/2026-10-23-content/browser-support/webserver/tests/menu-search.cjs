/* Native search grammar, controls, focus, safe fallback and narrow geometry. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.MENU_SEARCH_PROOF_DIR || '/tmp/dcss-menu-search-proof';

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
        const title = (mode = 'travel', sort = 'type', filter = 'hide', count = 1) =>
            `${count} match${count === 1 ? '' : 'es'}<lightgrey>: <w>${mode}</w> [toggle: <w>!</w>], by <w>${sort}</w> [<w>/</w>], <w>${filter}</w> useless & duplicates [<w>=</w>]</lightgrey>`;
        const rowText = 'a - [carried] b - a +0 <lightcyan>animal skin</lightcyan> (worn)';
        const open = async (text = title(), rows = [rowText], tag = 'stash') => {
            await page.evaluate(({ text, rows, tag }) => {
                const flags = window.modules['./enums'].menu_flag;
                window.qaHandlers.menu({ tag, type: 'menu', flags: flags.SINGLESELECT | flags.ARROWS_SELECT,
                    title: { text }, more: '', alt_more: '', total_items: rows.length,
                    chunk_start: 0, last_hovered: rows.length ? 0 : -1,
                    items: rows.map((text, index) => ({ level: 2, text, hotkeys: [97 + index],
                        tiles: [{ t: 1, tex: 0 }], q: 1, selected_qty: 0 })) });
            }, { text, rows, tag });
        };
        const close = () => page.evaluate(() => window.qaHandlers.close_menu());
        const packets = () => page.evaluate(() => window.qaPackets.filter(packet => packet.msg === 'key'));
        const clear = () => page.evaluate(() => { window.qaPackets = []; });
        const control = name => page.locator(`[data-search-control='${name}']`);
        await open();
        assert.equal(await page.locator('.menu_title').innerText(), 'Search results');
        assert.equal(await page.locator('.workflow-search-summary > span').first().innerText(), '1 match');
        assert.equal(await page.locator('.workflow-search-name').innerText(), 'a +0 animal skin');
        assert.equal(await page.locator('.workflow-search-name .fg11').innerText(), 'animal skin', 'Search highlighting survives slicing');
        assert.equal(await page.locator('.workflow-search-location').innerText(), 'Carried');
        assert.equal(await page.locator('.workflow-state').innerText(), 'Equipped');
        assert.equal(await page.locator('.workflow-key').innerText(), 'a', 'Only one shortcut');
        assert.equal(await page.locator('li canvas').count(), 1);
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            const bounds = await page.locator('#ui-stack .ui-popup-outer').boundingBox();
            assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Popup fits at ' + width);
            for (const selector of ['.workflow-search-menu', '.workflow-search-tools', 'li'])
                assert(await page.locator(selector).evaluate(node => node.scrollWidth <= node.clientWidth + 1), selector + ' fits at ' + width);
            await page.locator('#ui-stack .ui-popup-outer').screenshot({ path: path.join(output, `search-${width}.png`) });
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        await clear(); await control('mode-travel').click();
        assert.deepEqual(await packets(), [], 'Current mode is a no-op');
        await control('mode-view').click();
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 33 }]);
        await page.evaluate(text => window.qaHandlers.update_menu({ title: { text } }), title('view'));
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-search-control') === 'mode-view');
        assert.equal(await control('mode-view').getAttribute('aria-pressed'), 'true');
        await clear(); await control('sort').focus(); await page.keyboard.press('Enter');
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 47 }], 'Keyboard activates exactly once');
        await close(); await open(title('view', 'name'));
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-search-control') === 'sort');
        assert.match(await control('sort').innerText(), /Name/);
        await clear(); await control('filter').click();
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 61 }]);
        await close(); await open(title('view', 'name', 'show'));
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-search-control') === 'filter');
        assert.equal(await control('filter').getAttribute('aria-pressed'), 'false');
        await clear(); await page.locator('li').focus(); await page.keyboard.press('Enter');
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 13 }], 'Result uses native primary action');
        await close();
        await open(title('view', 'dist', 'show', 3), [rowText,
            'b - (2) [D:3] a scroll of blinking (2 further duplicates in 2 piles)',
            'c - [right here] a shop (unvisited)']);
        assert.deepEqual(await page.locator('.workflow-search-location').allTextContents(), ['Carried', 'D:3 · Waypoint 2', 'At your position']);
        assert.match(await page.locator('.workflow-search-name').nth(1).innerText(), /2 further duplicates in 2 piles/);
        await close();
        await open('0 matches<lightgrey>: only useless items found; press <w>=</w> to show.                    </lightgrey>', []);
        assert(await page.locator('.workflow-search-empty').isVisible());
        await clear(); await control('filter').click();
        assert.deepEqual(await packets(), [{ msg: 'key', keycode: 61 }], 'Empty filters can be removed directly');
        await close();
        await open('An unfamiliar native search title', ['a - Unknown layout']);
        assert.equal(await page.locator('.workflow-search-menu').count(), 0, 'Unknown title retains its native layout');
        assert.equal(await page.locator('.workflow-entry-copy').innerText(), 'Unknown layout', 'Shared rows omit the repeated key prefix');
        await close();
        await open('General choices', ['a - <yellow>Read the manual</yellow>'], 'help');
        assert.equal(await page.locator('.workflow-entry-copy .fg14').innerText(), 'Read the manual');
        await close();
        await page.evaluate(() => { window.qaWatching = true; });
        await open();
        assert.equal(await page.locator('.workflow-search-tools button:disabled').count(), 4);
        await clear();
        await page.evaluate(() => window.jQuery('[data-search-control=filter]').trigger('click'));
        assert.deepEqual(await packets(), [], 'Spectators cannot change search options');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, nativeControls: true, focusRetention: true,
            nativeFallback: true, sharedRowCleanup: true, widths: [1280, 768, 390, 320] }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
