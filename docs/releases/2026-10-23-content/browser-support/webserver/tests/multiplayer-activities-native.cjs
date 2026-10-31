/* Four authenticated native heroes, cooperative automation and personal Yield. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, key, state, ready, lua, waitAction, view } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8895';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Disposable local wizard games only');
const out = process.env.ACTIVITIES_PROOF_DIR || '/tmp/dcss-multiplayer/activities';
fs.mkdirSync(out, { recursive: true });
const evidence = { url, checks: [], errors: [] }, clients = [];
let browser;
function check(name, details = {}) { evidence.checks.push({ name, ...details }); console.log(name); }
async function own(target) { return (await state(target.page)).members[target.slot]; }
async function stopped(target) {
    await target.page.waitForFunction(slot => !window.crawl_party.state.members[slot].activity, target.slot);
    await ready(target.page);
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    for (const [slot, role] of ['H', 'G', 'J', 'K'].entries()) {
        const target = await client(browser, url, role, evidence.errors);
        target.slot = slot; clients.push(target);
    }
    const [host, guest, third, fourth] = clients;
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    for (const target of clients.slice(1))
        await send(target.page, 'party_room_join', { room_id: host.username, slot: target.slot });
    await host.page.waitForFunction(() => /4 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of clients) {
        await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 4
            && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 120000 });
        await ready(target.page);
        assert.deepEqual((await state(target.page)).controllable_slots, [target.slot]);
    }
    const ids = (await state(host.page)).members.map(member => member.player_id);
    assert.equal(new Set(ids).size, 4);
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=28,73 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35)');
    for (const target of clients.slice(1)) await lua(target, `you.moveto(40,${35 + target.slot})`);
    for (const target of [third, host, fourth, guest, fourth, host]) await waitAction(target);
    check('Four reserved heroes can act in arbitrary order without a safe-floor barrier', { ids });
    const start = (await state(host.page)).members.map(member => member.turns);
    for (const target of clients) await target.page.locator('#party_yield_btn').click();
    await host.page.waitForFunction(start => window.crawl_party.state.members.every((hero, slot) => hero.turns >= start[slot] + 3), start);
    for (const target of clients) {
        assert.equal((await state(target.page)).controlled_slot, target.slot);
        assert.equal((await own(target)).activity, 'yield');
        assert.equal(await target.page.locator('#party_yield_btn').getAttribute('aria-pressed'), 'true');
    }
    const running = (await state(host.page)).members.map(member => member.turns);
    await third.page.screenshot({ path: path.join(out, 'yielding.png') });
    check('All four Yield tasks receive repeated native waits with fixed personal control', { start, running });
    // A peer native prompt must pause automation; Stop stays queued until that
    // boundary is released and then precedes every further automated step.
    await key(host.page, 105);
    await host.page.waitForFunction(() => document.querySelector('#ui-stack').children.length > 0);
    await third.page.locator('#party_yield_btn').click();
    const paused = await own(third);
    await host.page.waitForTimeout(400);
    assert.equal((await own(third)).turns, paused.turns);
    await key(host.page, 27);
    await stopped(third);
    assert.equal((await own(third)).turns, paused.turns);
    for (const target of clients) await send(target.page, 'party_activity', { action: 'cancel' });
    for (const target of clients) await stopped(target);
    check('Stop during another hero inventory prompt is retained without another wait');
    // Restart three tasks; opening wizard mode cancels only the host's task.
    for (const target of clients.slice(1)) await send(target.page, 'party_activity', { action: 'yield' });
    await guest.page.waitForFunction(() => window.crawl_party.state.members[1].activity === 'yield');
    await lua(host, 'dgn.create_monster(43,36,"orc"); crawl.redraw_view()');
    for (const target of clients.slice(1)) await stopped(target);
    const halted = (await state(host.page)).members.map(member => member.turns);
    await host.page.waitForTimeout(500);
    assert.deepEqual((await state(host.page)).members.map(member => member.turns), halted);
    await send(guest.page, 'party_activity', { action: 'yield' });
    await guest.page.waitForTimeout(300);
    assert.equal((await own(guest)).activity, '');
    check('Personal native danger interrupts Yield and refuses a threatened restart', { halted });
    const combatClock = (await state(host.page)).floor_time;
    for (const [index, target] of [fourth, third, host, guest].entries()) {
        await waitAction(target);
        assert.equal((await state(host.page)).floor_time, combatClock + (index === 3 ? 10 : 0));
    }
    check('A four-player combat round advances its floor only after every required action');
    await lua(host, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
    // Full-health native rest has its explicit finite wait completion; peers
    // can move/act while it is running rather than being held in its delay loop.
    const restStart = (await own(guest)).turns;
    await key(guest.page, 53);
    await guest.page.waitForFunction(() => window.crawl_party.state.members[1].activity === 'rest');
    await waitAction(fourth);
    assert.equal((await own(guest)).activity, 'rest');
    await guest.page.waitForFunction(start => window.crawl_party.state.members[1].turns > start
        && !window.crawl_party.state.members[1].activity, restStart, { timeout: 60000 });
    check('Native auto rest completes while other players retain direct actions', { waits: (await own(guest)).turns - restStart });
    const beforeExplore = await own(third);
    await key(third.page, 111);
    await third.page.waitForFunction(slot => window.crawl_party.state.members[slot].activity === 'explore', third.slot);
    await third.page.waitForFunction(({ slot, turns }) => window.crawl_party.state.members[slot].turns >= turns + 2,
        { slot: third.slot, turns: beforeExplore.turns });
    await waitAction(host);
    await send(third.page, 'party_activity', { action: 'cancel' });
    await stopped(third);
    assert.notDeepEqual((await own(third)).pos, beforeExplore.pos);
    assert.equal((await state(third.page)).controlled_slot, 2);
    check('Native auto explore moves only its owner and yields execution between steps');
    // Native travel to a second occupied floor. A persistent Yield there must
    // not tick the original floor, even with three connected players on it.
    await lua(fourth, 'dgn.grid(40,38,"stone_stairs_down_i"); crawl.redraw_view()');
    await key(fourth.page, 62);
    await fourth.page.waitForFunction(() => window.crawl_party.state.floor === 'D:2');
    await ready(fourth.page);
    await lua(fourth, 'dgn.dismiss_monsters("harmful"); for x=30,52 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35); crawl.redraw_view()');
    const originalClock = (await state(host.page)).floor_time;
    const floorTwoStart = (await own(fourth)).turns;
    await send(fourth.page, 'party_activity', { action: 'yield' });
    await fourth.page.waitForFunction(turns => window.crawl_party.state.members[3].turns >= turns + 4, floorTwoStart);
    await send(fourth.page, 'party_activity', { action: 'cancel' });
    await stopped(fourth);
    assert.equal((await state(host.page)).floor_time, originalClock);
    assert.equal((await state(host.page)).floor, 'D:1');
    assert.equal((await state(third.page)).controlled_slot, 2);
    check('Yield on the fourth player separate floor leaves the other three floor clocks unchanged');
    for (const target of clients) {
        await target.page.screenshot({ path: path.join(out, `player-${target.slot + 1}.png`) });
        assert.deepEqual((await state(target.page)).members.map(member => member.player_id), ids);
    }
    evidence.views = await Promise.all(clients.map(view));
    assert.deepEqual(evidence.errors, []);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
})().catch(async error => {
    console.error(error);
    fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify(await Promise.all(clients.map(async target => ({
        slot: target.slot, state: await state(target.page), debug: await target.page.evaluate(() => ({
            errors: window.qaErrors, prompts: window.qaWizardPrompts, packets: window.qaPackets.slice(-30) })) }))), null, 2));
    for (const target of clients) await target.page.screenshot({ path: path.join(out, `failure-${target.slot}.png`) }).catch(() => {});
    process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
