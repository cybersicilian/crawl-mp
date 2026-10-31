/* Fresh two-owner native fixture: plans, personal enemies and regional clocks. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, key, state, ready, lua, waitAction } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18996';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.TACTICAL_NATIVE_PROOF || '/tmp/dcss-tactical-work/native-browser';
fs.mkdirSync(output, { recursive: true });
const evidence = { environment: 'disposable two-owner native wizard fixture', checks: [], errors: [] };
let browser, host, guest;
function check(text, data) { evidence.checks.push({ text, data }); console.log(text); }
const planTo = (page, x, y) => page.evaluate(({ x, y }) => {
    const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/tactical-planner'));
    return require(name).click({ which: 1, shiftKey: true, cell: { x, y }, preventDefault() {} });
}, { x, y });
const finishPlan = page => page.waitForFunction(() => {
    const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/tactical-planner'));
    const plan = require(name).view(); return !plan.pending && plan.entries.length === 0;
});
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    host = await client(browser, url, 'H', evidence.errors);
    guest = await client(browser, url, 'G', evidence.errors);
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    for (const slot of [1, 2])
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
    await send(guest.page, 'party_room_join', { room_id: host.username, slot: 3 });
    await host.page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of [host, guest]) {
        await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
            && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 120000 });
        await ready(target.page);
    }
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=18,72 do for y=22,48 do dgn.grid(x,y,"floor") end end; you.moveto(30,35); crawl.redraw_view()');
    await lua(guest, 'you.moveto(60,35); crawl.redraw_view()');
    await host.page.waitForFunction(() => window.crawl_party.state.members[1].same_region === false);
    const initial = await state(host.page), guestBefore = await state(guest.page);
    assert.equal(initial.members[0].region_id === initial.members[1].region_id, false);
    assert(await planTo(host.page, 33, 35));
    assert.equal(await host.page.locator('.plan-actions button').count(), 3);
    await host.page.locator('[data-plan=run]').click(); await finishPlan(host.page);
    const moved = await state(host.page);
    assert.deepEqual(moved.members[0].pos, { x: 33, y: 35 });
    assert.equal(moved.members[0].turns, initial.members[0].turns + 3);
    assert.equal((await state(guest.page)).members[1].turns, guestBefore.members[1].turns);
    assert.deepEqual((await state(guest.page)).members[1].pos, guestBefore.members[1].pos);
    check('Three queued native moves finish while a distant human stays idle', { before: initial.members[0].pos, after: moved.members[0].pos });
    await lua(host, 'dgn.create_monster(36,35,"generate_awake orc"); crawl.redraw_view()');
    await host.page.waitForFunction(() => window.crawl_party.state.enemy_initiative?.some(enemy => /orc/.test(enemy.name)));
    await host.page.locator('.enemy-timing').first().waitFor({ state: 'visible' });
    assert.equal(await host.page.locator('#monster_list .group:not(.is-unseen-warning):has(.name.hostile)')
        .evaluateAll(rows => rows.every(row => getComputedStyle(row).display === 'none')), true,
    'Known enemies appear beside the hero instead of duplicated in the bottom-right list');
    const enemies = (await state(host.page)).enemy_initiative;
    assert(enemies.every(enemy => Number.isInteger(enemy.energy_deficit) && enemy.energy_deficit >= 0));
    assert.equal((await state(guest.page)).enemy_initiative.some(enemy => /orc/.test(enemy.name)), false);
    assert(await planTo(host.page, 34, 36));
    await host.page.locator('[data-plan=run]').click(); await finishPlan(host.page);
    assert.deepEqual((await state(host.page)).members[0].pos, { x: 34, y: 36 });
    check('Visible native enemy energy is personal; an independent combat route still executes', enemies);
    await lua(host, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
    await host.page.waitForFunction(() => window.crawl_party.state.enemy_initiative.length === 0);
    assert.equal(await host.page.locator('.enemy-timing').count(), 0);
    await lua(guest, 'you.moveto(50,35); crawl.redraw_view()');
    await host.page.waitForFunction(() => window.crawl_party.state.members[1].same_region === true);
    await lua(host, 'dgn.create_monster(37,36,"generate_awake orc"); crawl.redraw_view()');
    const shared = await state(host.page);
    assert.equal(shared.members[0].region_id, shared.members[1].region_id);
    assert.equal(shared.combat_locked, true);
    await host.page.locator('[data-plan=wait]').click(); await host.page.locator('[data-plan=wait]').click();
    await host.page.locator('[data-plan=run]').click();
    await host.page.waitForFunction(turns => window.crawl_party.state.members[0].turns === turns + 1,
        shared.members[0].turns);
    await host.page.waitForFunction(() => window.crawl_party.state.members[0].can_act === false);
    assert.equal(await host.page.locator('.plan-actions button').count(), 1, 'Second wait remains visible during recovery');
    await host.page.screenshot({ path: path.join(output, 'native-enemies-and-recovery-queue.png') });
    await waitAction(guest);
    await finishPlan(host.page);
    assert.equal((await state(host.page)).members[0].turns, shared.members[0].turns + 2);
    check('Merged regional combat holds and resumes the next queued action at native recovery');
    await host.page.locator('[data-plan=wait]').click();
    await host.page.reload(); await ready(host.page);
    assert.equal(await host.page.locator('.plan-actions button').count(), 0);
    check('Browser reconnect discards session-local planned actions');
    assert.deepEqual(evidence.errors, []);
    evidence.passed = true;
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
})().catch(async error => {
    evidence.failure = String(error.stack); console.error(error); process.exitCode = 1;
    for (const target of [host, guest].filter(Boolean)) {
        evidence['client' + target.slot] = { state: await state(target.page).catch(() => null),
            text: await target.page.locator('body').innerText().catch(() => ''),
            packets: await target.page.evaluate(() => window.qaPackets.filter(packet =>
                ['party_state', 'input_mode', 'game_action_error'].includes(packet.msg)).slice(-35).map(packet =>
                    packet.msg === 'party_state' ? { msg: packet.msg, members: packet.members.map(hero => ({ slot: hero.slot, turns: hero.turns, pos: hero.pos })) } : packet)).catch(() => []) };
        await target.page.screenshot({ path: path.join(output, 'failure-' + target.slot + '.png') }).catch(() => {});
    }
}).finally(async () => {
    if (browser) await browser.close();
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
});
