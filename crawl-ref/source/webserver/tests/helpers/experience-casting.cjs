/* The native rule is spell level <= experience level, for both HP and MP. */
const assert = require('node:assert/strict');
const path = require('node:path');

async function verify(page, output) {
    const saved = await page.evaluate(() => structuredClone(window.crawl_party.state));
    const packets = () => page.evaluate(() => window.messages.length);
    const refresh = xl => page.evaluate(xl => {
        window.crawl_party.state.members[0].xl = xl;
        window.jQuery(document).trigger('party_state_rendered');
        return new Promise(resolve => window.requestAnimationFrame(resolve));
    }, xl);
    for (const resource of ['hp', 'mp']) {
        await page.evaluate(resource => {
            const hero = window.crawl_party.state.members[0];
            Object.assign(hero, { xl: 1, hp: 26, mp: 12, spell_resource: resource });
            hero.spells.forEach(spell => { spell.casting_cost = { resource, amount: spell.mp_cost }; });
            window.jQuery(document).trigger('party_state_rendered');
            document.getElementById('quickbar_more').open = true;
            return new Promise(resolve => window.requestAnimationFrame(resolve));
        }, resource);
        const hud = page.locator('#hud_power_0_spell_2');
        const available = page.locator('#hud_power_0_spell_1');
        const requirement = /Requires experience level 2 \(currently 1\)/;
        assert.equal(await available.getAttribute('aria-disabled'), null, 'Equal-level spells remain usable');
        assert.equal(await hud.getAttribute('aria-disabled'), 'true');
        assert.match(await hud.getAttribute('data-tip-meta'), requirement);
        await hud.focus();
        const before = await packets();
        await hud.press('Enter');
        await hud.dispatchEvent('click');
        await page.evaluate(() => {
            const hero = window.crawl_party.state.members[0];
            window.modules['./workflow-actions'].usePower(hero, hero.spells[1], 'spell');
        });
        assert.equal(await packets(), before, 'Mouse, keyboard and direct actions cannot cast above XL');
        assert(await page.locator('#hud_power_0_ability_12').isEnabled(), 'Abilities do not use spell levels');

        await page.locator('[data-quick-category="spell"]').click();
        const catalog = page.locator('#quickbar_entry_spell_2');
        assert.equal(await catalog.getAttribute('aria-disabled'), 'true');
        assert.match(await catalog.getAttribute('data-tip-meta'), requirement);
        // Keep unavailable spells assignable so they can be prepared before levelling.
        if (resource === 'hp') {
            await catalog.dispatchEvent('contextmenu');
            await page.getByRole('menuitem', { name: 'Add to quickbar' }).click();
        }
        const pinned = page.locator('#quickbar_slot_1');
        assert.equal(await pinned.getAttribute('aria-disabled'), 'true');
        assert.match(await pinned.getAttribute('data-tip-meta'), requirement);
        await pinned.dispatchEvent('click');
        assert.equal(await packets(), before, 'Pinned spells cannot bypass the experience requirement');

        await page.evaluate(() => window.modules.inspector.open(0, 'abilities'));
        assert(await page.locator('#party_spells_heading + table')
            .getByRole('button', { name: 'Cast Scorch', exact: true }).isDisabled());
        await page.evaluate(() => window.modules.picker.open('spell'));
        assert(await page.locator('#power_picker_cast_2').isDisabled());
        assert.match(await page.locator('[data-power-id="2"] .power-picker-blocked').innerText(), requirement);
        await page.keyboard.press('b');
        assert.equal(await packets(), before, 'The picker letter shortcut cannot cast above XL');
        await page.keyboard.press('Escape');
        if (resource === 'hp') await page.locator('#right_column').screenshot({
            path: path.join(output, 'experience-disabled-spells.png')
        });

        await page.evaluate(() => window.modules.picker.open('spell'));
        await refresh(2);
        assert(await page.locator('#power_picker_cast_2').isEnabled());
        await page.keyboard.press('Escape');
        assert.equal(await hud.getAttribute('aria-disabled'), null, 'XL alone refreshes sidebar availability');
        assert.equal(await pinned.getAttribute('aria-disabled'), 'false', 'XL alone refreshes pinned availability');
        await pinned.dispatchEvent('click');
        assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {
            msg: 'power_action', expected_slot: 0, id: 2, letter: 'b', kind: 'spell'
        });
        await refresh(1);
        assert.equal(await hud.getAttribute('aria-disabled'), 'true', 'Level loss disables the spell again');
        assert.equal(await pinned.getAttribute('aria-disabled'), 'true');
    }
    await page.evaluate(saved => {
        window.crawl_party.state = saved;
        window.jQuery(document).trigger('party_state_rendered');
    }, saved);
}

module.exports = { verify };
