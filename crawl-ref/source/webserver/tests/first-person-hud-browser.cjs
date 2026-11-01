/* Real AMD HUD, item art and stylesheet; passive inspection must never spend a turn. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(process.env.FIRST_PERSON_STATIC_ROOT || path.join(__dirname, '..'));
const output = process.env.FIRST_PERSON_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
function setup() {
    window.fixture = { sent: [], errors: [], handlers: {} };
    require.config({ baseUrl: '/static/scripts', paths: { jquery: 'contrib/jquery', game: '/game' } });
    define('comm', [], () => ({ register_handlers: values => Object.assign(fixture.handlers, values),
        send_message: (type, payload) => fixture.sent.push({ type, payload }) }));
    define('game/player', [], () => fixture.player = { inv: {} });
    define('game/workflow-actions', [], () => ({ controlledSlot: () => 0, reason: () => '', ready: () => true,
        itemVerb: () => 'Use', itemSecondaryHint: () => 'Shift-click: drop',
        itemAction: (hero, item) => fixture.sent.push({ type: 'use', slot: item.slot }),
        itemSecondaryAction: (hero, item) => fixture.sent.push({ type: 'secondary', slot: item.slot }) }));
    define('game/equipment-paperdoll', [], () => ({ itemRestriction: () => null }));
    define('game/item-context-menu', [], () => ({ bind() {} }));
    define('game/party-power-cards', [], () => ({}));
    define('game/power-art', [], () => ({ ready: () => true }));
    require(['jquery', 'game/hud-inventory', 'game/first-person-hud', 'game/tileinfo-main', 'expedition-presentation'],
        ($, inventory, hud, tiles, presentation) => (async () => {
            try {
                await Promise.all(Array.from(document.images, image => image.decode()));
                const items = [
                    { slot: 0, letter: 'a', name: '+2 long sword', kind_name: 'weapon', qty: 1, equipped: true,
                        description: 'A balanced steel blade, its edge sharpened for close combat.', tile: [tiles.WPN_LONG_SWORD] },
                    { slot: 1, letter: 'b', name: 'potion of curing', kind_name: 'potion', qty: 3,
                        description: 'Restores health and cures poison.', tile: [tiles.POTION_RED] },
                    { slot: 2, letter: 'c', name: 'scroll of teleportation', kind_name: 'scroll', qty: 2,
                        description: 'Read to teleport after a short delay.', tile: [tiles.SCROLL] }
                ];
                // Tile names vary across builds; use canonical named members of the native atlas.
                const fallback = ['WPN_', 'POTION_', 'SCROLL_'];
                items.forEach((item, i) => {
                    if (!Number.isInteger(item.tile[0])) item.tile = [tiles[Object.keys(tiles).find(name => name.startsWith(fallback[i]) && Number.isInteger(tiles[name]))]];
                    fixture.player.inv[item.slot] = item;
                });
                fixture.hero = { slot: 0, player_id: 'preview', name: 'The Wayfarer', species: 'Human',
                    hp: 34, hp_max: 48, mp: 8, mp_max: 12, xl: 7, progress: 62, place: 'Dungeon:3',
                    inventory: items, inventory_known: true, abilities: [], spells: [], alive: true };
                window.crawl_party = { state: { members: [fixture.hero], inventory_use: true } };
                Object.assign(fixture, { inventory, presentation });
                fixture.hud = hud.create(document.getElementById('dungeon_viewport'));
                fixture.handlers.game_presentation({ mode: 'first_person', expedition_id: 'hud-preview' });
                inventory.init(); fixture.hud.update(fixture.hero, -Math.PI / 2, true);
                fixture.ready = true;
            } catch (error) { fixture.errors.push(error.stack); }
        })(), error => fixture.errors.push(String(error)));
}
const html = '<!doctype html><html><meta charset="utf-8"><title>First-person HUD and inventory</title>'
    + '<link rel="stylesheet" href="/game/style.css"><style>'
    + 'body{margin:0;background:#0b1017}#normal{display:flex!important;width:100vw;height:100vh}'
    + '#left_column{flex:1!important;width:auto!important;min-width:0}#dungeon_viewport{position:relative;width:100%;height:100%;background:radial-gradient(ellipse at 50% 65%,#303945,#0c121b 70%)}'
    + '#normal #right_column{position:static;width:340px;flex:0 0 340px;height:auto;overflow:auto}#hud_inventory{flex:1}#hud_inventory .hud-item-grid{max-height:320px}'
    + '@media(max-width:600px){#normal{flex-direction:column}#left_column{height:360px;flex:0 0 360px!important}#normal #right_column{width:100%;flex:1;min-height:0}}'
    + '</style><div id="normal"><div id="left_column"><div id="dungeon_viewport"></div></div><div id="right_column"></div></div>'
    + '<div hidden><img id="main" src="/game/main.png"><img id="icons" src="/game/icons.png"></div>'
    + '<script src="/static/scripts/contrib/require.js"></script><script>(' + setup.toString() + ')()</script></html>';
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.route('http://hud.test/**', route => {
            const name = new URL(route.request().url()).pathname;
            if (name === '/') return route.fulfill({ contentType: 'text/html', body: html });
            const file = name.startsWith('/game/') ? path.join(root, 'game_data/static', name.slice(6)) : path.join(root, name.slice(1));
            if (!file.startsWith(root + '/') || !fs.existsSync(file)) return route.fulfill({ status: 404, body: name });
            return route.fulfill({ path: file });
        });
        await page.goto('http://hud.test/');
        await page.waitForFunction(() => fixture.ready || fixture.errors.length);
        assert.deepEqual(await page.evaluate(() => fixture.errors), []);
        const rows = page.locator('#hud_inventory .hud-item-slot');
        assert.equal(await rows.count(), 3);
        const preview = page.locator('.first-person-item-preview');
        await rows.nth(1).hover(); assert.match(await preview.innerText(), /potion of curing/);
        await rows.nth(2).focus(); assert.match(await preview.innerText(), /scroll of teleportation/);
        assert.deepEqual(await page.evaluate(() => fixture.sent), [], 'Passive preview sends no gameplay messages');
        await rows.nth(1).click(); await rows.nth(2).click({ modifiers: ['Shift'] });
        assert.deepEqual(await page.evaluate(() => fixture.sent), [{ type: 'use', slot: 1 }, { type: 'secondary', slot: 2 }]);
        await page.getByRole('button', { name: 'Equipped items', exact: true }).click();
        assert.equal(await rows.count(), 1); assert.match(await preview.innerText(), /long sword/);
        await page.getByRole('button', { name: 'All items', exact: true }).click();
        await page.evaluate(() => {
            fixture.hero.inventory = fixture.hero.inventory.filter(item => item.slot !== 0);
            fixture.inventory.update(true);
        });
        assert.doesNotMatch(await preview.innerText(), /long sword/, 'Removed item cannot remain in the preview');
        await page.evaluate(() => {
            fixture.hero.hp = 9; fixture.hero.mp = 2; fixture.hero.species = 'Automaton';
            fixture.hud.update(fixture.hero, 0, true);
        });
        assert.equal(await page.getByRole('meter', { name: 'Health: 9 / 48' }).getAttribute('data-low'), 'true');
        assert.equal(await page.getByRole('meter', { name: 'Heat: 10 / 12' }).getAttribute('aria-valuenow'), '10');
        await page.screenshot({ path: path.join(output, 'inventory-desktop.png') });
        for (const width of [390, 760]) {
            await page.setViewportSize({ width, height: 844 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            assert.equal(overflow, false, 'No horizontal overflow at ' + width);
            const bounds = await page.evaluate(() => {
                const hud = document.querySelector('.first-person-vitals').getBoundingClientRect();
                const items = document.getElementById('hud_inventory').getBoundingClientRect();
                return { hud: { left: hud.left, right: hud.right, bottom: hud.bottom }, items: { left: items.left, top: items.top } };
            });
            assert(bounds.hud.right <= bounds.items.left || bounds.hud.bottom <= bounds.items.top, 'Inventory keeps clear of HUD at ' + width);
            await page.screenshot({ path: path.join(output, 'inventory-' + width + '.png') });
        }
        // Immersive menu/interface coverage lives in first-person-menu-browser.cjs with the real 3D adapter.
        await page.evaluate(() => {
            fixture.handlers.game_presentation({ mode: 'overhead' }); fixture.hud.update(fixture.hero, 0, false);
        });
        assert.equal(await preview.count(), 0);
        assert.equal(await page.locator('.first-person-item-name').first().isVisible(), false);
        assert.equal(await page.locator('.first-person-hud').isVisible(), false);
        await page.evaluate(() => fixture.hud.destroy());
        assert.equal(await page.locator('.first-person-hud').count(), 0);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'hud-proof.json'), JSON.stringify({ passed: true, viewports: [1200, 390, 760],
            checks: ['passive inspection', 'direct use and shift action', 'immediate filters', 'removed item', 'Heat', 'low health', 'overhead reset', 'teardown'] }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
