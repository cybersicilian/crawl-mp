/* Continue the folio fixture through the real HUD and quick action renderers. */
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
async function verify(page) {
    await page.evaluate(() => {
        document.body.insertAdjacentHTML('beforeend', '<div id="right_column"></div>');
        window.modules['./player'] = { inv: [] };
    });
    for (const [name, file] of [
        ['./frame-update', 'frame-update.js'],
        ['./hud-inventory', 'hud-inventory.js'], ['./quickbar-model', 'quickbar-model.js'],
        ['./quickbar-commands', 'quickbar-commands.js'], ['./quickbar', 'quickbar.js']
    ]) {
        await page.evaluate(name => { window.moduleName = name; }, name);
        await page.addScriptTag({ path: path.join(root, 'game_data/static', file) });
    }
    await page.evaluate(() => {
        window.modules['./hud-inventory'].init(); window.modules['./quickbar'].init();
        document.getElementById('quickbar_more').open = true;
    });
    const hud = page.locator('#hud_power_0_spell_1');
    assert.equal(await hud.getAttribute('aria-disabled'), 'true');
    assert.equal(await hud.locator('.hud-power-cost').innerText(), '1 HP');
    assert.match(await hud.getAttribute('data-tip-meta'), /Cost: 1 HP/);
    await page.locator('[data-quick-category="spell"]').click();
    await page.locator('#quickbar_entry_spell_1').dispatchEvent('contextmenu');
    await page.getByRole('menuitem', { name: 'Add to quickbar' }).click();
    const pinned = page.locator('#quickbar_slot_0');
    assert.equal(await pinned.locator('.quickbar-quantity').innerText(), '1 HP');
    assert.equal(await pinned.getAttribute('aria-disabled'), 'true');
    await page.evaluate(() => {
        window.crawl_party.state.members[0].hp = 3;
        window.jQuery(document).trigger('party_state_rendered');
    });
    await page.waitForFunction(() => document.getElementById('hud_power_0_spell_1').getAttribute('aria-disabled') !== 'true');
    assert.equal(await hud.getAttribute('aria-disabled'), null);
    assert.equal(await pinned.getAttribute('aria-disabled'), 'false');
    await pinned.dispatchEvent('click');
    assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {
        msg: 'power_action', expected_slot: 0, id: 1, letter: 'a', kind: 'spell'
    });
    await page.evaluate(() => {
        window.crawl_party.state.members[0].hp = 1;
        window.jQuery(document).trigger('party_state_rendered');
    });
    await page.waitForFunction(() => document.getElementById('quickbar_slot_0').getAttribute('aria-disabled') === 'true');
    assert.equal(await pinned.getAttribute('aria-disabled'), 'true');
    const count = await page.evaluate(() => window.messages.length);
    await pinned.dispatchEvent('click');
    assert.equal(await page.evaluate(() => window.messages.length), count, 'Low HP cannot dispatch a pinned spell');
}
module.exports = { verify };
