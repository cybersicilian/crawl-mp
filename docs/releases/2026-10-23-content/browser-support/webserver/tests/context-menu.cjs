/* Real inventory surfaces and reusable menu input, lifecycle and freshness behavior. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const profiles = JSON.parse(fs.readFileSync(process.env.EQUIPMENT_PROFILES || '/tmp/dcss-inventory-secondary-profiles.json'));

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await require('./helpers/equipment-fixture.cjs').install(page, { Human: profiles.Human },
            process.env.EQUIPMENT_NATIVE_ROOT || path.resolve(root, '..'));
        await page.evaluate(() => {
            Object.assign(window.crawl_party.state, { inventory_use: true, inventory_secondary: true });
            window.modules.inspector.render();
        });
        const potion = profiles.Human.inventory.find(item => /potion/i.test(item.kind_name));
        const pack = page.locator('#party_item_0_' + potion.slot);
        const menu = page.getByRole('menu');
        const packetCount = () => page.evaluate(() => window.packets.length);
        const labels = () => page.getByRole('menuitem').evaluateAll(nodes => nodes.map(node => node.firstChild.textContent));
        const before = await packetCount();
        await pack.click({ button: 'right' });
        assert.deepEqual(await labels(), ['Inspect', 'Quaff', 'Drop']);
        assert.equal(await packetCount(), before, 'Opening the menu sends no gameplay command');
        assert(await menu.evaluate(node => node.matches(':popover-open')), 'Menu uses the top layer above the modal');
        await page.keyboard.press('Escape');
        assert.equal(await menu.count(), 0);
        assert(await page.locator('#party_inspector_modal').evaluate(node => node.open), 'Escape preserves the character sheet');
        assert(await pack.evaluate(node => node === document.activeElement), 'Focus returns to the item');
        assert.equal(await packetCount(), before, 'Escape is consumed before game input');

        await pack.focus(); await page.keyboard.press('Shift+F10');
        await page.keyboard.press('End'); await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.packets.at(-1)), { msg: 'inv_item_use', slot: potion.slot,
            expected_slot: 0, expected_name: potion.name, action: 'drop' });
        await page.evaluate(() => window.jQuery(document).trigger('party_state_rendered'));
        assert(await page.locator('#party_inspector_modal').evaluate(node => node.open));

        const socket = page.locator('.paperdoll-slot[data-state="equipped"]').first();
        await socket.click({ button: 'right' });
        assert((await labels()).some(label => ['Take off', 'Unwield', 'Remove'].includes(label)));
        assert(!(await labels()).includes('Drop'), 'Worn gear cannot be dropped by this menu');
        await page.getByRole('menuitem', { name: /^(Take off|Unwield|Remove)/ }).click();
        assert.equal(await page.evaluate(() => window.packets.at(-1).action), 'unequip', 'Removal uses an explicit operation, never a toggle');
        await page.evaluate(() => window.jQuery(document).trigger('party_state_rendered'));

        await pack.click({ button: 'right' });
        const staleCount = await packetCount();
        await page.evaluate(slot => {
            window.crawl_party.state.members[0].inventory.find(item => item.slot === slot).name = 'a replacement item';
        }, potion.slot);
        await page.getByRole('menuitem', { name: /^Drop/ }).click();
        assert.equal(await packetCount(), staleCount, 'An item replaced while its menu is open cannot be used');
        assert.equal(await menu.count(), 0);
        await page.evaluate(profile => {
            window.crawl_party.state.members[0].inventory = structuredClone(profile.inventory);
            window.modules.inspector.render();
        }, profiles.Human);

        // Open from a remembered hero, then switch ownership without a render.
        await pack.click({ button: 'right' });
        await page.evaluate(() => { window.crawl_party.state.controlled_slot = 1; });
        await page.getByRole('menuitem', { name: /^Quaff/ }).click();
        assert.equal(await packetCount(), staleCount);
        await page.evaluate(() => {
            window.crawl_party.state.controlled_slot = 0;
            document.getElementById('party_inspector_modal').close();
            document.body.insertAdjacentHTML('beforeend', '<button id="edge" style="position:fixed;right:0;bottom:0">Edge target</button>');
            window.modules['./context-menu'].bind(document.getElementById('edge'), () => ({ title: '<script>plain text</script>',
                entries: [{ label: 'Blocked action', disabled: 'Wait for your turn', run() { throw Error('Blocked action ran'); } },
                    { label: 'Available action', run() { window.menuActivated = true; } }] }));
        });
        await page.locator('#edge').click({ button: 'right' });
        const box = await menu.boundingBox();
        assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1000 && box.y + box.height <= 750, 'Menu fits viewport edges');
        assert.equal(await page.locator('.game-context-title').textContent(), '<script>plain text</script>');
        await page.keyboard.press('Enter');
        assert.equal(await menu.count(), 1, 'Disabled actions stay visible with their reason');
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.menuActivated), true);
        await page.locator('#edge').click({ button: 'right' });
        await page.evaluate(() => { document.getElementById('opener').onclick = () => { window.outsideActivated = true; }; });
        await page.locator('#opener').click();
        assert.equal(await page.evaluate(() => Boolean(window.outsideActivated)), false, 'Dismissal cannot click through to the game');
        await page.locator('#edge').click({ button: 'right' });
        await page.mouse.click(400, 10);
        assert.equal(await menu.count(), 0, 'Outside pointer dismisses the menu');
        await page.locator('#edge').focus(); await page.keyboard.press('Shift+F10');
        await page.keyboard.press('Tab');
        assert.equal(await menu.count(), 0, 'Tab dismisses without leaking native commands');
        await page.locator('#edge').click({ button: 'right' });
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        assert.equal(await menu.count(), 0, 'Cleanup removes open menus');
        assert.deepEqual(errors, []);
        console.log('Context menu actions, modal layering, keyboard ownership, focus, stale item/hero guards, disabled reasons, bounds and lifecycle passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
