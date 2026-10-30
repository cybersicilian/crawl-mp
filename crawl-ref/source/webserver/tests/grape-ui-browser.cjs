/* Recipient-visible grape aura and per-hero equipment suppression surfaces. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(__dirname, '..');
const staticRoot = path.join(root, 'game_data/static');

async function load(page, name) {
    await page.evaluate(name => { window.moduleName = './' + name; }, name);
    await page.addScriptTag({ path: path.join(staticRoot, name + '.js') });
}

(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<main id="normal"><aside id="party_hud"><div class="is-controlled-card">Hero</div></aside>'
            + '<div id="monster_list"></div><div id="equipment"></div><div id="cards"></div><div id="hud"></div></main>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const $ = window.jQuery, noOp = () => {}, cells = new Map(), cursor_locs = {};
            const icon = name => $('<span></span>').attr('data-icon', name)[0];
            window.qaCells = cells;
            window.modules = {
                jquery: $, comm: { send_message: noOp }, chat: { tag_item: noOp },
                './chat-context': { inventory_item: item => item }, 'share-link': { controls: () => $() },
                'item-properties': { icon, render: text => $('<span></span>').text(text)[0], parse: name => ({ name }) },
                './native-tile-art': { create: () => document.createElement('span'), draw: () => false },
                './equipment-memory-ui': { properties: () => $() }, './folio-bag': { render: () => $() },
                './item-context-menu': { bind: button => button }, './party-power-cards': { attach: noOp },
                './power-art': { ready: () => false }, 'spell-cost': {}, './player': { inv: [] },
                './tileinfo-main': { UNSEEN_INVISIBLE: 1 }, './tileinfo-dngn': {},
                './status-icons': { icon, effect: () => document.createElement('span') },
                './party-faith': {}, './portrait-status': {}, './options': { add_listener: noOp, get: () => '' },
                './workflow-actions': { reason: () => '', ready: () => true, inspectionReason: () => '',
                    controlledSlot: () => window.crawl_party.state.controlled_slot, itemSecondaryHint: () => '',
                    itemVerb: () => 'Use', itemAction: noOp, itemSecondaryAction: noOp, describe: noOp },
                './party-initiative': { createMonster: () => $('<span id="party_progress_monsters" hidden></span>'), updateMonster: noOp },
                './view_data': { cursor_locs, place_cursor: noOp, remove_cursor: noOp },
                './enums': { CURSOR_MOUSE: 'mouse' }, './dungeon_renderer': {},
                './map_knowledge': { get: (x, y) => cells.get(x + ',' + y), visible: cell => Boolean(cell && cell.visible) },
                './dungeon-context-menu': { open: noOp },
                './util': { init_canvas(canvas, width, height) { canvas.width = width; canvas.height = height; } },
                './cell_renderer': { DungeonCellRenderer: class { init() {} clear() {} render_cell() {} draw_main() {} } }
            };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                for (const dep of deps) if (!(dep in window.modules)) throw new Error('Missing dependency ' + dep);
                window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep]));
            };
            window.crawl_party = { state: { floor: 'D:1', controlled_slot: 0, active_slot: 0,
                members: [{ slot: 0, name: 'Aster' }, { slot: 1, name: 'Bryn' }], enemy_initiative: [] } };
        });
        for (const name of ['frame-update', 'party-model', 'party-status-model', 'equipment-paperdoll',
            'folio-equipment', 'party-card-status', 'hud-inventory', 'monster_list', 'indexed-paint',
            'enemy-banner-model', 'creature-roster-model', 'collapsible-roster', 'enemy-initiative'])
            await load(page, name);
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const [name, file] of [
            ['tooltip-content', 'static/scripts/tooltip-content.js'],
            ['tooltip-policy', 'static/scripts/tooltip-policy.js'],
            ['tooltip-source', 'static/scripts/tooltip-source.js'],
            ['tooltip-layout', 'static/scripts/tooltip-layout.js'],
            ['./tip-placement', 'game_data/static/tip-placement.js'],
            ['./tooltip-glossary', 'game_data/static/tooltip-glossary.js'],
            ['./persistent-help', 'game_data/static/persistent-help.js'],
            ['./nested-tips', 'game_data/static/nested-tips.js'],
            ['./player-interactions', 'game_data/static/player-interactions.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            jQuery(document).trigger('game_init');
            modules['./enemy-initiative'].init();
            modules['./player-interactions'].init();
        });
        async function tabFrom(before, target, explanation) {
            await page.locator(before).focus();
            await page.keyboard.press('Tab');
            const focused = page.locator(target);
            assert.equal(await focused.evaluate(node => node === document.activeElement), true,
                'Keyboard navigation must reach ' + target);
            const tip = page.locator('#dcss_rich_tooltip');
            await tip.waitFor({ state: 'visible' });
            assert.match(await tip.innerText(), explanation);
            assert.match(await focused.getAttribute('aria-describedby'), /dcss_rich_tooltip/);
        }

        // Only currently visible map projections may contribute the aura.
        await page.evaluate(() => {
            qaCells.set('4,4', { visible: true, t: { bg: { OOR: false } }, mon: {
                id: 7, name: 'interdimensional grape', type: 500, att: 0, aura_radius: 2 } });
            modules['./monster_list'].update_loc({ x: 4, y: 4 });
            crawl_party.state.enemy_initiative = [{ id: 7, name: 'interdimensional grape', x: 4, y: 4,
                perception: 'visible', energy_deficit: 4, speed: 10, health: 'uninjured', statuses_known: true, statuses: [] }];
            modules['./enemy-initiative'].update(crawl_party.state);
        });
        const banner = page.locator('.enemy-timing');
        assert.equal(await banner.count(), 1);
        assert.match(await banner.locator('small').innerText(), /Aura · 2 tiles/);
        assert.match(await banner.getAttribute('data-tip-body'), /armour within 2 tiles and line of sight/);
        assert.match(await banner.getAttribute('aria-label'), /Aura · 2 tiles/);
        assert.match(await banner.getAttribute('aria-label'), /armour within 2 tiles and line of sight/);
        await tabFrom('.creature-category[data-category="enemies"] > summary', '.enemy-timing', /armour within 2 tiles and line of sight/);

        await page.evaluate(() => {
            qaCells.get('4,4').t.bg.OOR = true;
            modules['./monster_list'].update_loc({ x: 4, y: 4 });
            modules['./enemy-initiative'].update(crawl_party.state);
        });
        assert.doesNotMatch(await banner.locator('small').innerText(), /Aura/);
        assert.doesNotMatch(await page.locator('#dcss_rich_tooltip').innerText(), /distortion|aura/i,
            'Focused tooltip must refresh when the visible aura is no longer known');
        await page.evaluate(() => {
            qaCells.get('4,4').visible = false;
            modules['./monster_list'].update_loc({ x: 4, y: 4 });
            crawl_party.state.enemy_initiative = [];
            modules['./enemy-initiative'].update(crawl_party.state);
        });
        assert.equal(await banner.count(), 0, 'Hidden actor must not create an aura contact');
        await page.evaluate(() => {
            crawl_party.state.enemy_initiative = [{ id: 7, name: 'interdimensional grape', x: 4, y: 4,
                perception: 'last_known', aura_radius: 2 }];
            modules['./enemy-initiative'].update(crawl_party.state);
        });
        assert.equal(await banner.count(), 1);
        assert.match(await banner.locator('small').innerText(), /Last known/);
        assert.doesNotMatch(await banner.innerText(), /Aura/);
        assert.doesNotMatch(await banner.getAttribute('aria-label'), /Aura/);

        const reason = 'Interdimensional distortion has melded this item; its equipment effects are inactive.';
        await page.evaluate(reason => {
            function hero(slot, name, suppressed) {
                const item = { slot: 0, letter: 'a', name: 'a leather armour', qty: 1, equipped: true, kind_name: 'Armour' };
                const socket = { type: 'body', key: 'body:0', label: 'Body', capacity: 1, inv_slot: 0,
                    name: item.name, state: suppressed ? 'melded' : 'equipped', reason: suppressed ? reason : '' };
                if (suppressed) socket.suppression = 'interdimensional_grape';
                return { slot, name, species: 'Human', alive: true, inventory: [item], inventory_known: true,
                    abilities: [], spells: [], statuses: [], banes: [], resists: {},
                    equipment_profile: { version: 1, species: 'Human', size: 'medium', form: 'normal',
                        slots: [socket], items: [{ inv_slot: 0, equipment: true, fits: true, slot_types: ['body'] }] } };
            }
            window.heroes = [hero(0, 'Aster', true), hero(1, 'Bryn', false)];
            // One piece occupying multiple native slots is one suppressed item.
            heroes[0].equipment_profile.slots.push({ ...heroes[0].equipment_profile.slots[0],
                key: 'offhand:0', type: 'offhand', label: 'Offhand' });
            crawl_party.state.members = heroes;
            const $ = jQuery;
            $('#equipment').empty().append(modules['./folio-equipment'].render(heroes[0]));
            $('#cards').empty().append($('<div id="card0"></div>').append(modules['./party-card-status'].create(heroes[0])),
                $('<div id="card1"></div>').append(modules['./party-card-status'].create(heroes[1])));
            $('#hud').empty().append(modules['./hud-inventory'].itemButton(heroes[0], heroes[0].inventory[0], false),
                modules['./hud-inventory'].itemButton(heroes[1], heroes[1].inventory[0], true));
            $('<button id="slot_before">Before slot</button>').insertBefore('[data-equip-slot="body:0"]');
            $('<button id="card_before">Before card</button>').insertBefore('#card0');
            $('<button id="hud_before">Before HUD item</button>').insertBefore('#hud_item_0_0');
        }, reason);
        assert.match(await page.locator('[data-equip-slot="body:0"]').innerText(), /Melded.*interdimensional/is);
        assert.match(await page.locator('[data-equip-slot="body:0"]').getAttribute('aria-label'), /interdimensional/i);
        assert.match(await page.locator('#party_item_0_0').innerText(), /Melded · inactive/);
        assert.match(await page.locator('#party_item_0_0').getAttribute('data-tip-body'), /interdimensional/i);
        assert.equal(await page.locator('#hud_item_0_0 .hud-melded-mark').innerText(), 'M');
        assert.match(await page.locator('#hud_item_0_0').getAttribute('aria-label'), /interdimensional/i);
        assert.equal(await page.locator('#party_pack_1_0 .hud-melded-mark').count(), 0);
        assert.match(await page.locator('#card0').innerText(), /1 item suppressed/);
        assert.equal(await page.locator('#card0 .party-member-state').getAttribute('role'), 'note');
        assert.doesNotMatch(await page.locator('#card1').innerText(), /suppressed/);
        await tabFrom('#slot_before', '[data-equip-slot="body:0"]', /interdimensional distortion/i);
        await tabFrom('#card_before', '#card0 .party-member-state', /equipment.*inactive/i);
        await tabFrom('#hud_before', '#hud_item_0_0', /interdimensional distortion/i);
        await page.evaluate(reason => {
            heroes[0].equipment_profile.slots.push({ type: 'head', key: 'head:0', label: 'Head',
                capacity: 1, inv_slot: 1, state: 'melded', reason, suppression: 'interdimensional_grape' });
            jQuery('#card0').empty().append(modules['./party-card-status'].create(heroes[0]));
        }, reason);
        assert.match(await page.locator('#card0').innerText(), /2 items suppressed/,
            'A second item is counted once even when the first occupies multiple slots');
        assert.doesNotMatch(await page.locator('#card1').innerText(), /suppressed/);
        const signatureBefore = await page.evaluate(() => modules['./party-model'].cardSignature(crawl_party.state, 0, false));

        await page.evaluate(() => {
            heroes[0].equipment_profile.slots.forEach(slot => Object.assign(slot,
                { state: 'equipped', reason: '', suppression: '' }));
            jQuery('#cards').empty().append(modules['./party-card-status'].create(heroes[0]));
            jQuery('#hud').empty().append(modules['./hud-inventory'].itemButton(heroes[0], heroes[0].inventory[0], false));
        });
        assert.doesNotMatch(await page.locator('#cards').innerText(), /suppressed/);
        assert.equal(await page.locator('#hud_item_0_0 .hud-melded-mark').count(), 0);
        const signatureAfter = await page.evaluate(() => modules['./party-model'].cardSignature(crawl_party.state, 0, false));
        assert.notEqual(signatureBefore, signatureAfter, 'Restoration must invalidate the party-card snapshot');
        await page.evaluate(() => {
            Object.assign(heroes[0].equipment_profile.slots[0],
                { state: 'melded', reason: 'Melded into your current form.', suppression: '' });
            jQuery('#cards').empty().append(modules['./party-card-status'].create(heroes[0]));
        });
        assert.doesNotMatch(await page.locator('#cards').innerText(), /suppressed/,
            'Ordinary transformation melds are not reported as grape suppression');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, visibleAura: true, hiddenAndRemembered: true,
            perOwnerEquipment: true, restoration: true, scope: 'controlled browser state; no native game' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
