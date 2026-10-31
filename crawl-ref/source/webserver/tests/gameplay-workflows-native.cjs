const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real engine workflows in a disposable localhost expedition; never a hosted save. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8894';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.GAMEPLAY_PROOF_DIR || '/tmp/dcss-gameplay-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(15000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const key = code => page.evaluate(code => require('comm').send_message('key', { keycode: code }), code);
    const commandReady = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const shot = name => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
    async function closeNative() {
        for (let n = 0; n < 8 && await page.locator('#ui-stack > *:visible').count(); n++) {
            await key(27); await page.waitForTimeout(90);
        }
        await commandReady();
    }
    async function inventory() {
        await page.locator("#dcss_quick_dock [data-dock-key='i']").click();
        await page.locator('.workflow-inventory:visible').waitFor();
    }
    try {
        await page.goto(url);
        evidence.account = 'GameplayQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
        await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('4 heroes'));
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await commandReady();
        const initial = await state(); evidence.initial = initial;
        await page.evaluate(() => {
            window.qaMenuPackets = [];
            window.qaPartyUpdates = 0;
            window.qaActionErrors = [];
            window.qaFocus = [];
            document.addEventListener('focusin', event => window.qaFocus.push({ id: event.target.id, cls: event.target.className }));
            const comm = require('comm'), original = comm.handle_message;
            comm.handle_message = function (message) {
                if (message.msg === 'party_state') window.qaPartyUpdates++;
                if (message.msg === 'game_action_error') window.qaActionErrors.push(message);
                if (/menu|game_action/.test(message.msg)) window.qaMenuPackets.push(message);
                return original.apply(this, arguments);
            };
        });
        assert.equal(initial.snapshot_version, 2);
        for (const [key, direction] of [['<', 'up'], ['>', 'down']])
            assert.equal(await page.locator(`#dcss_quick_dock [data-dock-key='${key}']`).isDisabled(), initial.members[0].stairs !== direction);
        assert(initial.members.every(member => member.inventory_known && member.spells_known && member.abilities_known));
        assert(initial.members.some(member => member.abilities.length === 0), 'A known-empty ability list stays empty');
        const hud = await page.evaluate(() => Object.fromEntries(['ac', 'ev', 'sh'].map(key =>
            [key, Number(document.getElementById('stats_' + key).textContent.trim())])));
        for (const field of ['ac', 'ev', 'sh']) assert.equal(initial.members[0][field], hud[field], field + ' agrees with the HUD');
        await shot('game-1280x800');
        for (const request of [
            { msg: 'inv_item_describe', slot: 0, expected_slot: 0, expected_name: 'stale item name' },
            { msg: 'power_action', expected_slot: 0, id: 99999, letter: 'a', kind: 'spell' },
            { msg: 'power_action', expected_slot: 3, id: 99999, letter: 'a', kind: 'ability' }
        ]) await page.evaluate(request => {
            const { msg, ...fields } = request; require('comm').send_message(msg, fields);
        }, request);
        await page.waitForFunction(() => window.qaActionErrors.length === 3);
        assert.equal((await state()).world_aut_clock, initial.world_aut_clock);
        evidence.staleActionsRejected = 3;

        // Repeated read-only native menus, visible categories, empty states and keyboard cycling.
        for (let cycle = 0; cycle < 3; cycle++) {
            await inventory();
            assert.equal(await page.locator('.workflow-categories [role=tab]').count(), 4);
            if (cycle === 0) {
                await page.evaluate(() => document.activeElement.blur());
                await page.keyboard.press('Tab');
                await page.waitForFunction(() => document.querySelector('.workflow-categories [data-category="1"]').getAttribute('aria-selected') === 'true');
                await page.keyboard.press('ArrowLeft');
                await page.waitForFunction(() => document.querySelector('.workflow-categories [data-category="0"]').getAttribute('aria-selected') === 'true');
            }
            await page.locator('.workflow-categories [data-category="1"]').click();
            await page.waitForFunction(() => document.querySelector('.workflow-categories [data-category="1"]').getAttribute('aria-selected') === 'true');
            const potion = page.locator('.workflow-inventory li.selectable').filter({ hasText: /potion/ }).first();
            if (await potion.count()) {
                await potion.click();
                await page.locator('.describe-item:visible .actions button').first().waitFor();
                assert(await page.locator('.describe-item .actions button').filter({ hasText: /quaff/i }).count());
                await shot('native-item-actions');
                await page.locator('#ui-stack > :visible').last().getByRole('button', { name: /Back to|Close panel/ }).click();
            }
            await closeNative();
            await inventory();
            await page.locator('.workflow-categories [data-category="3"]').click();
            await page.locator('.workflow-empty').waitFor();
            await shot('empty-inventory-category');
            await closeNative();
            await key('m'.charCodeAt(0));
            await page.locator('#ui-stack > :visible').first().waitFor();
            await closeNative();
            await page.locator('#dock_codex_btn').click();
            await page.getByRole('searchbox', { name: 'Search the encyclopedia' }).waitFor();
            await page.getByRole('searchbox').fill('war axe');
            await page.getByRole('button', { name: 'Search', exact: true }).click();
            await page.locator('.menu_contents li.selectable').filter({ hasText: /War axe/ }).first().waitFor();
            await shot('encyclopedia-search');
            await page.locator('.menu_contents li.selectable').filter({ hasText: /War axe/ }).first().click();
            await page.locator('.describe-item:visible, .describe-generic:visible').first().waitFor();
            await closeNative();
        }
        const readState = await state();
        assert.equal(readState.world_aut_clock, initial.world_aut_clock, 'Reading spends no world time');
        assert.deepEqual(readState.members.map(member => [member.ac, member.ev, member.sh, member.inventory]),
            initial.members.map(member => [member.ac, member.ev, member.sh, member.inventory]), 'Reads never change defence or inventory facts');
        evidence.repeatedReads = 3;
        for (const slot of [1, 2, 3, 0]) {
            await page.evaluate(slot => window.crawl_party.open_inspector(slot, 'overview'), slot);
            await page.getByRole('button', { name: 'Control this hero', exact: true }).click();
            await page.waitForFunction(slot => window.crawl_party.state.active_slot === slot, slot);
            await page.waitForFunction(slot => ['ac', 'ev', 'sh'].every(field =>
                Number(document.getElementById('stats_' + field).textContent.trim()) === window.crawl_party.state.members[slot][field]), slot);
            await page.keyboard.press('Escape');
        }
        assert.equal((await state()).world_aut_clock, initial.world_aut_clock);
        evidence.heroesReconciled = 4;

        // Folio inspection enters native management and returns to the same hero/section.
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
        await page.locator('#party_inspector_modal[open]').waitFor();
        assert.equal(await page.locator('#party_insp_tab_bar [role=tab]').count(), 5);
        await shot('equipment-overhaul');
        const manage = page.locator('#party_insp_panel_equipment .workflow-button').first();
        const manageId = await manage.getAttribute('id');
        await manage.click();
        await page.locator('.describe-item:visible').waitFor();
        await closeNative();
        await page.locator('#party_inspector_modal[open]').waitFor();
        assert.equal(await page.evaluate(() => window.crawl_party.inspector_tab), 'equipment');
        await page.waitForFunction(id => document.activeElement.id === id, manageId);
        await page.keyboard.press('Escape');

        // Camera actions do not transfer control; explicit control survives the next command.
        await page.locator('.party-card').nth(1).getByRole('button', { name: 'Center camera', exact: true }).click();
        assert.equal((await state()).active_slot, 0);
        await page.evaluate(() => window.crawl_party.open_inspector(1, 'equipment'));
        await page.getByRole('button', { name: 'Control this hero', exact: true }).click();
        await page.waitForFunction(() => window.crawl_party.state.active_slot === 1);
        assert.equal(await page.evaluate(() => window.crawl_party.inspector_slot), 1);
        await page.keyboard.press('Escape');
        await inventory(); await closeNative();
        assert.equal((await state()).active_slot, 1, 'Host commands must retain the explicitly controlled hero');
        evidence.contextPreserved = true;

        // A direct spell request enters native validation/targeting; cancellation never queues a letter.
        const beforeCast = await state();
        const updates = await page.evaluate(() => window.qaPartyUpdates);
        await page.locator("#dcss_quick_dock [data-dock-key='z']").click();
        await page.locator('#power_picker_dialog[open]').waitFor();
        await shot('spellcasting-menu');
        await page.locator('#power_picker_dialog').getByRole('button', { name: /^Cast / }).first().click();
        if (await page.locator('#ui-stack > :visible').count()) await closeNative();
        await key(27);
        await page.waitForFunction(count => window.qaPartyUpdates > count, updates); await commandReady();
        assert.equal((await state()).world_aut_clock, beforeCast.world_aut_clock);
        assert.equal((await state()).members[1].mp, beforeCast.members[1].mp);
        evidence.nativeCastCancel = true;

        // Execute reversible equipment actions through the same native detail buttons.
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
        await page.getByRole('button', { name: 'Control this hero', exact: true }).click();
        await page.waitForFunction(() => window.crawl_party.state.active_slot === 0);
        const beforeEquipment = await state();
        await page.locator('#party_item_0_0').click();
        await page.locator('.describe-item .actions button').filter({ hasText: /^Unwield/ }).click();
        await page.waitForFunction(() => !window.crawl_party.state.members[0].inventory.find(item => item.slot === 0).equipped);
        await page.locator('#party_inspector_modal[open]').waitFor();
        await page.locator('#party_item_0_0').click();
        await page.locator('.describe-item .actions button').filter({ hasText: /^Wield/ }).click();
        await page.waitForFunction(() => window.crawl_party.state.members[0].weapon.includes('war axe'));
        assert((await state()).members[0].aut_clock > beforeEquipment.members[0].aut_clock,
            'The native equipment actions retain their turn cost');
        await page.locator('#party_inspector_modal[open]').waitFor();
        await page.locator('#party_inspector_close_btn').click();
        await page.locator('#party_inspector_modal[open]').waitFor({ state: 'detached' });
        evidence.nativeEquipmentActions = true;

        await page.locator('.party-ping-btn').first().click();
        await page.locator('#workflow_ping_status:not([hidden])').waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => window.crawl_party.armed_ping_kind), null);
        assert(await page.locator('#workflow_ping_status').isHidden());
        await page.locator('#dock_chat_btn').click();
        const chatGeometry = await page.evaluate(() => {
            const chat = document.getElementById('chat').getBoundingClientRect();
            const party = document.getElementById('party_hud').getBoundingClientRect();
            return { chat: { right: chat.right, bottom: chat.bottom }, party: { left: party.left } };
        });
        assert(chatGeometry.chat.right <= chatGeometry.party.left, 'Chat leaves the party health and readiness unobscured');
        await shot('chat-with-tactical-status'); await page.keyboard.press('Escape');
        for (const [width, height] of [[1280, 800], [1440, 900]]) {
            await page.setViewportSize({ width, height });
            const geometry = await page.evaluate(() => {
                const rect = id => { const r = document.getElementById(id).getBoundingClientRect();
                    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height }; };
                return { map: rect('dungeon'), sidebar: rect('right_column'), dock: rect('dcss_quick_dock'), log: rect('message_pane') };
            });
            assert(geometry.map.right <= geometry.sidebar.x + 1);
            assert(geometry.dock.right <= geometry.sidebar.x + 1);
            assert(geometry.log.bottom <= height + 1 && geometry.log.height >= 60);
            evidence[width + 'x' + height] = geometry; await shot('game-' + width + 'x' + height);
        }
        assert.deepEqual(errors, []); evidence.browserErrors = errors;
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, account: evidence.account, repeatedReads: 3, turnFree: true,
            trustedData: true, nativeManagement: true, contextPreserved: true, keyboardCancel: true }));
    } catch (error) {
        console.error(error);
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify(await page.evaluate(() => ({
            packets: window.qaMenuPackets, focus: window.qaFocus?.slice(-25), active: document.activeElement.outerHTML,
            menu: document.querySelector('.menu')?.outerHTML
        })), null, 2));
        await shot('failure'); fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        console.error('Browser errors:', errors); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
