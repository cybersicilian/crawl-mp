/* Browser contract: item targets, shared training controls and stale/permission guards. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><body><div id="dcss_quick_dock"><button id="weapon">Axe</button>'
            + '<button id="armour">Armour</button><button id="potion">Potion</button></div><div id="hud_bottom_row"></div>'
            + '<dialog id="party_inspector_modal"><div id="party_insp_body"></div></dialog></body>');
        await page.addStyleTag({ path: path.join(root, 'game_data/static/styles/context-menu.css') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.packets = []; window.handlers = {}; window.watching = false;
            window.modules = { jquery: window.jQuery, client: { is_watching: () => window.watching },
                comm: { register_handlers(handlers) { Object.assign(window.handlers, handlers); },
                    send_message(msg, fields) { window.packets.push({ msg, ...fields }); } },
                'spell-cost': { reason: () => '' },
                './hud-inventory': { drawTiles: () => false, itemIcon: () => 'item' },
                './status-icons': { icon: () => document.createElement('span') } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.hero = { slot: 0, player_id: 'item-training-hero', name: 'Hero', alive: true,
                place: 'D:1', pos: { x: 1, y: 1 }, training_supported: true,
                skills: [{ id: 3, name: 'Axes', level: '4.0', can_train: true, train: 0, target: 0 },
                    { id: 11, name: 'Armour', level: '2.0', can_train: true, train: 1, target: 0 }],
                inventory: [{ slot: 0, name: '+0 war axe', kind_name: 'Hand Weapons', equipped: true,
                    training: [{ skill: 3, target: 180 }] },
                { slot: 1, name: '+0 scale mail', kind_name: 'Armour', training: [{ skill: 11, target: 0 }] },
                { slot: 2, name: 'a potion of might', kind_name: 'Potions', training: [] }],
                floor_items_known: true, floor_items: [{ id: 20, qty: 1, name: '+0 war axe', training: [{ skill: 3, target: 180 }] }] };
            window.crawl_party = { state: { snapshot_version: 2, controlled_slot: 0, active_slot: 0,
                inventory_use: true, inventory_secondary: true, floor_item_actions: true, members: [window.hero] } };
        });
        for (const name of ['enums', 'party-model', 'workflow-actions', 'context-menu', 'party-skill-training',
            'item-context-menu', 'frame-update', 'floor-items']) {
            await page.evaluate(name => { window.moduleName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static/' + name + '.js') });
        }
        await page.evaluate(() => {
            window.crawl_party.open_inspector = (slot, tab) => {
                window.openedTraining = { slot, tab };
                const member = window.crawl_party.state.members.find(hero => hero.slot === slot);
                window.jQuery('#party_insp_body').empty().append(window.modules['./party-skill-training'].render(member));
                document.getElementById('party_inspector_modal').showModal();
            };
            window.bindItems = () => ['weapon', 'armour', 'potion'].forEach((id, slot) =>
                window.modules['./item-context-menu'].bind(document.getElementById(id), window.hero, window.hero.inventory[slot]));
            window.bindItems();
            window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
            window.modules['./floor-items'].init();
        });
        console.log('Item-training fixture ready.');
        const count = () => page.evaluate(() => window.packets.length);
        const last = () => page.evaluate(() => window.packets.at(-1));
        const menu = page.getByRole('menu');
        const recommended = () => page.getByRole('menuitem', { name: /^Train Axes to 18.0/ });
        const custom = () => page.getByRole('menuitem', { name: /^Set Axes target/ });
        await page.locator('#weapon').click({ button: 'right' });
        assert.equal(await count(), 0, 'Opening item training does not send a command');
        await recommended().click();
        const packet = await last();
        assert.equal(packet.msg, 'skill_training');
        assert.deepEqual({ ...packet, request_id: undefined }, { msg: 'skill_training', request_id: undefined,
            slot: 0, action: 'target', skill: 3, target: 180, base: false, enable: true });
        assert.equal(await menu.count(), 0);
        await page.evaluate(() => window.handlers.skill_training_result({ request_id: window.packets.at(-1).request_id, ok: true }));
        assert.equal(await page.locator('#workflow_action_notice').innerText(), 'Axes training target set to 18.0.');

        await page.evaluate(() => {
            window.hero = structuredClone(window.hero);
            window.hero.skills[0].train = 1; window.hero.skills[0].target = 180;
            window.crawl_party.state.members[0] = window.hero;
            window.modules['./floor-items'].update();
        });
        console.log('Recommended target and result feedback passed.');
        await page.locator('#weapon').focus(); await page.keyboard.press('Shift+F10');
        await custom().click();
        assert.deepEqual(await page.evaluate(() => window.openedTraining), { slot: 0, tab: 'skills' });
        const target = page.getByRole('spinbutton', { name: 'Axes stop level', exact: true });
        assert(await target.evaluate(node => node === document.activeElement), 'Custom action focuses the matching skill');
        await target.fill('12.5'); await target.press('Enter');
        assert.equal((await last()).target, 125);
        assert.equal((await last()).enable, undefined, 'Custom targets preserve the current priority');
        await page.evaluate(() => document.getElementById('party_inspector_modal').close());

        await page.locator('#armour').click({ button: 'right' });
        assert.equal(await page.getByRole('menuitem', { name: /^Set Armour target/ }).count(), 1);
        assert.equal(await page.getByRole('menuitem', { name: /^Train Armour/ }).count(), 0, 'No arbitrary recommended armour level');
        await page.keyboard.press('Escape');
        await page.locator('#potion').click({ button: 'right' });
        assert.equal(await page.getByRole('menuitem', { name: /target|^Train/ }).count(), 0, 'Consumables do not invent skills');
        await page.keyboard.press('Escape');

        console.log('Custom target and item eligibility passed.');
        const beforeStale = await count();
        for (const change of [() => { window.hero.inventory[0].name = 'Replacement'; },
            () => { window.hero.skills[0].train = 2; },
            () => { window.crawl_party.state.controlled_slot = 1; }]) {
            await page.locator('#weapon').click({ button: 'right' });
            await page.evaluate(change);
            await recommended().click();
            assert.equal(await count(), beforeStale, 'Changed items, skill state and ownership invalidate the action');
            await page.evaluate(() => {
                window.hero.inventory[0].name = '+0 war axe'; window.hero.skills[0].train = 1;
                window.crawl_party.state.controlled_slot = 0; window.bindItems();
            });
        }
        for (const change of [() => { window.watching = true; },
            () => { window.crawl_party.state.multiplayer = true; window.crawl_party_slot = 1; },
            () => { window.hero.training_locked = 'This hero trains all skills equally.'; },
            () => { window.hero.skills[0].can_train = false; }]) {
            await page.evaluate(change);
            await page.locator('#weapon').click({ button: 'right' });
            assert.equal(await recommended().getAttribute('aria-disabled'), 'true');
            await recommended().click({ force: true });
            assert.equal(await count(), beforeStale);
            await page.keyboard.press('Escape');
            await page.evaluate(() => {
                window.watching = false; window.crawl_party_slot = 0; window.crawl_party.state.multiplayer = false;
                delete window.hero.training_locked; window.hero.skills[0].can_train = true;
            });
        }
        console.log('Checking ground training.');
        await page.locator('.floor-item').click({ button: 'right' });
        await recommended().click();
        assert.equal((await last()).target, 180, 'Ground items share the training action');
        const beforeGround = await count();
        await page.locator('.floor-item').click({ button: 'right' });
        await page.evaluate(() => { window.hero.pos.x++; });
        await recommended().click();
        assert.equal(await count(), beforeGround, 'Leaving a ground item invalidates its training action');
        assert.deepEqual(errors, []);
        console.log('Item target actions, custom focus, shared controls, native recommendations, permissions, feedback and stale guards passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
