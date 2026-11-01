/* Component regression: real HTML modal ownership, without a game or account. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function externalDialogs(page, output) {
    const menu = page.locator('dialog.first-person-menu[open]');
    assert.equal(await menu.count(), 0);
    const before = await page.evaluate(() => ({ position: { ...fixture.player.pos },
        actions: fixture.sent.filter(message => ['key', 'input', 'click_cell', 'inv_item_action',
            'inv_item_use', 'floor_item_action', 'power_action', 'party_activity'].includes(message.type)).length }));
    async function openForeign() {
        await page.evaluate(() => {
            const dialog = document.createElement('dialog');
            dialog.id = 'first_person_external_dialog_fixture';
            const button = document.createElement('button');
            button.textContent = 'Done with fixture'; dialog.append(button);
            ['keydown', 'keypress', 'keyup'].forEach(type => {
                dialog.addEventListener(type, event => event.stopPropagation());
            });
            document.body.append(dialog); dialog.showModal(); button.focus();
        });
    }
    async function removeForeign() {
        await page.evaluate(() => document.getElementById('first_person_external_dialog_fixture')?.remove());
    }
    const foreign = page.locator('#first_person_external_dialog_fixture');
    try {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const settings = page.locator('#settings_dialog');
        await settings.waitFor({ state: 'visible' });
        await settings.locator('#rc_settings_close').focus();
        await page.keyboard.press('Alt+i');
        assert.equal(await settings.evaluate(node => node.open), true);
        assert.equal(await menu.count(), 0, 'Settings keeps focus over the 3D inventory shortcut');
        await page.keyboard.press('Escape');
        assert.equal(await settings.evaluate(node => node.open), false);
        assert.equal(await menu.count(), 0, 'Settings Escape must not open inventory');
        assert.equal(await page.locator('#first_person_dungeon').evaluate(node => node === document.activeElement), true);

        await openForeign();
        await page.keyboard.press('Alt+i');
        assert.equal(await foreign.evaluate(node => node.open), true);
        assert.equal(await menu.count(), 0, 'Inventory cannot open over another modal');
        await page.keyboard.press('Escape');
        assert.equal(await foreign.evaluate(node => node.open), false, 'Escape belongs to the foreign dialog');
        assert.equal(await menu.count(), 0);
        await removeForeign();

        await page.getByRole('button', { name: 'Inventory', exact: true }).click();
        assert.equal(await menu.getAttribute('data-section'), 'inventory');
        await openForeign();
        await page.keyboard.press('Alt+m');
        assert.equal(await menu.getAttribute('data-section'), 'inventory', 'A covered menu cannot switch sections');
        await page.keyboard.press('Escape');
        assert.equal(await foreign.evaluate(node => node.open), false);
        assert.equal(await menu.count(), 1, 'Foreign Escape cannot close the underlying inventory');
        await removeForeign();
        await page.keyboard.press('Escape');
        assert.equal(await menu.count(), 0);

        await page.evaluate(() => {
            let stack = document.getElementById('ui-stack');
            if (!stack) {
                stack = document.createElement('div'); stack.id = 'ui-stack';
                stack.dataset.externalDialogFixture = 'true'; document.body.append(stack);
            }
            const popup = document.createElement('div');
            popup.id = 'first_person_native_popup_fixture'; stack.append(popup);
        });
        await page.locator('#first_person_dungeon').focus();
        await page.keyboard.press('Alt+i');
        assert.equal(await menu.count(), 0, 'A native popup also retains input ownership');
        const after = await page.evaluate(() => ({ position: { ...fixture.player.pos },
            actions: fixture.sent.filter(message => ['key', 'input', 'click_cell', 'inv_item_action',
                'inv_item_use', 'floor_item_action', 'power_action', 'party_activity'].includes(message.type)).length }));
        assert.deepEqual(after, before, 'Modal navigation emits no native action or position change');
        fs.writeFileSync(path.join(output, 'external-dialog-ownership.json'), JSON.stringify({
            passed: true, scope: 'HTML dialog and native-popup component input ownership; no native game run'
        }, null, 2) + '\n');
    } finally {
        await page.evaluate(() => {
            const dialog = document.getElementById('first_person_external_dialog_fixture');
            if (dialog?.open) dialog.close(); dialog?.remove();
            document.getElementById('first_person_native_popup_fixture')?.remove();
            const stack = document.getElementById('ui-stack');
            if (stack?.dataset.externalDialogFixture === 'true') stack.remove();
        });
    }
};
