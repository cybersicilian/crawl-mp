/* Browser checks for visual equipment and the native power-command adapter. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.FOLIO_PROOF_DIR || '/tmp/dcss-folio-controls-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const density = {};
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack); });
    try {
        await page.setContent('<!doctype html><html><body><button id="equipment">Equipment</button>' +
            '<button id="cast">Cast</button><div id="dcss_quick_dock"></div><div id="ui-stack"></div></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/typography.css', 'static/tabletop/properties.css',
            'game_data/static/styles/party-inspector.css', 'static/tabletop/character-folio.css',
            'game_data/static/styles/inspector-sourcebook.css', 'game_data/static/styles/gameplay-workflows.css',
            'game_data/static/styles/folio-controls.css'])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^@import.*$/gm, '') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.messages = []; window.shared = []; window.watching = false;
            window.modules = { jquery: window.jQuery, require: { toUrl: () => 'data:text/css,' },
                client: { is_watching: () => window.watching },
                comm: { register_handlers: () => {}, send_message: (msg, fields) => window.messages.push({ msg, ...fields }) },
                chat: { tag_item: item => window.shared.push(item) }, './chat-context': { inventory_item: item => item } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.crawl_party = { state: { snapshot_version: 2, active_slot: 0, controlled_slot: 0,
                controllable_slots: [0, 1], members: [{ slot: 0, name: 'Lyra', species: 'Human', job: 'Conjurer',
                    alive: true, xl: 5, hp: 26, hp_max: 26, mp: 4, mp_max: 12, resists: {},
                    inventory: [
                        { slot: 0, letter: 'a', name: '+2 short sword {flame}', kind_name: 'Hand Weapons', equipped: true },
                        { slot: 1, letter: 'b', name: '+0 robe', kind_name: 'Armour', equipped: true },
                        { slot: 2, letter: 'c', name: '2 potions of might', kind_name: 'Potions' },
                        { slot: 3, letter: 'd', name: 'a scroll of blinking', kind_name: 'Scrolls' }
                    ], equipment_slots: [
                        { slot_name: 'Weapon', inv_slot: 0, letter: 'a', name: '+2 short sword {flame}', empty: false },
                        { slot_name: 'Body armour', inv_slot: 1, letter: 'b', name: '+0 robe', empty: false, melded: true },
                        ...['Offhand', 'Helmet', 'Gloves', 'Boots', 'Cloak', 'Ring 1', 'Ring 2', 'Amulet']
                            .map(slot_name => ({ slot_name, name: '(empty)', empty: true }))
                    ], spells: [
                        { id: 1, letter: 'a', name: 'Magic Dart', level: 1, mp_cost: 1, schools: 'Conjurations', fail: '1%', power: '40%', damage: '1d6', range: '7', desc: 'Hurls a small bolt of magical energy that never misses.' },
                        { id: 2, letter: 'b', name: 'Scorch', level: 2, mp_cost: 2, schools: 'Fire', fail: '12%', power: '32%', damage: '2d9', range: '3', desc: 'Scorches a nearby enemy and burns away their resistance to fire.' },
                        { id: 3, letter: 'c', name: 'Fireball', level: 5, mp_cost: 5, schools: 'Conjurations/Fire', fail: '48%', power: '25%', damage: '3d12', range: '6', desc: 'Creates an explosion of fire around the chosen target.' },
                        { id: 4, letter: 'd', name: '<img src=x onerror=alert(1)>', level: 1, mp_cost: 1, schools: 'Hexes', fail: '3%', desc: '<script>unsafe()</script>' }
                    ], abilities: [{ id: 12, hotkey: 'a', name: 'Berserk', cost: 'Piety', fail: '0%', is_god: true, desc: 'Enter a berserk rage.' }],
                    skills: [], mutations: [], statuses: [] },
                    { slot: 1, name: 'Wren', species: 'Human', job: 'Fighter', alive: true, mp: 0, mp_max: 0, inventory: [], spells: [], abilities: [], resists: {} }] } };
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const [name, file] of [
            ['spell-cost', 'static/scripts/spell-cost.js'],
            ['item-properties', 'static/scripts/item-properties.js'], ['character-stat-help', 'static/scripts/character-stat-help.js'],
            ['./party-model', 'game_data/static/party-model.js'], ['./party-status-model', 'game_data/static/party-status-model.js'], ['./effect-icon-catalog', 'game_data/static/effect-icon-catalog.js'], ['./effect-icon-art', 'game_data/static/effect-icon-art.js'], ['./status-icons', 'game_data/static/status-icons.js'],
            ['./enums', 'game_data/static/enums.js'], ['./inspection-dialog', 'game_data/static/inspection-dialog.js'],
            ['./workflow-actions', 'game_data/static/workflow-actions.js'],
            ['./native-tile-art', 'game_data/static/native-tile-art.js'],
            ['./equipment-paperdoll', 'game_data/static/equipment-paperdoll.js'],
            ['./context-menu', 'game_data/static/context-menu.js'],
            ['./party-skill-training', 'game_data/static/party-skill-training.js'],
            ['./item-context-menu', 'game_data/static/item-context-menu.js'],
            ['./folio-bag', 'game_data/static/folio-bag.js'],
            ['./folio-equipment', 'game_data/static/folio-equipment.js'], ['./party-power-cards', 'game_data/static/party-power-cards.js'],
            ['./party-inspector-render', 'game_data/static/party-inspector-render.js'],
            ['./menu-keyboard', 'game_data/static/menu-keyboard.js'],
            ['./folio-keyboard', 'game_data/static/folio-keyboard.js'],
            ['inspector', 'game_data/static/party-inspector.js'], ['./tileinfo-floor', 'game_data/static/tileinfo-floor.js'],
            ['./tileinfo-wall', 'game_data/static/tileinfo-wall.js'], ['./tileinfo-feat', 'game_data/static/tileinfo-feat.js'],
            ['./tileinfo-main', 'game_data/static/tileinfo-main.js'],
            ['./tileinfo-player', 'game_data/static/tileinfo-player.js'], ['./tileinfo-gui', 'game_data/static/tileinfo-gui.js'],
            ['./power-art', 'game_data/static/power-art.js'], ['picker', 'game_data/static/power-picker.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.modules.inspector.hotkeys();
            window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
            document.getElementById('equipment').onclick = () => window.modules.inspector.open(0, 'equipment');
            document.getElementById('cast').onclick = () => window.modules.picker.open('spell');
        });
        await page.locator('#equipment').click();
        assert.equal(await page.locator('.folio-loadout-grid .folio-slot').count(), 10);
        assert.equal(await page.locator('.folio-loadout-grid button').count(), 2);
        assert.match(await page.locator('.folio-loadout').innerText(), /Melded/);
        assert(await page.locator('.folio-equipment .tt-icon:visible').evaluateAll(nodes => nodes.every(node => {
            const style = getComputedStyle(node); return style.width === '16px' && style.height === '16px';
        })), 'Equipment, empty slots, item states and properties retain the native16 icon size');
        density.equipment = await page.evaluate(() => {
            const body = document.getElementById('party_insp_body');
            const rows = [...document.querySelectorAll('.folio-inventory-row')];
            return { rowHeight: rows[0].getBoundingClientRect().height,
                loadoutHeight: document.querySelector('.folio-loadout-grid').getBoundingClientRect().height,
                bodyHeight: body.clientHeight, contentHeight: body.scrollHeight };
        });
        assert(density.equipment.contentHeight <= density.equipment.bodyHeight + 1,
            'Ten loadout slots and four inventory items fit without scrolling at 1280×800');
        await page.screenshot({ path: path.join(out, 'equipment-desktop.png') });
        await page.locator('#party_inventory_search').fill('flame');
        assert.equal(await page.locator('.folio-inventory-row:visible').count(), 1);
        await page.evaluate(() => window.modules.inspector.render());
        assert.equal(await page.locator('#party_inventory_search').inputValue(), 'flame');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_inventory_search');
        await page.locator('#party_inventory_search').fill('');
        await page.locator('[data-filter=supplies]').click();
        assert.equal(await page.locator('.folio-inventory-row:visible').count(), 2);
        await page.locator('#party_item_0_2').click();
        assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {
            msg: 'inv_item_describe', slot: 2, expected_slot: 0, expected_name: '2 potions of might'
        });
        await page.evaluate(() => {
            const $ = window.jQuery;
            $(document).trigger('game_input_changed', -1);
            $('#ui-stack').append('<div>Native detail</div>'); $(document).trigger('game_popup_changed', 1);
            $('#ui-stack').empty(); $(document).trigger('game_popup_changed', 0);
            $(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
        });
        assert(await page.locator('#party_inspector_modal').evaluate(element => element.open));
        assert.equal(await page.locator('[data-filter=supplies]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_item_0_2');
        await page.locator('.folio-inventory-row:visible .folio-share').first().click();
        assert.equal(await page.evaluate(() => window.shared[0].slot), 2);
        await page.locator('#equipment').click();
        await page.locator('[data-filter=all]').click();
        await page.locator('#party_inventory_search').fill('no matching item');
        assert.match(await page.locator('.folio-inventory .folio-empty').innerText(), /No items match/);
        await page.locator('#party_inventory_search').fill('');
        for (const [width, height] of [[390, 844], [768, 900], [1280, 950]]) {
            await page.setViewportSize({ width, height });
            assert(await page.locator('#party_inspector_modal').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
            assert(await page.locator('#party_insp_body').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
            if (width === 390) await page.screenshot({ path: path.join(out, 'equipment-mobile.png') });
        }
        await page.keyboard.press('Escape');
        await page.locator('#cast').click();
        assert.equal(await page.locator('.power-picker-card:visible').count(), 4);
        assert(await page.locator('#power_picker_dialog canvas.power-art-fallback').evaluateAll(nodes => nodes.length === 4
            && nodes.every(node => node.width === 16 && node.height === 16
                && getComputedStyle(node).width === '16px' && getComputedStyle(node).height === '16px')),
            'Unavailable native art uses the shared16 fallback without scaling it inside the picker');
        assert.equal(await page.locator('#power_picker_dialog img, #power_picker_dialog script').count(), 0);
        assert(await page.locator('#power_picker_cast_3').isDisabled());
        assert.match(await page.locator('[data-power-id="3"] .power-picker-blocked').innerText(), /Needs 5 MP/);
        density.spells = await page.evaluate(() => ({
            rowHeight: document.querySelector('.power-picker-card').getBoundingClientRect().height,
            menuWidth: document.getElementById('power_picker_dialog').getBoundingClientRect().width,
            menuHeight: document.getElementById('power_picker_dialog').getBoundingClientRect().height
        }));
        await page.screenshot({ path: path.join(out, 'spellcasting-desktop.png') });
        await page.locator('#power_picker_search').fill('Fire');
        assert.equal(await page.locator('.power-picker-card:visible').count(), 2);
        await page.locator('#power_picker_affordable').check();
        assert.equal(await page.locator('.power-picker-card:visible').count(), 1);
        await page.evaluate(() => window.jQuery(document).trigger('party_state_rendered'));
        assert.equal(await page.locator('#power_picker_search').inputValue(), 'Fire');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'power_picker_search');
        await page.locator('#power_picker_search').focus();
        await page.evaluate(() => window.jQuery(document).trigger('party_state_rendered'));
        assert.equal(await page.evaluate(() => document.activeElement.id), 'power_picker_search');
        await page.locator('#power_picker_search').fill('nothing');
        assert.match(await page.locator('#power_picker_empty').innerText(), /No powers match/);
        await page.locator('#power_picker_search').fill('');
        await page.locator('#power_picker_affordable').uncheck();
        await page.evaluate(() => { window.watching = true; window.jQuery(document).trigger('party_state_rendered'); });
        assert.equal(await page.locator('#power_picker_dialog .power-picker-cast-button:enabled').count(), 0);
        await page.evaluate(() => { window.watching = false; window.crawl_party.state.combat_locked = true;
            window.crawl_party.state.active_slot = 1; window.jQuery(document).trigger('party_state_rendered'); });
        assert.match(await page.locator('#power_picker_context').innerText(), /combat queue/);
        assert.equal(await page.locator('#power_picker_dialog .power-picker-cast-button:enabled').count(), 0);
        await page.evaluate(() => { window.crawl_party.state.combat_locked = false;
            window.crawl_party.state.active_slot = 0; window.jQuery(document).trigger('party_state_rendered'); });
        await page.evaluate(() => { window.crawl_party.state.members[0].alive = false; window.jQuery(document).trigger('party_state_rendered'); });
        assert.match(await page.locator('#power_picker_context').innerText(), /downed/);
        assert.equal(await page.locator('#power_picker_dialog .power-picker-cast-button:enabled').count(), 0);
        await page.evaluate(() => { window.crawl_party.state.members[0].alive = true;
            window.crawl_party.state.members[0].spells[0].id = undefined; window.jQuery(document).trigger('party_state_rendered'); });
        assert(await page.getByRole('button', { name: 'Cast Magic Dart', exact: true }).isDisabled());
        await page.evaluate(() => { window.crawl_party.state.members[0].spells[0].id = 1; window.jQuery(document).trigger('party_state_rendered'); });
        for (const [width, height] of [[390, 844], [768, 900], [1280, 950]]) {
            await page.setViewportSize({ width, height });
            assert(await page.locator('#power_picker_dialog').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
            if (width === 390) await page.screenshot({ path: path.join(out, 'spellcasting-mobile.png') });
        }
        await page.locator('#power_picker_cast_1').click();
        assert.equal(await page.locator('#power_picker_dialog').evaluate(element => element.open), false);
        assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {
            msg: 'power_action', expected_slot: 0, id: 1, letter: 'a', kind: 'spell'
        });
        await page.locator('#cast').click();
        await page.locator('#power_picker_dialog .folio-filters [data-power-kind=ability]').click();
        await page.getByRole('button', { name: 'Use Berserk', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {
            msg: 'power_action', expected_slot: 0, id: 12, letter: 'a', kind: 'ability'
        });
        await page.locator('#cast').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'cast');
        await page.evaluate(() => {
            const hero = window.crawl_party.state.members[0];
            hero.species = 'Djinni'; hero.spell_resource = 'hp'; hero.hp = 3;
            delete hero.mp; delete hero.mp_max;
            hero.spells.forEach(spell => { spell.casting_cost = { resource: 'hp', amount: spell.mp_cost }; });
            window.modules.inspector.open(0, 'abilities');
        });
        const spellsTable = page.locator('#party_spells_heading + table');
        assert.match(await spellsTable.innerText(), /Level \/ Cost/i);
        assert.match(await spellsTable.innerText(), /Lv 2 \/ 2 HP/);
        assert(!/\bMP\b/.test(await spellsTable.innerText()));
        assert(await spellsTable.getByRole('button', { name: 'Cast Scorch', exact: true }).isEnabled());
        assert(await spellsTable.getByRole('button', { name: 'Cast Fireball', exact: true }).isDisabled());
        await spellsTable.getByRole('button', { name: 'Cast Scorch', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {
            msg: 'power_action', expected_slot: 0, id: 2, letter: 'b', kind: 'spell'
        });
        await page.locator('#cast').click();
        assert.equal(await page.locator('#power_picker_mp').innerText(), '3 / 26 HP');
        assert.equal(await page.locator('#power_picker_resource_filter').innerText(), 'Within HP');
        assert.match(await page.locator('#power_picker_context').innerText(), /at least 1 HP/);
        assert.equal(await page.locator('[data-power-id="2"] .power-picker-cost').innerText(), '2 HP');
        await page.screenshot({ path: path.join(out, 'djinni-spellcasting.png') });
        await page.locator('#power_picker_affordable').check();
        assert.equal(await page.locator('.power-picker-card:visible').count(), 3);
        await page.evaluate(() => {
            window.crawl_party.state.members[0].hp = 2; window.jQuery(document).trigger('party_state_rendered');
        });
        assert.equal(await page.locator('.power-picker-card:visible').count(), 2);
        await page.locator('#power_picker_affordable').uncheck();
        assert(await page.locator('#power_picker_cast_2').isDisabled());
        assert.match(await page.locator('[data-power-id="2"] .power-picker-blocked').innerText(), /at least 1 HP/);
        await page.evaluate(() => {
            window.crawl_party.state.members[0].hp = 1; window.jQuery(document).trigger('party_state_rendered');
        });
        assert.equal(await page.locator('#power_picker_dialog .power-picker-cast-button:enabled').count(), 0);
        await page.locator('#power_picker_affordable').check();
        assert.equal(await page.locator('.power-picker-card:visible').count(), 0);
        assert.match(await page.locator('#power_picker_empty').innerText(), /cost filter/);
        await page.keyboard.press('Escape');
        await require('./helpers/hp-casting-hud.cjs').verify(page);
        await require('./helpers/experience-casting.cjs').verify(page, out);
        await page.evaluate(() => {
            window.crawl_party.state.members[0].spells = []; window.modules.picker.open('spell');
        });
        assert.match(await page.locator('#power_picker_empty').innerText(), /No spells memorised/);
        await page.evaluate(() => {
            window.crawl_party.state.members[0].spells_known = false; window.jQuery(document).trigger('party_state_rendered');
        });
        assert.match(await page.locator('#power_picker_empty').innerText(), /unavailable/);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(out, 'density.json'), JSON.stringify(density, null, 2));
        console.log(JSON.stringify({ passed: true, inventoryFiltering: true, inspectionReturn: true, nativePowerPackets: true,
            escapedContent: true, observerAndQueueGates: true, responsiveWidths: [390, 768, 1280], out }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
