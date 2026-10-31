/* Controlled UI states; native transfers are covered separately. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.TRADE_PROOF_DIR || '/tmp/dcss-party-trade/browser';
fs.mkdirSync(out, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><head></head><body><button id="open">Trade</button><div id="ui-stack"></div><div id="dcss_quick_dock"></div></body></html>');
        await page.addStyleTag({ path: path.join(root, 'game_data/static/styles/party-trade.css') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.packets = []; window.handlers = {}; window.sent = true;
            window.modules = { jquery: window.jQuery, require: { toUrl: () => 'data:text/css,' },
                client: { is_watching: () => Boolean(window.watching) },
                comm: { register_handlers(map) { Object.assign(window.handlers, map); },
                    send_message(msg, fields) { window.packets.push({ msg, ...fields }); return window.sent; } } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.crawl_party = { state: { snapshot_version: 2, party_trade: true, controlled_slot: 0, active_slot: 0,
                members: [
                    { slot: 0, name: 'Aster', alive: true, place: 'D:1', trade_targets: [1], inventory: [
                        { slot: 0, name: '+0 dagger', kind_name: 'Weapon', qty: 1, equipped: true },
                        { slot: 52, name: '5 potions of curing', kind_name: 'Potion', qty: 5, equipped: false },
                        { slot: 1, name: '<img src=x onerror=alert(1)> robe', kind_name: 'Armour', qty: 1, equipped: false }
                    ] },
                    { slot: 1, name: 'Lyra', alive: true, place: 'D:1', inventory: [], trade_targets: [0] },
                    { slot: 2, name: 'Thorek', alive: true, place: 'D:1', inventory: [], trade_targets: [] },
                    { slot: 3, name: 'Pip', alive: true, place: 'D:2', inventory: [], trade_targets: [] }
                ] } };
        });
        for (const [name, file] of [
            ['spell-cost', 'static/scripts/spell-cost.js'], ['item-properties', 'static/scripts/item-properties.js'],
            ['./party-model', 'game_data/static/party-model.js'], ['./party-trade-model', 'game_data/static/party-trade-model.js'],
            ['./enums', 'game_data/static/enums.js'], ['./workflow-actions', 'game_data/static/workflow-actions.js'],
            ['./status-icons', 'game_data/static/status-icons.js'], ['./native-tile-art', 'game_data/static/native-tile-art.js'],
            ['trade', 'game_data/static/party-trade.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
            document.getElementById('open').onclick = () => window.modules.trade.open(1);
        });
        await page.locator('#open').click();
        assert.equal(await page.locator('#party_trade_recipient').inputValue(), '1');
        assert.equal(await page.locator('#party_trade_recipient option:disabled').count(), 2);
        assert(await page.locator('#trade_give_0').isDisabled());
        assert.equal(await page.locator('#party_trade_items img').count(), 0, 'Item content is escaped');
        await page.locator('#trade_quantity_52').fill('2'); await page.locator('#trade_quantity_52').press('Enter');
        const packet = await page.evaluate(() => window.packets.at(-1));
        assert.equal(packet.msg, 'party_trade'); assert.equal(packet.quantity, 2);
        assert.equal(packet.expected_qty, 5); assert.equal(packet.expected_slot, 0); assert.equal(packet.recipient_slot, 1);
        assert(await page.locator('#trade_give_52').isDisabled());
        await page.evaluate(() => window.handlers.party_trade_result({ ok: true, request_id: 'another-player', message: 'Other transfer' }));
        assert(await page.locator('#trade_give_52').isDisabled(), 'Another player cannot clear our pending action');
        await page.evaluate(() => {
            window.crawl_party.state.members[0].inventory[1].qty = 3;
            window.crawl_party.state.members[0].inventory[1].name = '3 potions of curing';
            window.handlers.party_trade_result({ ok: true, request_id: window.packets.at(-1).request_id, message: 'Item transferred.' });
        });
        assert(await page.locator('#party_trade_dialog').isVisible());
        assert.equal(await page.locator('#trade_quantity_52').inputValue(), '2');
        assert.equal(await page.locator('#party_trade_recipient').inputValue(), '1');
        await page.locator('#party_trade_search').fill('curing');
        assert.equal(await page.locator('.trade-item:visible').count(), 1);
        await page.evaluate(() => {
            window.crawl_party.state.members[0].trade_targets = [];
            window.jQuery(document).trigger('party_state_rendered');
        });
        assert(await page.locator('#trade_give_52').isDisabled());
        assert.match(await page.locator('#party_trade_context').innerText(), /line of sight/);
        assert.equal(await page.locator('#party_trade_search').inputValue(), 'curing');
        await page.evaluate(() => {
            window.crawl_party.state.members[0].trade_targets = [1];
            window.jQuery(document).trigger('party_state_rendered');
        });
        await page.locator('#trade_quantity_52').fill('4'); await page.locator('#trade_give_52').click();
        assert.equal(await page.evaluate(() => window.packets.length), 1, 'Out-of-range quantities do not send');
        await page.locator('#trade_all_52').click();
        assert.equal(await page.evaluate(() => window.packets.at(-1).quantity), 3);
        await page.evaluate(() => window.handlers.game_action_error({ request_id: window.packets.at(-1).request_id, message: 'Finish the current action.' }));
        assert(await page.locator('#trade_give_52').isEnabled(), 'Native early rejection clears the pending request');
        await page.evaluate(() => { window.sent = false; }); await page.locator('#trade_all_52').click();
        assert.match(await page.locator('#party_trade_notice').innerText(), /Connection unavailable/);
        assert(await page.locator('#trade_all_52').isEnabled());
        await page.evaluate(() => {
            window.sent = true;
            document.getElementById('party_trade_notice').textContent = 'Item transferred.';
        });
        for (const [width, height] of [[1280, 800], [768, 900], [390, 844], [320, 740]]) {
            await page.setViewportSize({ width, height });
            await page.locator('#party_trade_search').fill('');
            assert(await page.locator('#party_trade_dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'No horizontal overflow at ' + width);
            assert(await page.locator('.trade-item').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height < 190)), 'Compact rows at ' + width);
            await page.locator('#party_trade_dialog').screenshot({ path: path.join(out, 'trade-' + width + '.png') });
        }
        await page.evaluate(() => {
            window.crawl_party.state.controllable_slots = [0, 1];
            window.crawl_party.state.members[1].inventory = [{ slot: 52, name: '2 potions of curing', qty: 2 }];
            window.jQuery(document).trigger('party_state_rendered');
        });
        await page.locator('#party_trade_swap').click();
        assert.equal(await page.evaluate(() => window.packets.at(-1).msg), 'switch_player');
        assert.equal(await page.evaluate(() => window.packets.at(-1).slot), 1);
        await page.evaluate(() => {
            window.crawl_party.state.controllable_slots = [0];
            window.jQuery(document).trigger('party_state_rendered');
        });
        assert.equal(await page.locator('#party_trade_swap').isVisible(), false,
            'Joining multiplayer hides control swapping even when inventory and positions stay unchanged');
        await page.evaluate(() => {
            window.crawl_party.state.controllable_slots = [0, 1];
            window.jQuery(document).trigger('party_state_rendered');
        });
        assert.equal(await page.locator('#party_trade_swap').isVisible(), true);
        await page.evaluate(() => {
            window.crawl_party.state.controlled_slot = 1;
            window.jQuery(document).trigger('party_state_rendered');
        });
        assert.equal(await page.locator('#party_trade_recipient').inputValue(), '0');
        assert.match(await page.locator('#party_trade_context').innerText(), /Lyra → Aster/);
        await page.locator('#party_trade_swap').click();
        await page.evaluate(() => {
            window.crawl_party.state.controlled_slot = 0;
            window.jQuery(document).trigger('party_state_rendered');
        });
        await page.keyboard.press('Escape');
        assert(await page.locator('#party_trade_dialog').isHidden());
        assert.equal(await page.evaluate(() => document.activeElement.id), 'open');
        await page.locator('#open').click();
        await page.evaluate(() => { window.watching = true; window.jQuery(document).trigger('game_actions_changed'); });
        assert(await page.locator('#trade_give_52').isDisabled());
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, responsiveWidths: [1280, 768, 390, 320], out }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
