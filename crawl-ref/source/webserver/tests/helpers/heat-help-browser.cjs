/* Exercise real card rendering, stale personal streams, help and hero changes. */
const assert = require('node:assert/strict');
const path = require('node:path');
const web = path.resolve(__dirname, '../..');
async function verify(page, output) {
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1024, height: 850 });
    await page.locator('#away').focus();
    for (const file of ['game_data/static/styles/game-layout.css', 'game_data/static/styles/tabletop-party.css'])
        await page.addStyleTag({ path: path.join(web, file) });
    await page.evaluate(() => {
        const $ = window.jQuery, noOp = () => {}, empty = () => $('<span></span>');
        window.inspections = 0;
        Object.assign(window.modules, {
            client: { is_watching: () => false, is_party_member: () => false },
            './dungeon_renderer': {}, './display': { invalidate_positions: noOp, display: noOp },
            './minimap': { fit_to: noOp, update_overlay: noOp },
            './party-inspector': { open: () => window.inspections++, render: noOp },
            './party-controls': { bind: noOp, toggle_drawer: noOp },
            './status-icons': { decorate: noOp }, './chat-context': { update: noOp },
            './party-initiative': { create: empty, update: noOp },
            './party-navigation': { create: () => [empty(), empty()], update: noOp },
            './party-card-status': { health: () => $('<div class="party-bar-wrap hp-track"><div class="party-bar-label">HP 13/13</div></div>'),
                portrait: empty, passives: empty, create: empty, activity: empty },
            './party-doom': { update: noOp }, './party-trade': { button: empty }
        });
        document.getElementById('normal').insertAdjacentHTML('beforeend',
            '<section id="party_hud" style="max-width:450px"><div id="party_hud_members"></div></section>' +
            '<div id="stats"><div id="stats_mpline" data-tip-title="Magic Points (MP): 5 / 5" data-tip-body="Ordinary MP tooltip"></div></div>');
    });
    for (const [name, file] of [
        ['dom-update', 'static/scripts/dom-update.js'],
        ['./party-model', 'game_data/static/party-model.js'],
        ['character-stat-help', 'static/scripts/character-stat-help.js'],
        ['./player-stat-tips', 'game_data/static/player-stat-tips.js'],
        ['./player-card-details', 'game_data/static/player-card-details.js'],
        ['./party', 'game_data/static/party.js']
    ]) {
        await page.evaluate(name => { window.moduleName = name; }, name);
        await page.addScriptTag({ path: path.join(web, file) });
    }
    await page.evaluate(() => {
        window.heatHero = { slot: 0, name: 'Tav', species: 'Automaton', job: 'Conjurer',
            hp: 13, hp_max: 13, mp: 5, mp_max: 5, xl: 1, alive: true, weapon: '',
            str: 8, intel: 18, dex: 13, move_aut: 10, atk_aut: 10, place: 'D:1' };
        window.renderHeat = () => window.modules['./party'].state({ members: [window.heatHero], active_slot: 0,
            controlled_slot: 0, controllable_slots: [0], multiplayer: false });
        window.renderHeat();
    });
    const meter = page.locator('.mp-track'), tip = page.locator('#dcss_rich_tooltip');
    assert.equal(await meter.getAttribute('data-tip-title'), 'Heat: 0 / 5', 'Stale native MP must not overwrite the heat card');
    assert.equal(await meter.getAttribute('aria-valuenow'), '0');
    assert.match(await page.locator('.party-heat-guidance').innerText(), /5 capacity free/);
    await meter.focus();
    assert.equal(await tip.locator('.heat-help-fill').first().evaluate(node => node.style.width), '0%');
    assert.match(await tip.innerText(), /Fully cooled/);
    await tip.screenshot({ path: path.join(output, 'heat-cooled.png') });
    await page.keyboard.press('Escape');
    for (const [remaining, expected, state] of [[3, '40%', 'warm'], [0, '100%', 'full']]) {
        await page.evaluate(remaining => { window.heatHero.mp = remaining; window.renderHeat(); }, remaining);
        await meter.focus();
        assert.equal(await meter.getAttribute('data-heat-state'), state);
        assert.equal(await tip.locator('.heat-help-fill').first().evaluate(node => node.style.width), expected);
        assert.match(await tip.innerText(), /2 heat used|5 heat used/);
        if (state === 'warm') assert.equal((await tip.locator('.heat-help').innerText()).match(/3 capacity free/g).length, 1);
        await tip.screenshot({ path: path.join(output, `heat-${state}.png`) });
        await page.locator('.party-bars').screenshot({ path: path.join(output, `heat-meter-${state}.png`) });
        await page.keyboard.press('Escape');
    }
    await meter.click();
    assert.equal(await page.evaluate(() => window.inspections), 0, 'Tapping heat opens help without opening the inspector');
    await tip.locator('.workflow-help-open').click();
    const reading = page.locator('#workflow_help_dialog[open]');
    assert.equal(await reading.locator('.heat-help').count(), 1, 'Read details preserves the diagram');
    assert.match(await reading.innerText(), /Berserk fills the meter/);
    await reading.screenshot({ path: path.join(output, 'heat-details.png') });
    await page.keyboard.press('Escape');
    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 700 });
        // Resizing intentionally dismisses previews; a tap is the narrow-screen
        // interaction and waits for the resized layout to become stable.
        await meter.click();
        await tip.waitFor({ state: 'visible' });
        assert(await tip.evaluate(node => node.scrollWidth <= node.clientWidth), 'Heat guide fits the narrow tooltip');
        assert(await tip.locator('.heat-help').evaluate(node => node.scrollWidth <= node.clientWidth));
        await tip.screenshot({ path: path.join(output, `heat-${width}.png`) });
        await page.keyboard.press('Escape');
    }
    await page.evaluate(() => {
        const player = { ...window.heatHero, int: 18, weapon_index: -1, inv: [],
            unarmed_attack: 'Unarmed', index_to_letter: () => '-', has_status: () => false };
        window.modules['./player-stat-tips'].update(player, 'Tav', 'Automaton', 'D:1');
        window.heatHero.species = 'Human'; window.heatHero.mp = 3; window.renderHeat();
    });
    assert.equal(await meter.getAttribute('data-tip-heat'), null, 'A stale Automaton stream must not change the Human meter');
    assert.equal(await page.locator('.party-heat-guidance').count(), 0);
    assert.match(await meter.getAttribute('data-tip-title'), /Magic Points/);
    await page.evaluate(() => {
        const player = { ...window.heatHero, int: 18, weapon_index: -1, inv: [],
            unarmed_attack: 'Unarmed', index_to_letter: () => '-', has_status: () => false };
        window.modules['./player-stat-tips'].update(player, 'Tav', 'Human', 'D:1');
    });
    assert.equal(await page.locator('#stats_mpline').getAttribute('data-tip-heat'), null);
    await page.evaluate(() => { window.heatHero.species = 'Automaton'; delete window.heatHero.mp; window.renderHeat(); });
    await meter.focus();
    assert.equal(await meter.getAttribute('data-heat-state'), 'unknown');
    assert.equal(await meter.getAttribute('aria-valuenow'), null);
    assert.match(await tip.innerText(), /capacity unavailable/);
    await page.keyboard.press('Escape');
    console.log('Heat card, live capacity, stale MP streams, tap/focus, persistent diagrams, unknown data and narrow layouts passed');
}
module.exports = { verify };
