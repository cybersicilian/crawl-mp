/* Reused inside the four-owner world probe; no extra game or browser phase. */
const { assert, key, state, lua, waitTurn, ready } = require('./multiplayer-native-client.cjs');
const path = require('node:path');
async function verifyBanners(host, guest, output, check) {
    const page = host.page, before = await state(page);
    const enemy = before.enemy_initiative.find(entry => entry.x === 29 && entry.y === 18);
    assert(enemy && enemy.perception === 'visible', 'Visible native orc has a banner');
    assert(Number.isInteger(enemy.damage_level));
    const banner = page.locator(`.enemy-timing[data-enemy-id="${enemy.id}"]`);
    await banner.waitFor({ state: 'visible' });
    assert.equal(await banner.locator('canvas').count(), 1);
    await page.waitForFunction(id => {
        const canvas = document.querySelector(`.enemy-timing[data-enemy-id="${id}"] canvas`);
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const colours = new Set();
        for (let i = 0; i < pixels.length; i += 4) colours.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        return colours.size > 3;
    }, enemy.id);
    for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(() => {
            const rail = document.querySelector('#enemy_initiative_rail').getBoundingClientRect();
            const doom = document.querySelector('#party_doom_meter').getBoundingClientRect();
            return rail.width > 0 && rail.height > 0 && doom.width > 0 && doom.height > 0
                && rail.left >= 0 && rail.right <= window.innerWidth
                && (rail.right <= doom.left || rail.left >= doom.right
                    || rail.bottom <= doom.top || rail.top >= doom.bottom);
        });
        await page.screenshot({ path: path.join(output, `enemy-banners-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const turns = (await state(page)).members[0].turns;
    await banner.hover();
    assert(await page.evaluate(({ x, y }) => {
        const names = Object.keys(require.s.contexts._.defined);
        const view = require(names.find(name => name.endsWith('/view_data')));
        const enums = require(names.find(name => name.endsWith('/enums')));
        const cursor = view.cursor_locs[enums.CURSOR_MOUSE];
        return cursor && cursor.x === x && cursor.y === y;
    }, enemy), 'Hover uses the dungeon reticle');
    await banner.click({ button: 'right' });
    const menu = page.locator('.game-context-menu');
    assert.match(await menu.getAttribute('aria-label'), /orc/i);
    await menu.getByRole('menuitem', { name: /^Inspect/ }).click();
    await page.locator('#ui-stack > *').first().waitFor();
    for (let attempt = 0; attempt < 5 && await page.locator('#ui-stack > *').count(); ++attempt)
        await page.keyboard.press('Escape');
    await ready(page);
    assert.equal((await state(page)).members[0].turns, turns, 'Hover, menu and inspect do not take a turn');
    assert(!(await state(guest.page)).enemy_initiative.some(entry => entry.id === enemy.id));
    await lua(host, 'qa_banner_orc=assert(dgn.mons_at(29,18)); qa_banner_orc.set_max_hp(100); qa_banner_orc.set_hp(35); crawl.redraw_view()');
    await page.waitForFunction(id => window.crawl_party.state.enemy_initiative
        .some(entry => entry.id === id && entry.damage_level === 4), enemy.id);
    assert.equal(await banner.locator('.enemy-health-track i').evaluate(node => node.style.width), '30%');
    await lua(host, 'qa_banner_orc.add_ench("haste",10000); qa_banner_orc.add_ench("confusion",10000); crawl.redraw_view()');
    await page.waitForFunction(id => {
        const enemy = window.crawl_party.state.enemy_initiative.find(entry => entry.id === id);
        return enemy.statuses_known === true && enemy.statuses.some(effect => effect.text === 'fast' && effect.is_bad === false)
            && enemy.statuses.some(effect => effect.text === 'confused' && effect.is_bad === true);
    }, enemy.id);
    assert.equal(await banner.locator('.party-effect.is-active[data-tip-title="fast"] .tt-icon').count(), 1);
    assert.equal(await banner.locator('.party-effect.is-bad[data-tip-title="confused"] .tt-icon').count(), 1);
    assert.equal(await banner.locator('.party-effect.is-bad[data-tip-title="confused"] .party-effect-warning').count(), 1);
    assert.equal(await banner.locator('.party-effect[tabindex]').count(), 0, 'Banner effects never nest focus targets inside a button');
    await page.screenshot({ path: path.join(output, 'enemy-banners-buffs-debuffs.png') });
    // Give the engine one ordinary player action to record actual visibility.
    const tick = await state(page);
    await key(page, 46); await waitTurn(host, tick.members[0].turns);
    await lua(host, 'qa_banner_orc=assert(dgn.mons_at(29,18)); qa_banner_orc.add_ench("invis",10000); crawl.redraw_view()');
    await page.waitForFunction(id => window.crawl_party.state.enemy_initiative
        .some(entry => entry.id === id && entry.perception === 'last_known'), enemy.id);
    const contact = (await state(page)).enemy_initiative.find(entry => entry.id === enemy.id);
    assert.equal(contact.x, 29); assert.equal(contact.y, 18);
    assert.equal(contact.damage_level, undefined);
    assert.equal(contact.energy_deficit, undefined);
    assert.equal(contact.speed, undefined);
    assert.equal(contact.statuses, undefined);
    assert.equal(contact.statuses_known, undefined);
    assert.equal(await banner.locator('.party-effect').count(), 0, 'Invisible memories expose no live effect icons');
    assert.equal(await banner.locator('.enemy-health-track').getAttribute('data-known'), 'false');
    assert.equal(await banner.locator('.enemy-timing-track').getAttribute('data-known'), 'false');
    assert.match(await banner.locator('small').innerText(), /Last known/);
    assert(!(await state(guest.page)).enemy_initiative.some(entry => entry.id === enemy.id),
        'Another owner never receives the invisible hint');
    await banner.click({ button: 'right' });
    assert.match(await menu.getAttribute('aria-label'), /Last known location/);
    await page.keyboard.press('Escape');
    await lua(host, 'qa_banner_orc.del_ench("invis"); crawl.redraw_view()');
    await page.waitForFunction(id => window.crawl_party.state.enemy_initiative
        .some(entry => entry.id === id && entry.perception === 'visible'), enemy.id);
    await lua(host, 'qa_banner_orc.del_ench("haste"); qa_banner_orc.del_ench("confusion"); crawl.redraw_view()');
    await page.waitForFunction(id => {
        const enemy = window.crawl_party.state.enemy_initiative.find(entry => entry.id === id);
        return enemy.statuses_known === true && !enemy.statuses.some(effect => effect.text === 'fast' || effect.text === 'confused');
    }, enemy.id);
    assert.equal(await banner.locator('.party-effect[data-tip-title="fast"], .party-effect[data-tip-title="confused"]').count(), 0);
    check('Visible enemy buffs and debuffs use player icons and clear on expiry or invisibility');
    check('Native mob banners fit Zot, target by hover, inspect without a turn and filter invisible contacts', { enemy, contact });
}
module.exports = { verifyBanners };
