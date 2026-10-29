/* Two real owners: wall-separated exploration, encounter joins and self pings. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, key, state, ready, lua, waitTurn } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18998';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.ENCOUNTER_NATIVE_PROOF || '/tmp/dcss-encounter-sync/browser';
fs.mkdirSync(output, { recursive: true });
const evidence = { environment: 'isolated two-owner native engine', checks: [], errors: [] };
let browser, host, guest;
const check = (text, data) => { evidence.checks.push({ text, data }); console.log(text); };
const own = (data, slot) => data.members.find(hero => hero.slot === slot);
async function act(target, code) {
    const before = own(await state(target.page), target.slot);
    await key(target.page, code);
    await waitTurn(target, before.turns);
}
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
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",false); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=30,54 do for y=20,50 do dgn.grid(x,y,"floor") end end; you.moveto(40,35); crawl.redraw_view()');
    await lua(guest, 'you.moveto(44,35); for y=20,50 do dgn.grid(42,y,"rock_wall") end; crawl.redraw_view()');
    await lua(host, 'dgn.create_monster(38,35,"generate_awake orc"); dgn.place_cloud(40,36,"thin mist",3); crawl.redraw_view()');
    await host.page.waitForFunction(() => window.crawl_party.state.members[1].same_region === false
        && window.crawl_party.state.enemy_initiative?.some(enemy => /orc/.test(enemy.name)));
    const before = await state(host.page), hostBefore = own(before, 0);
    const enemiesBefore = before.enemy_initiative;
    const guestBefore = own(await state(guest.page), 1);
    assert.equal((await state(guest.page)).combat_locked, false);
    assert.match(await guest.page.locator('#party_banner_mode').innerText(), /Explor/i);
    for (const code of [108, 108, 104, 108, 104, 104]) await act(guest, code);
    const after = await state(host.page), guestAfter = own(await state(guest.page), 1);
    assert.equal(own(after, 0).turns, hostBefore.turns);
    assert.equal(own(after, 0).region_aut_clock, hostBefore.region_aut_clock);
    assert.equal(guestAfter.turns, guestBefore.turns + 6);
    assert.deepEqual(after.enemy_initiative, enemiesBefore);
    await lua(host, 'assert(dgn.cloud_at(40,36)=="thin mist","Explorer aged the combat cloud"); crawl.redraw_view()');
    check('Six nearby exploration actions leave the wall-separated combat clock, enemy energy and short-lived cloud unchanged', {
        hostClock: hostBefore.region_aut_clock, guestTurns: [guestBefore.turns, guestAfter.turns]
    });

    const pingTurns = [own(await state(host.page), 0).turns, own(await state(guest.page), 1).turns];
    const pingCell = own(await state(host.page), 0).pos;
    await host.page.evaluate(({ x, y }) => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/party-ping'));
        require(name).send(x, y, 'danger');
    }, pingCell);
    for (const target of [host, guest]) await target.page.waitForFunction(({ user, cell }) =>
        window.crawl_party.pings.some(ping => ping.user === user && ping.x === cell.x && ping.y === cell.y),
    { user: host.username, cell: pingCell });
    assert.equal(own(await state(host.page), 0).turns, pingTurns[0]);
    assert.equal(own(await state(guest.page), 1).turns, pingTurns[1]);
    await host.page.screenshot({ path: path.join(output, 'sender-sees-own-ping.png') });
    check('Accepted ping appears for its sender and teammate without consuming native turns');

    for (let i = 0; i < 4; ++i) await act(host, 46);
    await lua(host, 'assert(dgn.cloud_at(40,36)=="none","Own encounter failed to age its cloud"); crawl.redraw_view()');
    check('The combat cloud ages from its own encounter actions even below the floor high-water clock');

    const debtsBefore = (await state(host.page)).members.map(hero => Math.max(0, hero.aut_clock - hero.region_aut_clock));
    await lua(host, 'dgn.grid(42,35,"open_door"); crawl.redraw_view()');
    await host.page.waitForFunction(() => window.crawl_party.state.members[1].same_region === true);
    const joined = await state(host.page);
    assert.deepEqual(joined.members.map(hero => Math.max(0, hero.aut_clock - hero.region_aut_clock)), debtsBefore);
    check('Opening sight joins the encounter and preserves each hero recovery balance', debtsBefore);
    await lua(host, 'dgn.grid(42,35,"rock_wall"); crawl.redraw_view()');
    await host.page.waitForFunction(() => window.crawl_party.state.members[1].same_region === false);
    await act(guest, 108);
    check('Closing sight separates the encounter and restores independent action');
    assert.deepEqual(evidence.errors, []);
    evidence.passed = true;
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
})().catch(async error => {
    evidence.failure = String(error.stack); console.error(error); process.exitCode = 1;
    for (const target of [host, guest].filter(Boolean)) {
        evidence['client' + target.slot] = await state(target.page).catch(() => null);
        await target.page.screenshot({ path: path.join(output, 'failure-' + target.slot + '.png') }).catch(() => {});
    }
}).finally(async () => {
    if (browser) await browser.close();
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
});
