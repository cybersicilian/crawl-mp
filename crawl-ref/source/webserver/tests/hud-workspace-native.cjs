const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Browser + native engine proof in disposable localhost accounts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8896';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.HUD_PROOF_DIR || '/tmp/dcss-hud-workspace-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.HUD_DPR || 1) });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const moduleName = suffix => page.evaluate(suffix => Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/' + suffix)), suffix);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const shot = async name => {
        await page.mouse.move(2, 2); await page.waitForTimeout(100);
        await page.screenshot({ path: path.join(output, name + '.png') });
    };
    try {
        await page.goto(url);
        evidence.account = 'WorkQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
        if (process.env.HUD_LEADER_JOB) await page.locator(".party-slot-box[data-slot='0'] .party-slot-job").selectOption(process.env.HUD_LEADER_JOB);
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await ready();
        await page.locator('#hud_inventory .hud-item-slot').first().waitFor({ state: 'visible' });
        evidence.heroes = (await state()).members.map(hero => ({ name: hero.name, job: hero.job, abilities: hero.abilities.length, spells: hero.spells.length }));
        await page.evaluate(() => {
            window.qaSent = []; const comm = require('comm'), send = comm.send_message;
            comm.send_message = function (msg, fields) { window.qaSent.push({ msg, ...fields }); return send.apply(this, arguments); };
        });
        assert.equal((await state()).inventory_use, true, 'Use the engine with native inventory support');
        const start = (await state()).world_aut_clock;
        if (process.env.HUD_ZOOM_PROOF) {
            const rendererName = await moduleName('dungeon_renderer');
            const readZoom = () => page.evaluate(name => {
                const renderer = require(name);
                return { cell: renderer.cell_width, center: { ...renderer.view_center }, rows: renderer.rows, cols: renderer.cols };
            }, rendererName);
            const initialZoom = await readZoom();
            assert.equal(await page.locator('#workflow_expedition_details > summary').textContent(), '');
            assert.equal(await page.locator('#workflow_expedition_details > summary').getAttribute('aria-label'), 'Expedition menu');
            assert(await page.locator('.workflow-action-group').evaluateAll(groups => groups.every(group => getComputedStyle(group, '::before').display === 'none')));
            await page.locator('#hud_zoom_in').click();
            const closer = await readZoom(); assert(closer.cell > initialZoom.cell);
            assert.deepEqual(closer.center, initialZoom.center);
            await page.locator('#hud_zoom_in').focus(); await page.keyboard.press('Enter');
            const keyboardZoom = await readZoom(); assert(keyboardZoom.cell > closer.cell);
            const canvas = await page.locator('#dungeon').boundingBox();
            await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
            await page.mouse.wheel(0, -100);
            await page.waitForFunction(({ name, cell }) => require(name).cell_width > cell, { name: rendererName, cell: keyboardZoom.cell });
            await shot('dungeon-zoom-200');
            const zoomed = await readZoom();
            const expected = await page.evaluate(name => {
                const renderer = require(name), rect = renderer.element.getBoundingClientRect();
                const x = Math.floor(renderer.cols / 2) + 1, y = Math.floor(renderer.rows / 2);
                return { screenX: rect.x + (x + .5) * rect.width / renderer.cols,
                    screenY: rect.y + (y + .5) * rect.height / renderer.rows,
                    x: renderer.view.x + x, y: renderer.view.y + y };
            }, rendererName);
            await page.locator('.party-ping-btn[data-ping-kind=look]').click();
            await page.mouse.click(expected.screenX, expected.screenY);
            const ping = await page.evaluate(() => window.qaSent.filter(packet => packet.msg === 'party_ping').at(-1));
            assert.equal(ping.x, expected.x); assert.equal(ping.y, expected.y);
            await page.locator('#hud_zoom_reset').click();
            assert.equal((await readZoom()).cell, initialZoom.cell);
            assert.equal((await state()).world_aut_clock, start);
            assert.equal(await page.evaluate(() => window.qaSent.filter(packet => packet.msg === 'key' || packet.msg === 'input').length), 0);
            evidence.zoom = { initialZoom, closer, keyboardZoom, zoomed, ping: { x: ping.x, y: ping.y },
                noGameTime: true, noDungeonKeyboardPackets: true, iconOnlyToolbar: true };
        }
        for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
            await page.setViewportSize({ width, height }); await page.waitForTimeout(300);
            const geometry = await page.evaluate(() => {
                const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
                return { inventory: rect('hud_inventory'), powers: rect('hud_powers'), dungeon: rect('dungeon'), log: rect('message_pane'), dock: rect('dcss_quick_dock'),
                    cards: [...document.querySelectorAll('#party_hud .party-card')].map(card => card.getBoundingClientRect().height),
                    medallions: document.querySelectorAll('.hud-hero-medallion').length,
                    slotSizes: [...document.querySelectorAll('#hud_inventory .hud-item-slot')].map(item => ({ width: item.offsetWidth, height: item.offsetHeight })),
                    overflow: document.documentElement.scrollWidth > innerWidth, canvasTransform: getComputedStyle(document.getElementById('dungeon')).transform };
            });
            evidence[width + 'x' + height] = geometry;
            assert.equal(geometry.overflow, false);
            assert.equal(geometry.canvasTransform, 'none');
            if (process.env.HUD_POLISH_PROOF) {
                assert.equal(geometry.medallions, 4);
                assert(geometry.cards.every(height => height <= 74), 'Compact healthy party cards stay within 74px');
                assert(geometry.slotSizes.every(slot => slot.width === slot.height), 'Inventory sockets stay square');
            }
            assert(geometry.inventory.right <= width + 1 && geometry.inventory.bottom <= height + 1);
            assert(geometry.inventory.y > geometry.powers.y && geometry.inventory.height > 90);
            assert(geometry.dungeon.bottom <= geometry.dock.y + 1);
            assert(geometry.log.bottom <= height + 1);
            await shot('hud-' + width + 'x' + height);
        }
        if (process.env.HUD_POLISH_PROOF) {
            await page.evaluate(() => {
                const card = document.querySelector('.party-card');
                const name = card.querySelector('.party-member-name');
                window.qaShortName = name.textContent; name.textContent = 'AlexandertheShieldBearer';
                const status = document.createElement('span'); status.className = 'party-buff-pill is-bad hud-controlled-condition';
                status.textContent = 'Poisoned'; card.querySelector('.party-buff-strip').appendChild(status);
            });
            const fit = await page.locator('.party-card').first().evaluate(card => {
                const name = card.querySelector('.party-member-name'), status = card.querySelector('.hud-controlled-condition');
                const bounds = card.getBoundingClientRect(), pill = status.getBoundingClientRect();
                return name.scrollWidth <= name.clientWidth + 1 && pill.height > 0 && pill.bottom <= bounds.bottom;
            });
            assert(fit, 'Long names and harmful conditions remain visible in compact mode');
            await shot('controlled-long-name-condition');
            await page.evaluate(() => {
                document.querySelector('.party-member-name').textContent = window.qaShortName;
                document.querySelector('.hud-controlled-condition').remove();
            });
            evidence.controlledPresentation = 'Long name and harmful-status DOM fixture; no claim of native poisoning';
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('[data-item-filter=equipped]').click();
        assert.equal(await page.locator('#hud_inventory .hud-item-slot:not(.is-equipped)').count(), 0);
        await page.locator('[data-item-filter=all]').click();
        if (process.env.HUD_POLISH_PROOF) {
            await page.getByRole('button', { name: 'Inspect Lyra', exact: true }).focus();
            await page.keyboard.press('Enter');
            await page.locator('#party_inspector_modal[open]').waitFor();
            assert.equal(await page.evaluate(() => window.crawl_party.inspector_slot), 1);
            await page.keyboard.press('Escape'); await ready();
            assert.equal((await state()).world_aut_clock, start);
        }
        const hero = (await state()).members[0];
        assert.equal(await page.locator('#hud_inventory .hud-item-slot').count(), hero.inventory.length);
        const item = hero.inventory[0];
        await page.locator('#hud_item_0_' + item.slot).hover();
        await page.waitForFunction(name => document.querySelector('#dcss_rich_tooltip .dcss-tip-title')?.textContent.includes(name), item.name);
        await shot('inventory-tooltip');
        await page.locator('#hud_item_0_' + item.slot).click({ button: 'right' });
        await page.locator('#ui-stack .describe-item').waitFor({ state: 'visible' });
        await shot('native-item-actions');
        await page.keyboard.press('Escape'); await ready();
        assert.equal((await state()).world_aut_clock, start, 'Filtering and inspection take no turn');

        // Encountered entity links use actual map-knowledge decoding, including compact x/y deltas.
        await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/map_knowledge'));
            require(name).merge([{ x: 200, y: 200, mon: { id: 90101, name: 'jackal', plural: 'jackals', threat: 0, typedata: { avghp: 5 } } },
                { mon: { id: 90102, name: 'adder', plural: 'adders', threat: 2, typedata: { avghp: 11 } } }]);
            require('comm').handle_message({ msg: 'msgs', messages: [{ text: 'The jackal is moderately wounded. The adder is poisoned.' }] });
        });
        await page.locator('#messages .dcss-term', { hasText: 'jackal' }).last().hover();
        await page.waitForFunction(() => [...document.querySelectorAll('.dcss-nested-tip')].some(tip => tip.textContent.includes('Typical health: 5')));
        await shot('message-creature-tooltip');
        assert(await page.locator('#messages .dcss-term', { hasText: 'adder' }).count());
        assert(await page.locator('#messages .dcss-term', { hasText: 'poisoned' }).count());
        evidence.logReferences = 'Controlled decoded map data + native message handler; no fabricated creature combat';

        await page.locator('#hud_layout_toggle').click();
        const handle = page.getByRole('button', { name: 'Move Inventory', exact: true });
        const before = await page.locator('#hud_inventory').boundingBox();
        const from = await handle.boundingBox();
        await page.mouse.move(from.x + 10, from.y + 10); await page.mouse.down();
        await page.mouse.move(620, 360, { steps: 8 }); await page.mouse.up();
        assert(await page.locator('#hud_inventory').evaluate(node => node.classList.contains('hud-floating')));
        const moved = await page.locator('#hud_inventory').boundingBox();
        assert(Math.abs(moved.x - before.x) > 100);
        const resize = page.getByRole('button', { name: 'Resize Inventory', exact: true });
        await resize.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
        const resized = await page.locator('#hud_inventory').boundingBox();
        assert(resized.width > moved.width && resized.height > moved.height);
        assert.equal((await state()).world_aut_clock, start, 'Panel keyboard controls never enter the dungeon');
        // Stats width survives a native reflow; a floating log releases its former space.
        const statsMove = page.getByRole('button', { name: 'Move Hero stats', exact: true });
        await statsMove.focus(); await page.keyboard.press('ArrowLeft');
        const statsSize = await page.locator('#stats').boundingBox();
        const statsResize = page.getByRole('button', { name: 'Resize Hero stats', exact: true });
        await statsResize.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
        const statsAfter = await page.locator('#stats').boundingBox();
        assert(statsAfter.width > statsSize.width, JSON.stringify({ statsSize, statsAfter, css: await page.locator('#stats').getAttribute('style'), saved: await page.evaluate(() => localStorage.getItem('dcss.hud.workspace.v1')) }));
        const logMove = page.getByRole('button', { name: 'Move Message log', exact: true });
        await logMove.focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
        assert(await page.locator('#message_pane').evaluate(node => node.classList.contains('hud-floating')));
        await shot('custom-layout');
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        const finalInventorySize = await page.locator('#hud_inventory').boundingBox();
        const saved = await page.evaluate(() => localStorage.getItem('dcss.hud.workspace.v1'));
        assert(saved.includes('hud_inventory'));
        const workspace = await moduleName('panel-workspace');
        await page.evaluate(name => require(name).init(), workspace);
        assert.deepEqual(await page.locator('#hud_inventory').boundingBox(), finalInventorySize, 'Saved geometry restores');
        await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(300);
        const bounded = await page.locator('#hud_inventory').boundingBox();
        assert(bounded.x >= 0 && bounded.y >= 0 && bounded.x + bounded.width <= 1024 && bounded.y + bounded.height <= 768);
        await page.keyboard.press('Alt+l');
        await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
        assert.equal(await page.locator('.hud-floating').count(), 0);
        await page.getByRole('button', { name: 'Done', exact: true }).click();

        // Stale identities cannot use a different item or another hero's pack.
        await page.evaluate(() => {
            window.qaUseErrors = [];
            const comm = require('comm'), receive = comm.handle_message;
            comm.handle_message = function (packet) { if (packet.msg === 'game_action_error') window.qaUseErrors.push(packet); return receive.apply(this, arguments); };
            comm.send_message('inv_item_use', { slot: 0, expected_slot: 0, expected_name: 'stale name' });
        });
        await page.waitForFunction(() => window.qaUseErrors.length === 1);
        assert.equal((await state()).world_aut_clock, start);
        // Native equipment toggle uses the same routine as DCSS tile inventory.
        const equipped = (await state()).members[0].inventory.find(item => item.equipped && item.slot === 0);
        if (equipped) {
            await page.locator('#hud_item_0_' + equipped.slot).click();
            await page.waitForFunction(slot => !window.crawl_party.state.members[0].inventory.find(item => item.slot === slot).equipped, equipped.slot);
            await ready();
            await page.locator('#hud_item_0_' + equipped.slot).click();
            await page.waitForFunction(slot => window.crawl_party.state.members[0].inventory.find(item => item.slot === slot).equipped, equipped.slot);
            await ready(); evidence.equipmentToggle = true;
        }
        // Direct consumables update quantity in place through native item use.
        const consumable = await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/player'));
            const hero = window.crawl_party.state.members[0];
            return hero.inventory.find(item => /potion of might|potions of might/.test(item.name));
        });
        if (consumable) {
            await page.locator('#hud_item_0_' + consumable.slot).click();
            await page.waitForFunction(({ slot, qty }) => (window.crawl_party.state.members[0].inventory.find(item => item.slot === slot)?.qty || 0) < qty, consumable);
            await ready();
            evidence.consumable = { name: consumable.name, nativeQuantityChanged: true };
        }

        // Powers come from native hero snapshots; exercise the real spell target/cost flow if present.
        const caster = (await state()).members.find(member => member.spells.length || member.abilities.length);
        if (caster) {
            await page.evaluate(slot => require('comm').send_message('switch_player', { slot }), caster.slot);
            await page.waitForFunction(slot => window.crawl_party.state.controlled_slot === slot, caster.slot); await ready();
            const power = caster.spells[0] || caster.abilities.find(entry => /berserk/i.test(entry.name))
                || caster.abilities.find(entry => !/renounce/i.test(entry.name));
            assert(power, 'Choose an active ability rather than the religion-management prompt');
            const kind = caster.spells.length ? 'spell' : 'ability';
            const button = page.locator('#hud_power_' + caster.slot + '_' + kind + '_' + power.id);
            await button.hover();
            await page.waitForFunction(name => document.querySelector('#dcss_rich_tooltip .dcss-tip-title')?.textContent.includes(name), power.name);
            await shot('power-tooltip');
            const count = await page.evaluate(() => window.qaSent.filter(packet => packet.msg === 'power_action').length);
            const powerClock = (await state()).world_aut_clock;
            await button.click();
            assert.equal(await page.evaluate(() => window.qaSent.filter(packet => packet.msg === 'power_action').length), count + 1);
            await page.waitForTimeout(250);
            if (kind === 'ability') {
                await page.waitForFunction(clock => window.crawl_party.state.world_aut_clock > clock, powerClock);
                assert((await state()).world_aut_clock > powerClock, 'The native ability advances game time');
                evidence.abilityStatuses = (await state()).members[caster.slot].statuses.map(status => status.text);
                if (/berserk/i.test(power.name)) assert(evidence.abilityStatuses.some(status => /berserk/i.test(status)));
            }
            await page.keyboard.press('Escape');
            evidence.nativePower = { kind, name: power.name };
        }
        evidence.errors = errors; assert.deepEqual(errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) { await shot('failure'); console.error('Browser errors:', errors); throw error; }
    finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
