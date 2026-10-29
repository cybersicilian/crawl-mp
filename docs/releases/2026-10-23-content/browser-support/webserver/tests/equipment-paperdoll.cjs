/* CRPG board against real, no-save native anatomy snapshots. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const nativeRoot = process.env.EQUIPMENT_NATIVE_ROOT || '/tmp/dcss-equipment-native/source';
const profiles = JSON.parse(fs.readFileSync(process.env.EQUIPMENT_PROFILES || '/tmp/dcss-equipment-native/profiles.json'));
const out = process.env.EQUIPMENT_PROOF_DIR || '/tmp/dcss-equipment-paperdoll-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
    try {
        await require('./helpers/equipment-fixture.cjs').install(page, profiles, nativeRoot);
        const open = async species => {
            await page.evaluate(species => window.modules.inspector.open(window.speciesNames.indexOf(species), 'equipment'), species);
            await page.waitForFunction(() => document.querySelector('.paperdoll-hero-art')?.dataset.art === 'ready');
        };
        await open('Human');
        assert(await page.locator('.is-crpg-layout').count());
        assert.equal(await page.locator('#party_inspector_heading').innerText(), 'Equipment');
        assert.equal(await page.locator('.paperdoll-accessories .paperdoll-slot').count(), 3);
        assert.equal(await page.locator('.paperdoll-hero-art canvas').count(), 1);
        assert.equal(await page.locator('.paperdoll-defences').innerText(), 'AC\n6\nEV\n7\nSH\n4');
        assert.equal(await page.locator('.folio-item-open').count(), profiles.Human.inventory.length);
        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'human-equipment.png') });
        await page.locator('[data-equip-slot="head:0"]').click();
        assert.match(await page.locator('#party_filter_slot').innerText(), /Helmet/);
        assert(await page.locator('#party_filter_slot').isVisible());
        assert(await page.locator('.folio-inventory-row:visible').count() === 0);
        await page.evaluate(() => window.modules.inspector.render());
        assert.equal(await page.locator('[data-equip-slot="head:0"]').getAttribute('aria-pressed'), 'true');
        await page.locator('#party_filter_slot').click();
        assert(await page.locator('.folio-inventory-row:visible').count() > 0);
        const equipped = page.locator('.paperdoll-slot[data-state=equipped]').first();
        const slotId = await equipped.getAttribute('id');
        await equipped.click();
        assert.equal(await page.evaluate(() => window.packets.at(-1).msg), 'inv_item_describe');
        await page.evaluate(() => {
            const $ = window.jQuery;
            $(document).trigger('game_input_changed', -1);
            $('#ui-stack').append('<div>Native details</div>'); $(document).trigger('game_popup_changed', 1);
            $('#ui-stack').empty(); $(document).trigger('game_popup_changed', 0);
            $(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
        });
        assert.equal(await page.evaluate(() => document.activeElement.id), slotId);
        // The whole backpack tile is the direct action, including its art and name.
        const tile = page.locator('.folio-item-open').first();
        const tileId = await tile.getAttribute('id');
        await tile.locator('.folio-item-symbol').click();
        assert.equal(await page.evaluate(() => window.packets.at(-1).msg), 'inv_item_describe');
        await page.evaluate(() => {
            const $ = window.jQuery;
            $(document).trigger('game_input_changed', -1);
            $('#ui-stack').append('<div>Native details</div>'); $(document).trigger('game_popup_changed', 1);
            $('#ui-stack').empty(); $(document).trigger('game_popup_changed', 0);
            $(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
        });
        assert.equal(await page.evaluate(() => document.activeElement.id), tileId);
        await page.locator('#party_inventory_search').fill('buckler');
        assert.equal(await page.locator('.folio-inventory-row:visible').count(), 1);
        await page.evaluate(() => window.modules.inspector.render());
        assert.equal(await page.locator('#party_inventory_search').inputValue(), 'buckler');
        assert.equal(await page.locator('.folio-inventory-row:visible').count(), 1);
        await page.locator('[data-equip-slot="head:0"]').click();
        assert.equal(await page.locator('#party_inventory_search').inputValue(), '');
        await page.locator('#party_filter_slot').click();
        // Rich item properties and randart links remain readable and independently usable.
        await page.evaluate(() => {
            const item = window.crawl_party.state.members[0].inventory[0];
            window.originalItem = { ...item };
            item.name = '+3 scale mail {rF+ Str+2 -Cast}'; item.record_id = 'fixture-artifact';
            window.modules.inspector.render();
        });
        assert.equal(await page.locator('.folio-item-open .item-property[tabindex]').count(), 0);
        assert.equal(await page.locator('.folio-item-actions a').getAttribute('href'), '/randarts/fixture-artifact');
        assert.equal(await page.locator('.folio-item-open a').count(), 0);
        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'item-properties.png') });
        await page.evaluate(() => { Object.assign(window.crawl_party.state.members[0].inventory[0], window.originalItem);
            delete window.crawl_party.state.members[0].inventory[0].record_id; });
        await open('Octopode');
        assert.equal(await page.locator('[data-equip-slot="weapon:0"] .paperdoll-slot-name').innerText(), 'Tentacles');
        assert(await page.locator('[data-equip-slot="weapon:0"] .paperdoll-slot-name').isVisible());
        assert.equal(await page.locator('[data-equip-slot^="ring:"]').count(), 8);
        assert.equal(await page.locator('[data-equip-slot^="body:"]').count(), 0);
        assert.match(await page.locator('.paperdoll-restrictions').innerText(), /No body armour/);
        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'octopode-equipment.png') });
        await open('Naga');
        assert.equal(await page.locator('[data-equip-slot^="barding:"]').count(), 1);
        assert.equal(await page.locator('[data-equip-slot^="feet:"]').count(), 0);
        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'naga-equipment.png') });
        await open('Coglin');
        assert.equal(await page.locator('[data-equip-slot^="weapon_offhand:"]').count(), 1);
        assert.equal(await page.locator('[data-equip-slot^="ring:"]').count(), 0);
        await open('Poltergeist');
        assert.equal(await page.locator('[data-equip-slot^="haunted_armour:"]').count(), 6);
        const rackRows = await page.locator('[data-equip-slot^="haunted_armour:"]').evaluateAll(slots =>
            new Set(slots.map(slot => Math.round(slot.getBoundingClientRect().top))).size);
        assert.equal(rackRows, 1, 'All six haunted sockets share one desktop rack');
        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'poltergeist-equipment.png') });
        await open('Minotaur');
        assert.match(await page.locator('.paperdoll-restrictions').innerText(), /Hard helmets/);
        await page.locator('.paperdoll-restriction').filter({ hasText: 'Hard helmets' }).focus();
        assert.match(await page.locator('.paperdoll-restriction').filter({ hasText: 'Hard helmets' }).getAttribute('aria-label'), /horns/);
        await open('Troll');
        assert.equal(await page.locator('[data-equip-slot="weapon:0"] .paperdoll-slot-name').innerText(), 'Claws');
        assert(await page.locator('[data-equip-slot="weapon:0"] .paperdoll-slot-name').isVisible());
        for (const species of ['Human', 'Octopode', 'Naga', 'Poltergeist']) {
            await open(species);
            for (const [width, height] of [[1280, 800], [768, 900], [390, 844], [320, 740]]) {
                await page.setViewportSize({ width, height });
                assert(await page.locator('#party_insp_body').evaluate(element => element.scrollWidth <= element.clientWidth + 1), species + ' at ' + width);
                if (width === 390 && species === 'Octopode') await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'octopode-mobile.png') });
            }
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, nativePortraits: true, anatomy: true, flexibleSlots: true,
            mutationReasons: true, unarmedLabels: true, slotFiltering: true, nativeInspectionReturn: true, responsive: true, out }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
