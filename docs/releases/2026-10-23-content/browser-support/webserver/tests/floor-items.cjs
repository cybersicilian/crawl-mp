/* Controlled stress and lifecycle cases supplement the native pickup workflow. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><main id="normal"><div id="left_column"><div id="hud_bottom_row">'
            + '<div id="hud_bottom_map"></div><div id="message_pane">Log</div></div></div></main><div id="ui-stack"></div>');
        await page.addStyleTag({ path: path.join(root, 'game_data/static/styles/hud-reflow.css') });
        await page.addStyleTag({ path: path.join(root, 'game_data/static/styles/floor-items.css') });
        await page.addStyleTag({ content: '#left_column { width: 700px; }' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.packets = []; window.watching = false;
            window.modules = { jquery: window.jQuery,
                comm: { register_handlers() {}, send_message(msg, fields) { window.packets.push({ msg, ...fields }); } },
                client: { is_watching: () => window.watching },
                'spell-cost': { reason: () => '' },
                './hud-inventory': { drawTiles: () => false, itemIcon: () => 'item' },
                './status-icons': { icon: () => document.createElement('span') } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.hero = { slot: 0, name: 'Ground fixture', alive: true, place: 'D:1', pos: { x: 0, y: 0 },
                floor_items_known: true, floor_items: Array.from({ length: 40 }, (_, id) => ({ id, qty: 1,
                    name: 'a very long name for an identified floor item ' + id, tile: [1] })) };
            window.crawl_party = { state: { snapshot_version: 2, floor_item_actions: true,
                controlled_slot: 0, active_slot: 0, members: [window.hero] } };
        });
        for (const name of ['enums', 'party-model', 'workflow-actions', 'frame-update', 'context-menu', 'party-skill-training', 'floor-items']) {
            await page.evaluate(name => { window.moduleName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static/' + name + '.js') });
        }
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
            window.modules['./floor-items'].init();
        });
        assert.equal(await page.locator('.floor-item').count(), 40);
        assert(await page.locator('.floor-item-list').evaluate(list => list.scrollHeight > list.clientHeight), 'Large stacks scroll');
        assert(await page.locator('.floor-item-list').evaluate(list => list.scrollWidth === list.clientWidth), 'Long names fit');
        await page.locator('.floor-item').last().click();
        assert.equal(await page.evaluate(() => window.packets.at(-1).id), 39, 'Overflow items remain directly available');
        await page.evaluate(() => { window.packets = []; window.hero.floor_items[39].qty = 2; });
        await page.locator('.floor-item').last().click();
        assert.equal(await page.evaluate(() => window.packets.length), 0, 'A stale rendered item cannot send a changed stack');
        await page.evaluate(() => {
            window.watching = true; window.modules['./floor-items'].update();
        });
        await page.locator('.floor-item').first().dispatchEvent('click');
        assert.equal(await page.evaluate(() => window.packets.length), 0, 'Spectators cannot pick up');
        await page.evaluate(() => {
            window.watching = false; window.hero.alive = false; window.modules['./floor-items'].update();
        });
        await page.locator('.floor-item').first().dispatchEvent('click');
        assert.equal(await page.evaluate(() => window.packets.length), 0, 'Downed heroes cannot pick up');
        await page.evaluate(() => {
            window.hero.alive = true; window.hero.floor_items_known = false; window.modules['./floor-items'].update();
        });
        assert.equal(await page.locator('.floor-item').count(), 0, 'Unavailable facts do not show stale loot');
        assert.equal(await page.locator('.floor-items-empty').textContent(), 'Ground items unavailable.');
        await page.evaluate(() => {
            window.hero.floor_items_known = true; window.hero.floor_items = []; window.modules['./floor-items'].update();
        });
        assert.equal(await page.locator('.floor-items-empty').textContent(), 'Nothing to pick up here.');
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_cleanup'); window.modules['./floor-items'].init();
        });
        assert.equal(await page.locator('#hud_floor_items').count(), 1, 'Cleanup and reinit do not duplicate the tray');
        assert.deepEqual(errors, []);
        console.log('Ground tray overflow, long names, stale clicks, spectator/downed gates, unknown/empty facts and lifecycle passed.');
    } catch (error) { console.error(error); throw error; }
    finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
