const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function verifyGroups(page, settle, output) {
    const category = id => page.locator(`.creature-category[data-category="${id}"]`);
    await page.evaluate(() => {
        const reading = { name: 'plant', perception: 'visible', energy_deficit: 10, speed: 0,
            damage_level: 0, health: 'uninjured', statuses_known: true, statuses: [] };
        window.qaState.enemy_initiative = Array.from({ length: 500 }, (_, i) => ({ ...reading, id: i + 1, x: i, y: 0 }));
        window.qaContacts = window.qaState.enemy_initiative.map(creature => ({ name: creature.name, x: creature.x, y: creature.y,
            att: 0, non_threatening: true, perception: 'visible', contact_key: 'map:' + creature.id }));
        window.qaContacts.push({ name: 'hound', x: 1, y: 1, att: 4, perception: 'visible', contact_key: 'map:hound' });
        window.modules['./enemy-initiative'].update(window.qaState);
        document.querySelector('#enemy_initiative_rail').scrollTop = 0;
    });
    await settle();
    assert.deepEqual(await page.locator('.creature-category > summary > span:first-child').allTextContents(), ['Enemies', 'Allies', 'Neutrals']);
    assert.equal(await category('neutrals').locator('.creature-count').textContent(), '500');
    assert.equal(await category('enemies').locator('.enemy-timing').count(), 0);
    assert.equal(await category('allies').locator('.enemy-timing').count(), 1);
    assert.equal(await category('neutrals').locator('.enemy-timing').count(), 0, 'Closed groups allocate no cards');
    await category('neutrals').locator('summary').click();
    await settle();
    assert.equal(await category('neutrals').locator('.enemy-timing').count(), 1, '500 identical plants share one card');
    assert.equal(await category('neutrals').locator('.creature-stack-toggle').textContent(), '×500');
    await page.screenshot({ path: path.join(output, 'creature-categories-stacked.png') });
    await category('neutrals').locator('.creature-stack-toggle').click();
    assert.equal(await category('neutrals').locator('.enemy-timing').count(), 500, 'Every individual remains reachable');
    const first = category('neutrals').locator('.enemy-timing').first();
    await first.click({ button: 'right' });
    assert.deepEqual(await page.evaluate(() => qaMenu.cell), { x: 0, y: 0 });
    const last = category('neutrals').locator('.enemy-timing').last();
    await last.click({ button: 'right' });
    assert.deepEqual(await page.evaluate(() => qaMenu.cell), { x: 499, y: 0 });
    await category('neutrals').locator('summary').click();
    await settle();
    assert.equal(await category('neutrals').locator('.enemy-timing').count(), 0);
    assert.equal(await page.evaluate(() => qaMenu.options.valid()), false, 'Collapsed targets invalidate old menus');
    await page.evaluate(() => {
        window.qaPaints = [];
        for (let i = 0; i < 30; ++i) jQuery(document).trigger('party_state_rendered', [structuredClone(window.qaState)]);
        jQuery(document).trigger('dungeon_tiles_changed', [window.qaState.enemy_initiative.map(({ x, y }) => ({ x, y }))]);
    });
    await settle();
    assert.equal(await page.evaluate(() => window.qaPaints.length), 0, 'Closed categories do not repaint during native bursts');
    assert.equal(await category('neutrals').evaluate(node => node.open), false, 'State updates preserve collapse choice');
    await category('allies').locator('summary').focus();
    await page.keyboard.press('Enter');
    await settle();
    assert.equal(await category('allies').evaluate(node => node.open), false, 'Category disclosures support keyboard activation');
    await page.evaluate(() => { qaContacts[qaContacts.length - 1].att = 0; jQuery(document).trigger('nearby_creatures_changed'); });
    await settle();
    assert.equal(await category('enemies').locator('.creature-count').textContent(), '1', 'Attitude changes move a contact between groups');
    assert.equal(await category('allies').locator('.creature-count').textContent(), '0');
    for (const viewport of [{ width: 1440, height: 320 }, { width: 768, height: 420 }, { width: 390, height: 320 }]) {
        await page.setViewportSize(viewport);
        await category('neutrals').evaluate(node => { node.open = true; });
        await settle();
        const bounds = await page.locator('#enemy_initiative_rail').boundingBox();
        assert(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, 'Cards stay inside the viewport');
        assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, 'The compact rail fits horizontally');
        await page.screenshot({ path: path.join(output, `creature-roster-${viewport.width}.png`) });
    }
    await page.evaluate(() => { qaState.enemy_initiative = []; qaContacts = []; modules['./enemy-initiative'].update(qaState); });
    await settle();
    assert.equal(await page.locator('.enemy-timing').count(), 0);
    return { plants: 500, collapsedCards: 0, stackedCards: 1, individuallyReachable: 500, keyboardCollapse: true, viewportChecks: 3 };
};
