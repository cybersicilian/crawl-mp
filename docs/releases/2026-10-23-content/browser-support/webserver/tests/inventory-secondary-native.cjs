const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real Shift-click transitions in a disposable localhost expedition. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8926';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.INVENTORY_PROOF_DIR || '/tmp/dcss-inventory-secondary-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const open = async () => {
        await ready();
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
        await page.locator('#party_inspector_modal[open]').waitFor();
    };
    const waitUnequipped = slot => page.waitForFunction(slot =>
        window.crawl_party.state.members[0].inventory.some(item => item.slot === slot && !item.equipped), slot);
    const waitDropped = slot => page.waitForFunction(slot =>
        !window.crawl_party.state.members[0].inventory.some(item => item.slot === slot), slot);
    try {
        await page.goto(url);
        evidence.account = 'ShiftQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        const leader = page.locator('.party-slot-box[data-slot="0"]');
        await leader.locator('.party-slot-species').selectOption('Human');
        await leader.locator('.party-slot-job').selectOption('Fighter');
        await leader.locator('.party-slot-weapon').selectOption('war axe');
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1, null, { timeout: 120000 });
        await ready();
        assert.equal((await state()).inventory_secondary, true);
        await page.evaluate(() => {
            window.actionErrors = [];
            window.jQuery(document).on('game_action_error.shiftQA', (event, data) => window.actionErrors.push(data.message));
        });
        const before = await state(), hero = before.members[0];
        evidence.startElapsed = hero.elapsed_aut;
        const weapon = hero.inventory.find(item => item.equipped && /Weapon/i.test(item.kind_name));
        assert(weapon, 'Fighter must start with the requested wielded axe');
        await open();
        await page.locator('#party_inventory_search').fill('axe');
        await page.locator('[data-equip-slot="weapon:0"]').click({ modifiers: ['Shift'] });
        await waitUnequipped(weapon.slot);
        await page.waitForFunction(clock => window.crawl_party.state.members[0].elapsed_aut > clock, hero.elapsed_aut);
        await page.locator('#party_inspector_modal[open]').waitFor();
        await ready();
        assert.equal(await page.locator('#party_inventory_search').inputValue(), 'axe');
        let current = await state();
        assert(current.members[0].elapsed_aut > hero.elapsed_aut, 'Unequipping spends native time');
        assert.equal(current.members[0].floor_items.length, hero.floor_items.length, 'Unequip keeps the weapon in the pack');

        // Reject an old remove request instead of toggling it back on.
        await page.evaluate(item => require('comm').send_message('inv_item_use', {
            slot: item.slot, expected_slot: 0, expected_name: item.name, action: 'unequip'
        }), weapon);
        await page.waitForFunction(() => window.actionErrors.length === 1);
        assert.match(await page.evaluate(() => window.actionErrors[0]), /equipment changed/);
        assert.equal((await state()).members[0].inventory.find(item => item.slot === weapon.slot).equipped, false);

        await page.locator('#party_item_0_' + weapon.slot).click({ modifiers: ['Shift'] });
        await waitDropped(weapon.slot);
        await page.locator('#party_inspector_modal[open]').waitFor();
        await ready();
        current = await state();
        assert(current.members[0].floor_items.some(item => item.name.includes('war axe')), 'The dropped axe is on this tile');
        assert.equal(await page.locator('#party_inventory_search').inputValue(), 'axe');
        evidence.weapon = { unequipped: true, droppedToFloor: true, searchRetained: true, staleRemoveRejected: true };

        const armour = current.members[0].inventory.find(item => item.equipped && /scale mail/.test(item.name));
        assert(armour);
        await page.locator('#party_inspector_close_btn').click();
        // A drop request for still-worn armour must not invoke native auto-unequip/drop.
        await page.evaluate(item => require('comm').send_message('inv_item_use', {
            slot: item.slot, expected_slot: 0, expected_name: item.name, action: 'drop'
        }), armour);
        await page.waitForFunction(() => window.actionErrors.length === 2);
        assert.equal((await state()).members[0].inventory.find(item => item.slot === armour.slot).equipped, true);
        await page.locator('#hud_item_0_' + armour.slot).click({ modifiers: ['Shift'] });
        await waitUnequipped(armour.slot); await ready();
        assert((await state()).members[0].inventory.some(item => item.slot === armour.slot), 'Delayed armour removal keeps it in the pack');
        await page.locator('#hud_item_0_' + armour.slot).click({ modifiers: ['Shift'] });
        await waitDropped(armour.slot); await ready();
        assert((await state()).members[0].floor_items.some(item => item.name.includes('scale mail')));
        evidence.armour = { nativeDelay: true, hudUnequip: true, hudDrop: true, staleDropRejected: true };
        evidence.errors = errors;
        assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(out, 'dropped-items.png') });
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ passed: true, ...evidence, out }));
    } catch (error) {
        fs.writeFileSync(path.join(out, 'failure-state.json'), JSON.stringify({ evidence, state: await state().catch(() => null) }, null, 2));
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText().catch(() => ''));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
