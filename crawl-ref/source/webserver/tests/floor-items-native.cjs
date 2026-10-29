const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Authoritative ground stacks, direct pickup, inspection and hero context. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8888';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.FLOOR_ITEMS_PROOF_DIR || '/tmp/dcss-floor-items-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
        deviceScaleFactor: Number(process.env.FLOOR_ITEMS_DPR || 1),
        hasTouch: process.env.FLOOR_ITEMS_DPR === '2' });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = { account: 'GroundQA' + Date.now().toString().slice(-8), cases: [], layouts: [] };
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const key = value => page.evaluate(value => require('comm').send_message('key', { keycode: value.charCodeAt(0) }), value);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const item = name => page.locator('#hud_floor_items .floor-item').filter({ hasText: name });
    const waitFloor = count => page.waitForFunction(count =>
        window.crawl_party.state.members[0].floor_items?.length === count, count);
    async function switchHero(slot) {
        await page.evaluate(slot => require('comm').send_message('switch_player', { slot }), slot);
        await page.waitForFunction(slot => window.crawl_party.state.controlled_slot === slot, slot);
        await ready();
        await page.waitForFunction(slot => document.getElementById('hud_floor_items').getAttribute('aria-label')
            .includes(window.crawl_party.state.members[slot].name), slot);
    }
    async function drop(stacks) {
        const hero = (await state()).members[0];
        await key('d'); await page.locator('.menu_inventory').waitFor();
        for (const name of stacks) {
            await key(hero.inventory.find(entry => entry.name.includes(name)).letter);
            await page.waitForFunction(name => [...document.querySelectorAll('#ui-stack li.selectable')]
                .some(row => row.textContent.includes(name) && /[+#]/.test(window.jQuery(row).data('item').text)), name);
        }
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('Enter');
        await page.locator('#ui-stack > *').waitFor({ state: 'detached' }); await ready();
        await waitFloor(stacks.length);
    }
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-species').selectOption('Human');
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-job').selectOption('Brigand');
        await page.locator('.party-slot-box[data-slot="1"] [data-mode="companion"]').click();
        for (let slot = 2; slot < 4; slot++) await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 240000 });
        await ready();
        assert.equal((await state()).floor_item_actions, true, 'Fresh native snapshot supports floor actions');
        await page.locator('#hud_floor_items').waitFor();
        const stacks = ['poison', 'curare'];
        const initial = (await state()).members[0].inventory;
        evidence.initial = stacks.map(name => ({ name, qty: initial.find(entry => entry.name.includes(name)).qty }));
        await drop(stacks);
        await item(stacks[0]).waitFor();
        assert.equal(await page.locator('#hud_floor_items .floor-item canvas').count(), 2, 'Native item artwork');
        for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(200);
            const layout = await page.evaluate(() => {
                const rect = id => {
                    const r = document.getElementById(id).getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
                };
                return { tray: rect('hud_floor_items'), log: rect('message_pane'), map: rect('hud_bottom_map'),
                    buttons: [...document.querySelectorAll('.floor-item')].map(button => {
                        const r = button.getBoundingClientRect(); return { right: r.right, bottom: r.bottom };
                    }) };
            });
            assert(layout.tray.right <= width && layout.tray.bottom <= height);
            assert(layout.log.right <= layout.tray.x + 1 && layout.log.width > 150, 'Log stays usable');
            assert(layout.buttons.every(button => button.right <= layout.tray.right && button.bottom <= layout.tray.bottom));
            evidence.layouts.push({ width, height, ...layout });
            await page.mouse.move(2, 2);
            await page.screenshot({ path: path.join(out, `ground-${width}.png`) });
            if (width === 1280) await page.locator('#hud_bottom_row').screenshot({ path: path.join(out, 'ground-footer.png') });
        }
        const clock = (await state()).world_aut_clock;
        await item(stacks[0]).click({ button: 'right' });
        await page.getByRole('menuitem', { name: /^Inspect/ }).click();
        await page.locator('#ui-stack > *').waitFor();
        assert.equal((await state()).world_aut_clock, clock, 'Inspection uses no turn');
        await page.keyboard.press('Escape');
        await page.locator('#ui-stack > *').waitFor({ state: 'detached' }); await ready();
        evidence.cases.push('native floor item inspection uses no turn');

        const original = (await state()).members[0];
        const floor = original.floor_items[0];
        const packet = { id: floor.id, expected_slot: 0, expected_name: floor.name, expected_qty: floor.qty,
            expected_place: original.place, x: original.pos.x, y: original.pos.y, inspect: false };
        for (const override of [{ expected_qty: floor.qty + 1 }, { x: original.pos.x + 1 }, { expected_place: 'wrong floor' }]) {
            await page.evaluate(packet => require('comm').send_message('floor_item_action', packet), { ...packet, ...override });
            await page.locator('#workflow_action_notice').filter({ hasText: 'ground items changed' }).waitFor();
            await waitFloor(2);
            assert.equal((await state()).world_aut_clock, clock);
            await page.evaluate(() => document.getElementById('workflow_action_notice').remove());
        }
        evidence.cases.push('stale quantities, positions and floors reject without spending time');
        assert.notDeepEqual((await state()).members[1].pos, original.pos, 'Companion starts on another tile');
        await switchHero(1);
        assert.equal(await page.locator('#hud_floor_items .floor-item').count(), 0);
        await switchHero(0);
        await item(stacks[0]).waitFor();
        assert.equal((await state()).world_aut_clock, clock, 'Switching and reading ground items uses no time');
        evidence.cases.push('tray follows the controlled hero without leaking another tile');

        await item(stacks[0]).focus(); await page.keyboard.press('Enter');
        await waitFloor(1); await ready();
        await page.waitForFunction(clock => window.crawl_party.state.world_aut_clock > clock, clock);
        const afterOne = (await state()).members[0];
        assert.equal(afterOne.inventory.find(entry => entry.name.includes(stacks[0])).qty, evidence.initial[0].qty);
        assert(!afterOne.inventory.some(entry => entry.name.includes(stacks[1])));
        assert((await state()).world_aut_clock > clock);
        assert(await item(stacks[1]).evaluate(button => button === document.activeElement), 'Focus moves to the remaining stack');
        evidence.cases.push('focused Enter picks exactly one native stack and advances time');
        await item(stacks[1]).click(); await waitFloor(0); await ready();
        assert.equal((await state()).members[0].inventory.find(entry => entry.name.includes(stacks[1])).qty, evidence.initial[1].qty);
        await page.locator('.floor-items-empty').filter({ hasText: 'Nothing to pick up' }).waitFor();
        evidence.cases.push('pointer pickup removes the stack and shows the empty tile');

        await drop(stacks);
        await page.locator('.floor-pickup-menu').click();
        await page.locator('.menu_pickup').waitFor();
        await page.waitForFunction(() => document.querySelectorAll('#hud_floor_items .floor-item[aria-disabled="true"]').length === 2);
        await page.keyboard.press('Escape'); await ready();
        evidence.cases.push('Pickup shortcut opens the native multi-item menu and guards the tray while it is open');
        assert.deepEqual(errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
