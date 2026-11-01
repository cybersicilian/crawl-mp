/* Remaining tutorial rules, each observed from actual native state in disposable games. */
const crypto = require('node:crypto');
const { assert, chromium, clientAs, send, key, state, ready, lua, named } = require('./multiplayer-native-client.cjs');
const { clear, wizard, promptLua } = require('./helpers/native-wizard.cjs');
const { createLiveRuleProof } = require('./helpers/live-rule-proof.cjs');
const url = process.env.WEBTILES_URL;
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const proof = createLiveRuleProof({ name: 'additional', output: process.env.TIPS_PROOF_DIR,
    read: page => named(page, 'tutorial-tips', 'module.fits()'),
    capture: page => page.evaluate(() => ({
        members: window.crawl_party.state.members, multiplayer: window.crawl_party.state.multiplayer,
        controlledSlot: window.crawl_party.state.controlled_slot,
        watching: require('client').is_watching(), inGame: require('client').in_game(),
        inputMode: require(Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/game-context'))).get_input_mode(),
        blocking: [...document.querySelectorAll('#ui-stack > *, dialog[open]')].map(node => node.textContent.slice(0, 700)),
        messages: [...document.querySelectorAll('#messages .game_message')].slice(-5).map(node => node.textContent),
        displayed: [...document.querySelectorAll('.tutorial-tip[data-tip]')].map(node => node.dataset.tip)
    })) });
const errors = [];
let browser, lastPage;
async function start(mode = 'solo') {
    const target = await clientAs(browser, url, 'TipExtra' + crypto.randomBytes(5).toString('hex'), 0, errors);
    const page = target.page; lastPage = page;
    await page.locator('#lobby_home [data-lobby-create]').click();
    await send(page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    await send(page, 'party_room_settings', { trap_mode: 'normal' });
    await page.locator('#party_seat_tab_0').click();
    const seat = page.locator('.party-slot-box[data-slot="0"]');
    await seat.locator('.party-slot-species').selectOption('Minotaur');
    await seat.locator('.party-slot-job').selectOption('Fighter');
    for (const slot of [1, 2, 3]) {
        await page.locator('#party_seat_tab_' + slot).click();
        const value = slot === 1 && mode !== 'solo' ? mode : 'closed';
        await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='${value}']`).click();
    }
    await page.locator('#btn_launch_party_room').click();
    const count = mode === 'solo' ? 1 : 2;
    await page.waitForFunction(count => window.crawl_party?.state?.members?.length === count, count);
    await ready(page);
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(entry => entry.endsWith('/tutorial-tips'));
        return name && require(name).catalog().length === 83;
    });
    await lua(target, 'debug.disable("death",true); debug.disable("spawns",true); debug.disable("mon_act",true); dgn.dismiss_monsters("harmful"); for x=30,50 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35); crawl.enable_more(false); crawl.redraw_view()');
    return target;
}
async function finish(target) {
    await clear(target.page);
    await send(target.page, 'record_save', { exit: true });
    await target.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await target.context.close();
}
async function turn(target) {
    const before = (await state(target.page)).members[0].turns;
    await key(target.page, 46);
    await target.page.waitForFunction(before => window.crawl_party.state.members[0].turns > before, before);
    await clear(target.page);
}
async function own(target) { return (await state(target.page)).members[0]; }

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const target = await start(), page = target.page;
    await proof.expect(page, 'fixture starts from real native state', []);
    if (process.env.TIPS_ADDITIONAL_STAGE !== 'late') {
    // These are real wait commands, not assignments to the projected turn counter.
    await promptLua(target, 'crawl.sendkeys(string.char(27)..string.rep(".",710))');
    const advanced = await page.waitForFunction(() => window.crawl_party.state.members[0].turns >= 700, null, { timeout: 45000 })
        .then(() => true, () => false);
    if (advanced) await ready(page);
    await proof.expect(page, 'ordinary turns unlock the reference advice',
        ['help', 'noise', 'map', 'run', 'save', 'quick', 'zoom', 'history', 'find', 'arrange', 'exclusion']);
    assert(advanced, 'Native wait commands must advance actual turns before continuing');

    await wizard(target, 95, 'Zin');
    await proof.expect(page, 'a real worshipper', ['god']);
    await lua(target, 'you.dock_piety(1,50); crawl.redraw_view()');
    assert((await own(target)).penance > 0);
    await proof.expect(page, 'native divine penance', ['penance']);
    await wizard(target, 95, 'No God');

    }

    await wizard(target, 4, 'conf', '20');
    await proof.expect(page, 'native confusion', ['confused']);
    for (let tries = 0; tries < 10 && (await own(target)).statuses.some(status => status.light === 'Conf'); tries++)
        await turn(target);
    for (let attempt = 0; attempt < 12; attempt++) {
        await lua(target, 'you.moveto(40,35); dgn.terrain_changed(41,35,"web",false,false); crawl.redraw_view()');
        await key(page, 108);
        await page.waitForTimeout(200);
        if ((await own(target)).statuses.some(status => status.light === 'Held')) break;
    }
    await clear(page);
    await proof.expect(page, 'a real web holds the hero', ['caught']);
    for (let tries = 0; tries < 30 && (await own(target)).statuses.some(status => status.light === 'Held'); tries++) {
        await key(page, 104); await clear(page);
    }
    await lua(target, 'dgn.grid(40,35,"floor"); dgn.grid(41,35,"floor"); you.moveto(40,35); crawl.redraw_view()');

    await lua(target, 'dgn.create_monster(you.x_pos()+1,you.y_pos(),"rat")');
    for (let tries = 0; tries < 20 && !(await own(target)).kill_total; tries++) {
        await key(page, 9); await clear(page);
    }
    await lua(target, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
    assert((await own(target)).kill_total > 0);
    await proof.expect(page, 'a native kill unlocks the attack reading', ['attack_info']);

    for (let tries = 0; tries < 12 && (await own(target)).hp / (await own(target)).hp_max >= .35; tries++) {
        await lua(target, 'dgn.place_cloud(you.x_pos(),you.y_pos(),"flame",1)');
        await turn(target);
    }
    await lua(target, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
    await proof.expect(page, 'real damage with no enemies', ['rest']);
    await lua(target, 'dgn.place_cloud(you.x_pos(),you.y_pos(),"poison gas",4)');
    await turn(target); await turn(target);
    await proof.expect(page, 'native poison', ['poison']);
    await wizard(target, 104);
    for (let tries = 0; tries < 12 && (await own(target)).hp / (await own(target)).hp_max >= .35; tries++) {
        await lua(target, 'dgn.place_cloud(you.x_pos(),you.y_pos(),"flame",1)');
        await turn(target);
    }
    await lua(target, 'dgn.create_monster(you.x_pos()+1,you.y_pos(),"orc warrior"); crawl.redraw_view()');
    await proof.expect(page, 'badly hurt beside a native hostile', ['retreat', 'step_away']);
    await lua(target, 'dgn.dismiss_monsters("harmful"); dgn.delete_cloud(you.x_pos(),you.y_pos()); crawl.redraw_view()');

    await lua(target, 'for i=1,50 do dgn.create_item(you.x_pos(),you.y_pos(),"hand axe") end');
    await key(page, 103);
    await page.waitForTimeout(400);
    if (await page.locator('#ui-stack > *').count()) { await key(page, 44); await key(page, 13); }
    await clear(page);
    await proof.expect(page, 'a native full inventory', ['full_pack']);

    await lua(target, 'debug.goto_place("Abyss:1")');
    await clear(page);
    await proof.expect(page, 'a real Abyss floor', ['abyss']);
    await lua(target, 'dgn.dismiss_monsters("harmful"); you.change_species("Automaton"); crawl.redraw_view()');
    await proof.expect(page, 'native Automaton resource', ['heat']);
    await finish(target);

    const carrier = await start();
    await lua(carrier, 'assert(not you.have_orb()); dgn.create_item(you.x_pos(),you.y_pos(),"orb of zot"); crawl.redraw_view()');
    assert.equal((await own(carrier)).has_orb, false);
    await proof.expect(carrier.page, 'an Orb nearby is not owned', [], ['orb']);
    await key(carrier.page, 103); await clear(carrier.page);
    await lua(carrier, 'assert(you.have_orb()); crawl.redraw_view()');
    assert.equal((await own(carrier)).has_orb, true);
    await proof.expect(carrier.page, 'the real Orb of Zot is held', ['orb']);
    await finish(carrier);

    const companion = await start('companion');
    assert.equal((await state(companion.page)).multiplayer, false);
    await proof.expect(companion.page, 'a real locally controlled companion', ['switch_hero']);
    await finish(companion);

    const ai = await start('ai');
    assert((await state(ai.page)).members[1].ai);
    await proof.expect(ai.page, 'a native AI seat with a local deterministic provider fixture', ['ai_teammate']);
    await finish(ai);

    assert.deepEqual(errors, []);
    process.exitCode = proof.results.some(result => !result.pass) ? 1 : 0;
})().catch(async error => {
    console.error(error); process.exitCode = 2;
    if (lastPage && !lastPage.isClosed()) await proof.failure(lastPage, String(error));
})
    .finally(async () => { proof.save(); if (browser) await browser.close(); });
