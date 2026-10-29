/* Human-only roster, personal native perception, independent floors and recovery. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, key, state, ready, lua, waitTurn, waitAction,
    resetPackets, packets, view, capture } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8895';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Disposable local wizard games only');
const out = process.env.MULTIPLAYER_PROOF_DIR || '/tmp/dcss-multiplayer/browser';
fs.mkdirSync(out, { recursive: true });
const evidence = { url, checks: [], errors: [] }, clients = [];
let browser;
const check = (name, details = {}) => { evidence.checks.push({ name, ...details }); console.log(name); };
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const host = await client(browser, url, 'H', evidence.errors); clients.push(host);
    const guest = await client(browser, url, 'G', evidence.errors); clients.push(guest);
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    for (const slot of [1, 2])
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
    await send(guest.page, 'party_room_join', { room_id: host.username, slot: 3 });
    await host.page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    assert((await host.page.locator(".party-slot-box[data-slot='1']").innerText()).includes('Excluded from multiplayer'));
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of clients) {
        await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
            && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 120000 });
        await ready(target.page);
        assert.equal((await state(target.page)).multiplayer, true);
        assert.deepEqual((await state(target.page)).controllable_slots, [target.slot]);
        assert.equal(await target.page.locator('#party_banner_cycle').isVisible(), false);
    }
    check('Sparse occupied seats compact to exactly two human heroes');
    const recordId = (await packets(host)).find(packet => packet.msg === 'record_identity').game_id;
    const guestView = await view(guest);
    await guest.page.evaluate(() => window.crawl_party.open_inspector(1, 'inventory'));
    await waitAction(host);
    assert.equal((await view(guest)).slot, 1);
    assert.deepEqual((await view(guest)).center, guestView.center);
    assert.deepEqual((await view(guest)).inventory, guestView.inventory);
    assert(await guest.page.locator('#party_inspector_modal').evaluate(dialog => dialog.open));
    assert.equal(await guest.page.evaluate(() => window.crawl_party.inspector_slot), 1);
    await guest.page.evaluate(() => document.getElementById('party_inspector_modal').close());
    await waitAction(guest);
    check('Native actions retain each recipient identity, camera and inventory');
    // Deterministic opaque-wall fixture, created inside the real native engine.
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=30,52 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35)');
    await lua(guest, 'you.moveto(44,35); for y=25,45 do dgn.grid(42,y,"rock_wall") end; qa_mon=dgn.create_monster(45,35,"orc"); crawl.redraw_view()');
    await resetPackets(host, guest);
    await waitAction(guest);
    const hostPackets = await packets(host), guestPackets = await packets(guest);
    const monsterCells = list => list.filter(p => p.msg === 'map').flatMap(p => p.cells || []).filter(c => /orc/i.test(c.mon?.name || ''));
    assert(monsterCells(guestPackets).length > 0, 'The guest must receive native orc metadata');
    assert.equal(monsterCells(hostPackets).length, 0, 'An opaque wall must exclude orc metadata from host packets');
    await host.page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/map_knowledge'));
        const cell = require(name).get(45,35);
        return cell && cell.mf !== undefined;
    });
    check('Shared terrain crosses the wall; live native creature metadata stays personal',
        { hostOrcs: monsterCells(hostPackets).length, guestOrcs: monsterCells(guestPackets).length });
    await waitAction(host); // Complete this floor's combat recovery before setup.
    // Leave a persistent native cloud and use an ordinary stair, not wizard travel.
    await lua(guest, 'dgn.dismiss_monsters("harmful"); dgn.place_cloud(45,36,"thin mist",100); dgn.grid(44,35,"stone_stairs_down_i"); crawl.redraw_view()');
    const hostBeforeStairs = await view(host);
    const beforeStairs = await state(guest.page);
    await key(guest.page, 62);
    await guest.page.waitForFunction(() => window.crawl_party.state.floor === 'D:2');
    await ready(guest.page);
    assert.equal((await state(host.page)).floor, 'D:1');
    assert.deepEqual((await view(host)).center, hostBeforeStairs.center);
    assert.deepEqual((await view(host)).own.pos, hostBeforeStairs.own.pos);
    check('Ordinary stairs move only the acting hero and preserve the other floor view');
    await lua(guest, 'dgn.dismiss_monsters("harmful"); for x=32,48 do for y=28,42 do dgn.grid(x,y,"floor") end end; you.moveto(40,35); dgn.create_monster(35,35,"generate_awake orc"); debug.disable("mon_act",false); crawl.redraw_view()');
    await lua(host, 'dgn.create_monster(35,35,"generate_awake orc"); crawl.redraw_view()');
    const orcs = async target => (await packets(target)).filter(packet => packet.msg === 'map').at(-1).cells
        .filter(cell => /orc/i.test(cell.mon?.name || '')).map(cell => ({ x: cell.x, y: cell.y }));
    const d1Orc = await orcs(host), d2Orc = await orcs(guest);
    assert.deepEqual(d1Orc, [{ x: 35, y: 35 }]);
    assert.deepEqual(d2Orc, [{ x: 35, y: 35 }]);
    const d1Time = (await state(host.page)).floor_time;
    const d2Time = (await state(guest.page)).floor_time;
    const d1 = (await state(host.page)).world_aut_clock;
    const d2 = (await state(guest.page)).world_aut_clock;
    await resetPackets(host, guest);
    for (let i=0; i<3; ++i) await waitAction(guest);
    assert((await state(guest.page)).world_aut_clock > d2);
    assert.equal((await state(host.page)).world_aut_clock, d1);
    assert.notDeepEqual(await orcs(guest), d2Orc, 'Native D:2 monster AI must advance on D:2 actions');
    assert.equal((await state(guest.page)).floor_time, d2Time + 30);
    assert.equal((await packets(host)).filter(p => p.msg === 'map' || p.msg === 'player').length, 0);
    const guestBeforeHost = await view(guest);
    const d2After = (await state(guest.page)).world_aut_clock;
    for (let i=0; i<3; ++i) await waitAction(host);
    assert((await state(host.page)).world_aut_clock > d1);
    assert.notDeepEqual(await orcs(host), d1Orc, 'Native D:1 monster AI must advance on D:1 actions');
    assert.equal((await state(host.page)).floor_time, d1Time + 30);
    assert.equal((await state(guest.page)).world_aut_clock, d2After);
    assert.deepEqual((await view(guest)).center, guestBeforeHost.center);
    check('Both occupied floors process real actions; unrelated floor clocks and streams stay unchanged',
        { d1Before: d1, d1After: (await state(host.page)).world_aut_clock,
          d2Before: d2, d2After });
    // A browser reconnect must reconstruct its own floor and native player.
    await lua(guest, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
    await lua(host, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
    await lua(host, "qa_rng=debug.get_rng_state():match('states:%s*(%d+)')");
    const beforeRefresh = await state(host.page);
    for (let i=0; i<3; ++i) await send(host.page, 'join_party');
    await lua(host, "assert(qa_rng == debug.get_rng_state():match('states:%s*(%d+)'), 'View refresh consumed gameplay RNG')");
    const afterRefresh = await state(host.page);
    assert.equal(afterRefresh.floor_time, beforeRefresh.floor_time);
    assert.equal(afterRefresh.world_aut_clock, beforeRefresh.world_aut_clock);
    for (const field of ['turns', 'hp', 'mp', 'xl', 'pos'])
        assert.deepEqual(afterRefresh.members[0][field], beforeRefresh.members[0][field]);
    check('Repeated native view refresh preserves gameplay RNG, hero state and turn clocks');
    await guest.page.reload();
    await guest.page.waitForFunction(() => Boolean(window.socket && window.socket.readyState === 1));
    await capture(guest.page);
    await send(guest.page, 'watch', { username: host.username });
    await send(guest.page, 'join_party');
    await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1
        && window.crawl_party.state.floor === 'D:2');
    await ready(guest.page);
    await waitAction(guest);
    assert.equal((await state(host.page)).floor, 'D:1');
    check('Reconnect restores the reserved hero and its separate floor');
    const savedStates = [await state(host.page), await state(guest.page)];
    for (const target of clients) await target.page.screenshot({ path: path.join(out, target.slot + '.png') });
    assert.deepEqual(evidence.errors, []);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    check('Split-floor expedition saves and exits cleanly');
    await send(host.page, 'library_load', { id: recordId });
    await host.page.waitForFunction(() => window.crawl_party?.state?.multiplayer === true
        && window.crawl_party.state.floor === 'D:1', null, { timeout: 120000 });
    await send(guest.page, 'watch', { username: host.username });
    await send(guest.page, 'join_party');
    await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1
        && window.crawl_party.state.floor === 'D:2');
    for (const target of clients) {
        const current = await state(target.page), saved = savedStates[target.slot];
        assert.equal(current.world_aut_clock, saved.world_aut_clock);
        assert.equal(current.floor_time, saved.floor_time);
        assert.equal(current.members[target.slot].player_id, saved.members[target.slot].player_id);
        assert.deepEqual(current.members[target.slot].pos, saved.members[target.slot].pos);
        await ready(target.page);
        await target.page.locator('#loader').waitFor({ state: 'hidden' });
        await waitAction(target);
    }
    check('Native save/resume restores both floors, clocks, positions and stable hero identities');
    await lua(guest, 'dgn.grid(40,35,"stone_stairs_up_i"); crawl.redraw_view()');
    await key(guest.page, 60);
    await guest.page.waitForFunction(() => window.crawl_party.state.floor === 'D:1');
    await ready(guest.page);
    assert.equal((await state(host.page)).floor, 'D:1');
    await lua(guest, 'assert(dgn.cloud_at(45,36) == "thin mist", "Persistent source-floor cloud was lost")');
    check('Returning to an occupied floor preserves its native entities and cloud');
    const beforeBranch = await view(host);
    await lua(guest, 'dgn.grid(you.x_pos(),you.y_pos(),"enter_temple"); crawl.redraw_view()');
    await key(guest.page, 62);
    await guest.page.waitForFunction(() => window.crawl_party.state.floor.startsWith('Temple'));
    await ready(guest.page);
    assert.equal((await view(host)).floor, 'D:1');
    assert.deepEqual((await view(host)).own.pos, beforeBranch.own.pos);
    assert.deepEqual((await view(host)).center, beforeBranch.center);
    check('Seeded branch entry moves only its human actor without a gathering requirement');
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
})().catch(async error => {
    evidence.failure = String(error.stack);
    for (const target of clients) {
        try {
            evidence['client' + target.slot] = { state: await state(target.page), view: await view(target),
                text: (await target.page.locator('body').innerText()).slice(-10000), packets: (await packets(target)).slice(-30) };
            await target.page.screenshot({ path: path.join(out, 'failure-' + target.slot + '.png') });
        } catch (ignored) { evidence.captureError = String(ignored); }
    }
    fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify(evidence, null, 2));
    console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
