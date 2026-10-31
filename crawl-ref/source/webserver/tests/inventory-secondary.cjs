/* Shift-click routing and context retention across the real inventory surfaces. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const profiles = JSON.parse(fs.readFileSync(process.env.EQUIPMENT_PROFILES || '/tmp/dcss-inventory-secondary-profiles.json'));
const nativeRoot = process.env.EQUIPMENT_NATIVE_ROOT || path.resolve(root, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await require('./helpers/equipment-fixture.cjs').install(page, { Human: profiles.Human }, nativeRoot);
        await page.evaluate(() => {
            Object.assign(window.crawl_party.state, { inventory_use: true, inventory_secondary: true });
            window.modules.inspector.render();
        });
        const equipped = profiles.Human.inventory.find(item => item.equipped);
        const packed = profiles.Human.inventory.find(item => !item.equipped);
        assert(equipped && packed, 'The native fixture needs equipped gear and a packed item');
        const packet = () => page.evaluate(() => window.packets.at(-1));
        const expected = (item, action) => ({ msg: 'inv_item_use', slot: item.slot,
            expected_slot: 0, expected_name: item.name, action });
        const open = () => page.evaluate(() => window.modules.inspector.open(0, 'equipment'));
        const command = () => page.evaluate(() => window.jQuery(document).trigger(
            'game_input_changed', window.modules['./enums'].mouse_mode.COMMAND));

        // Both art and text belong to the full backpack item button.
        await page.locator('#party_inventory_search').fill(equipped.name);
        await page.locator('#party_item_0_' + equipped.slot + ' .folio-item-symbol').click({ modifiers: ['Shift'] });
        assert.deepEqual(await packet(), expected(equipped, 'unequip'));
        assert.equal(await page.locator('#party_inspector_modal').evaluate(node => node.open), false);
        await page.evaluate(slot => {
            const hero = window.crawl_party.state.members[0];
            hero.inventory.find(item => item.slot === slot).equipped = false;
            hero.equipment_profile.slots.filter(entry => entry.inv_slot === slot).forEach(entry => {
                entry.state = 'empty'; entry.inv_slot = -1; entry.name = '';
            });
            // An instant native action need not change the input mode.
            window.jQuery(document).trigger('party_state_rendered');
        }, equipped.slot);
        assert.equal(await page.locator('#party_inspector_modal').evaluate(node => node.open), true);
        assert.equal(await page.locator('#party_inventory_search').inputValue(), equipped.name);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_item_0_' + equipped.slot);
        await page.locator('#party_item_0_' + equipped.slot).click({ modifiers: ['Shift'] });
        assert.deepEqual(await packet(), expected(equipped, 'drop'));
        await page.evaluate(() => window.jQuery(document).trigger('party_state_rendered'));
        assert.equal(await page.locator('#party_inventory_search').inputValue(), equipped.name);

        // Equipped sockets share the shortcut; a native warning retains focus on return.
        await page.evaluate(profile => {
            window.crawl_party.state.members[0].inventory = JSON.parse(JSON.stringify(profile.inventory));
            window.crawl_party.state.members[0].equipment_profile = profile.equipment_profile;
            window.modules.inspector.render();
        }, profiles.Human);
        const socket = page.locator('.paperdoll-slot[data-state=equipped]').first();
        const socketId = await socket.getAttribute('id');
        await socket.click({ modifiers: ['Shift'] });
        assert.equal((await packet()).action, 'unequip');
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_input_changed', -1);
            window.jQuery('#ui-stack').append('<div>Native warning</div>');
            window.jQuery(document).trigger('game_popup_changed', 1);
            window.jQuery(document).trigger('party_state_rendered');
        });
        assert.equal(await page.locator('#party_inspector_modal').evaluate(node => node.open), false);
        await command();
        assert.equal(await page.locator('#party_inspector_modal').evaluate(node => node.open), false);
        await page.evaluate(() => {
            window.jQuery('#ui-stack').empty();
            window.jQuery(document).trigger('game_popup_changed', 0);
        });
        assert.equal(await page.evaluate(() => document.activeElement.id), socketId);

        // Legacy loadouts and inventory buttons retain the same secondary action.
        await page.evaluate(() => {
            const hero = window.crawl_party.state.members[0];
            hero.equipment_slots_known = true;
            hero.equipment_slots = hero.equipment_profile.slots.filter(slot => slot.capacity > 0).map(slot => ({
                slot_name: slot.label, inv_slot: slot.inv_slot, name: slot.name, empty: slot.state === 'empty'
            }));
            delete hero.equipment_profile;
            window.modules.inspector.render();
        });
        await page.locator('.folio-loadout button').first().click({ modifiers: ['Shift'] });
        assert.equal((await packet()).action, 'unequip');
        await open();
        await page.locator('#party_inventory_search').fill('');
        await page.locator('#party_item_0_' + packed.slot).click({ modifiers: ['Shift'] });
        assert.deepEqual(await packet(), expected(packed, 'drop'));

        // Exercise actual HUD handlers, including normal use and context-menu inspection.
        await page.evaluate(() => {
            document.body.insertAdjacentHTML('beforeend', '<div id="right_column"></div><div id="dcss_quick_dock"></div>');
            const hero = window.crawl_party.state.members[0];
            hero.abilities = []; hero.spells = [];
            window.modules['./player'] = { inv: [] };
            window.modules['./tileinfo-main'] = {};
            window.modules['./power-art'] = { ready: () => false };
            document.getElementById('party_inspector_modal').close();
        });
        for (const name of ['frame-update', 'hud-inventory']) {
            await page.evaluate(name => { window.moduleName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        await page.evaluate(() => window.modules['./hud-inventory'].init());
        const gear = page.locator('#hud_item_0_' + equipped.slot);
        const supply = page.locator('#hud_item_0_' + packed.slot);
        assert.match(await gear.getAttribute('data-tip-meta'), /Shift-click: unequip/);
        assert.match(await supply.getAttribute('data-tip-meta'), /Shift-click: drop/);
        await gear.click({ modifiers: ['Shift'] });
        assert.deepEqual(await packet(), expected(equipped, 'unequip'));
        await supply.click({ modifiers: ['Shift'] });
        assert.deepEqual(await packet(), expected(packed, 'drop'));
        await supply.click();
        const { action, ...normalUse } = expected(packed, 'drop');
        assert.deepEqual(await packet(), normalUse);
        await supply.click({ button: 'right', modifiers: ['Shift'] });
        await page.getByRole('menuitem', { name: /^Inspect/ }).click();
        assert.deepEqual(await packet(), { ...normalUse, msg: 'inv_item_describe' });

        // No secondary operation escapes existing readiness, ownership or capability gates.
        for (const gate of ['spectator', 'other-hero', 'downed', 'ghost', 'turn', 'prompt', 'old-server']) {
            const before = await page.evaluate(() => window.packets.length);
            await page.evaluate(gate => {
                const state = window.crawl_party.state, hero = state.members[0];
                if (gate === 'spectator') window.modules.client.is_watching = () => true;
                if (gate === 'other-hero') state.controlled_slot = 1;
                if (gate === 'downed') hero.alive = false;
                if (gate === 'ghost') hero.ghost_haunting = true;
                if (gate === 'turn') { state.combat_locked = true; state.active_slot = 1; }
                if (gate === 'prompt') window.jQuery(document).trigger('game_input_changed', -1);
                if (gate === 'old-server') delete state.inventory_secondary;
                window.modules['./workflow-actions'].itemSecondaryAction(hero, hero.inventory[0]);
                window.modules.client.is_watching = () => false;
                Object.assign(state, { controlled_slot: 0, active_slot: 0, combat_locked: false, inventory_secondary: true });
                Object.assign(hero, { alive: true, ghost_haunting: false });
                window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
            }, gate);
            assert.equal(await page.evaluate(() => window.packets.length), before, gate);
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, backpack: true, sockets: true, legacy: true, hud: true,
            nativeWarningReturn: true, instantActionReturn: true, filterAndFocusRetention: true, gates: 7 }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
