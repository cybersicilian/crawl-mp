/* Responsive space allocation through the real party, inventory and sidebar adapters. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(process.env.SIDEBAR_WEB_ROOT || path.join(__dirname, '..'));
const output = process.env.SIDEBAR_PROOF_DIR || '/tmp/dcss-party-sidebar-proof';
fs.mkdirSync(output, { recursive: true });

function hero(slot, count = 18) {
    return { slot, name: ['Moss', 'Lyra', 'Orin', 'Nessa'][slot], species: 'Human', job: 'Fighter',
        xl: 5, xl_next: 34, str: 18, intel: 9, dex: 12, hp: 40, hp_max: 40, mp: 8, mp_max: 8,
        alive: true, active: slot === 0, place: 'D:1', on_same_level: true, weapon: '',
        move_aut: 10, atk_aut: 10, speed_stat: 10, adjusted_noise: 0,
        resists: { rFire: 1, rCold: -1, rElec: 0, rPois: 0, rNeg: 0, rCorr: 0, Will: 40, SeeInvis: 0, Stlth: 50 },
        statuses: [], mutations: [], abilities: [], spells: [], inventory_known: true,
        inventory: Array.from({ length: count }, (_, i) => ({ slot: i, letter: String.fromCharCode(97 + i),
            name: i === 0 ? '+0 short sword' : 'potion of curing ' + i, kind_name: i === 0 ? 'weapon' : 'potion',
            qty: i % 3 + 1, equipped: i === 0, description: 'Known item description.' })) };
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    try {
        const sheet = fs.readFileSync(path.join(root, 'game_data/templates/character-sheet.html'), 'utf8');
        await page.setContent('<!doctype html><html><body class="workflow-compact-roster"><main id="normal">'
            + '<div id="left_column"></div><div id="right_column"><div id="hud_sidebar_scroll">'
            + sheet + '<div id="party_hud"><div id="party_hud_header">Party</div>'
            + '<div id="party_hud_members"></div></div><div id="monster_list"></div></div></div></main></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/materials.css', 'static/tabletop/properties.css',
            ...['game-coop', 'tabletop-party', 'gameplay-shell', 'hud-workspace', 'hud-polish', 'party-initiative',
                'party-card-status', 'hud-reflow', 'personal-stat-visuals', 'player-card-sections', 'party-faith',
                'portrait-status', 'health-effects', 'party-card-readings', 'party-sidebar'].map(name => 'game_data/static/styles/' + name + '.css')])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.addStyleTag({ content: 'body{margin:0;background:#11161b;color:#e2dac7}#normal{display:flex}'
            + '#left_column{flex:1}#right_column{flex:none;box-sizing:border-box}button{font:inherit;color:inherit}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const noop = () => {};
            window.sent = []; window.inspected = [];
            window.modules = { jquery: window.jQuery,
                comm: { register_handlers: noop, send_message: (...args) => window.sent.push(args) },
                client: { is_party_member: () => true, is_watching: () => false },
                './enums': { mouse_mode: { COMMAND: 0 } }, './player': { inv: [] },
                './dungeon_renderer': { set_view_center: noop }, './display': { invalidate: noop, display: noop },
                './minimap': { update_overlay: noop, fit_to: noop },
                './party-inspector': { open: (...args) => window.inspected.push(args), render: noop },
                './party-controls': { toggle_drawer: noop, bind: noop }, './tileinfo-dngn': {}, './tileinfo-main': {},
                './party-doom': { update: noop }, './party-trade': { button: () => window.jQuery('<button>Trade</button>') },
                './chat-context': { update: noop }, './item-context-menu': { bind: noop },
                './inspection-dialog': { open: noop },
                './power-art': { ready: () => true } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(dep => {
                    if (!(dep in window.modules)) throw new Error('Missing fixture dependency: ' + dep);
                    return window.modules[dep];
                }));
            };
        });
        const files = [['item-properties', 'static/scripts/item-properties.js'],
            ['character-stat-help', 'static/scripts/character-stat-help.js'], ['spell-cost', 'static/scripts/spell-cost.js'],
            ...['status-icons', 'party-model', 'party-status-model', 'party-faith', 'portrait-status', 'party-card-status',
                'player-card-details', 'party-initiative', 'workflow-actions', 'party-navigation', 'party', 'native-tile-art', 'frame-update',
                'party-power-cards', 'hud-inventory', 'party-sidebar', 'player-card-sections', 'party-card-readings']
                .map(name => [name === 'party' ? name : './' + name, 'game_data/static/' + name + '.js'])];
        for (const [name, file] of files) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
            assert(await page.evaluate(name => Boolean(window.modules[name]), name), 'Module loaded: ' + name);
        }
        const state = { snapshot_version: 2, controlled_slot: 0, active_slot: 0, controllable_slots: [0, 1, 2, 3],
            inventory_use: true, inventory_secondary: true, members: [hero(0), hero(1)] };
        async function render() {
            await page.evaluate(data => {
                window.modules.party.state(data);
                window.modules['./player-card-sections'].init();
                window.modules['./hud-inventory'].init();
                window.modules['./party-card-readings'].init();
                window.jQuery(document).trigger('game_input_changed', [0]);
                window.modules['./party-sidebar'].update();
            }, state);
        }
        async function settled() {
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
        async function geometry() {
            await settled();
            return page.evaluate(() => {
                const scroll = document.getElementById('hud_sidebar_scroll');
                const box = node => {
                    const r = node.getBoundingClientRect();
                    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
                };
                return { height: scroll.clientHeight, content: scroll.scrollHeight,
                    overflow: document.documentElement.scrollWidth > innerWidth,
                    cards: [...document.querySelectorAll('.party-card')].map(box),
                    previews: [...document.querySelectorAll('.party-sidebar-pack')].filter(node => !node.hidden).length,
                    extras: [...document.querySelectorAll('.party-sidebar-extra')].filter(node => !node.hidden).length,
                    inventoryHeight: box(document.querySelector('#hud_inventory .hud-item-grid')).height };
            });
        }
        await render();
        for (const [width, height] of [[1440, 900], [1728, 1100], [1280, 800], [1024, 768]]) {
            await page.setViewportSize({ width, height });
            const layout = await geometry(); evidence[width + 'x' + height] = layout;
            assert.equal(layout.overflow, false);
            assert(layout.content <= layout.height, 'Two-player cards fit without hiding another hero');
            assert.equal(layout.previews, 1, 'A companion pack is visible when it fits');
            assert(layout.cards.every(card => card.bottom <= height));
            await page.screenshot({ path: path.join(output, 'sidebar-' + width + '.png') });
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await settled();
        const companionItem = page.locator('#party_pack_1_0');
        await companionItem.click();
        assert.deepEqual(await page.evaluate(() => window.inspected.at(-1)), [1, 'equipment']);
        assert.deepEqual(await page.evaluate(() => window.sent), [], 'Companion preview cannot spend a turn');
        assert.equal(await companionItem.getAttribute('draggable'), null, 'Companion items cannot become another hero’s quickbar actions');
        await page.locator('#hud_item_0_1').click();
        assert.deepEqual(await page.evaluate(() => window.sent.at(-1).slice(0, 1)), ['inv_item_use']);
        assert.equal(await page.evaluate(() => window.sent.at(-1)[1].expected_slot), 0);
        await companionItem.focus();
        state.members[1].inventory[0].qty = 5;
        await page.evaluate(data => window.modules.party.state(data), state);
        await settled();
        assert.equal(await page.locator('#party_pack_1_0 .hud-slot-quantity').textContent(), '5', 'Inventory-only snapshots refresh companion items');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_pack_1_0', 'Snapshot refresh retains item focus');
        await page.setViewportSize({ width: 1024, height: 390 });
        const short = await geometry(); evidence.short = short;
        assert.equal(short.previews, 0, 'Short viewports collapse optional packs');
        assert.equal(await page.evaluate(() => document.activeElement.closest('.party-sidebar-pack[hidden]')), null);
        await page.setViewportSize({ width: 1440, height: 1100 });
        state.members = [hero(0, 52), hero(1, 52), hero(2, 52), hero(3, 52)];
        await render();
        const four = await geometry(); evidence.four = four;
        assert(four.content <= four.height, 'Full packs do not push four heroes out of view');
        assert.equal(await page.locator('#party_hud_members .hud-item-slot').count(), 208);
        const grid = page.locator('#hud_inventory .hud-item-grid');
        await grid.evaluate(node => { node.scrollTop = 60; });
        await page.evaluate(() => window.modules['./party-sidebar'].update());
        assert(await grid.evaluate(node => node.scrollTop > 0), 'Space allocation preserves pack scrolling');
        await page.screenshot({ path: path.join(output, 'four-full-packs.png') });
        state.controlled_slot = 1;
        await page.evaluate(data => window.modules.party.state(data), state);
        await settled();
        assert.equal(await page.locator('.is-controlled-card').getAttribute('data-party-slot'), '1');
        assert.equal(await page.locator('.is-controlled-card #hud_inventory').count(), 1);
        assert.equal(await page.locator('#party_pack_0_0').count(), 1);
        assert.equal(await page.locator('#party_pack_1_0').count(), 0);
        state.members[0].inventory = []; state.members[0].inventory_known = false;
        delete state.members[0].resists.rFire;
        await page.evaluate(data => window.modules.party.state(data), state);
        await settled();
        assert.match(await page.locator('[data-party-slot="0"] .party-sidebar-pack').textContent(), /information unavailable/);
        assert.match(await page.locator('#party_detail_0_rFire').getAttribute('aria-label'), /unavailable/);
        assert.deepEqual(errors, []);
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        evidence.passed = true; evidence.errors = errors;
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ passed: true, viewports: 5, nativeActionsPreserved: true, output }));
    } catch (error) {
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ errors,
            modules: await page.evaluate(() => Object.keys(window.modules || {})) }, null, 2));
        console.error(errors);
        await page.screenshot({ path: path.join(output, 'failure.png') });
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
