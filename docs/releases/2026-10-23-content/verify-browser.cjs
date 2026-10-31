/* Exact merged native client: two owners, real targeting, theft and save/resume. */
const fs = require('node:fs');
const path = require('node:path');
const source = process.env.CONTENT_SOURCE;
const out = process.env.CONTENT_PROOF;
const url = process.env.WEBTILES_URL;
const { assert, chromium, client, send, key, state, ready, lua, packets, waitAction } =
    require(path.join(source, 'webserver/tests/multiplayer-native-client.cjs'));
assert(new URL(url).hostname === '127.0.0.1');
fs.mkdirSync(out, { recursive: true });
const proof = { checks: [], errors: [], url, source };
const clients = [];
const check = name => { proof.checks.push(name); console.log(name); };
const hero = async target => (await state(target.page)).members[target.slot];
async function use(target, name) {
    const ability = (await hero(target)).abilities.find(row => row.name === name);
    assert(ability, name + ' must be exposed by the native snapshot');
    assert.equal(ability.blocked_reason, '', name + ': ' + ability.blocked_reason);
    await send(target.page, 'power_action', { expected_slot: target.slot, id: ability.id,
        letter: ability.hotkey, kind: 'ability' });
}
async function targetMode(page) {
    await page.waitForFunction(() => Object.keys(require.s.contexts._.defined)
        .some(name => name.endsWith('/game') && require(name).can_target()));
}
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const host = await client(browser, url, 'H', proof.errors); clients.push(host);
        const guest = await client(browser, url, 'G', proof.errors); clients.push(guest);
        await host.page.locator('#lobby_home [data-lobby-create]').click();
        await host.page.locator('#party_slot_species_0').selectOption('Chain Devil');
        await host.page.locator('#party_slot_job_0').selectOption('Fighter');
        for (const slot of [2, 3])
            await host.page.locator(`.party-slot-box[data-slot="${slot}"] [data-mode="closed"]`).click();
        await send(guest.page, 'party_room_join', { room_id: host.username, slot: 1 });
        await guest.page.locator('#party_slot_species_1').selectOption('Eldritch');
        await guest.page.locator('#party_slot_job_1').selectOption('Conjurer');
        await host.page.waitForFunction(() => document.querySelector('#party_slot_species_1').value === 'Eldritch');
        await host.page.locator('#btn_launch_party_room').click();
        for (const target of clients) {
            await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
                && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 120000 });
            await ready(target.page);
            assert.deepEqual((await state(target.page)).controllable_slots, [target.slot]);
        }
        assert.equal((await hero(host)).species, 'Chain Devil');
        assert.equal((await hero(guest)).species, 'Eldritch');
        assert.equal((await hero(guest)).defiance, 0);
        assert((await hero(host)).abilities.some(row => row.name === 'Chain Lash'));
        check('Both visible species choices launch as separate human owners');
        const record = (await packets(host)).find(row => row.msg === 'record_identity').game_id;
        proof.initial = clients.map(target => ({ username: target.username, slot: target.slot }));
        await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=30,52 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35); qa_mon=dgn.create_monster(42,35,"ogre"); qa_mon.set_max_hp(500); qa_mon.set_hp(500); crawl.redraw_view()');
        await lua(guest, 'you.moveto(44,35); dgn.grid(44,35,"altar_the_shining_one"); crawl.redraw_view()');
        const beforeCancel = await hero(host);
        await use(host, 'Chain Lash');
        await targetMode(host.page);
        await key(host.page, 27);
        await ready(host.page);
        assert.equal((await hero(host)).turns, beforeCancel.turns);
        assert.equal(Boolean((await hero(host)).chain), false);
        check('Ordinary Chain Lash opens native targeting; cancel spends no turn');
        for (let attempt = 0; attempt < 6 && !(await hero(host)).chain; ++attempt) {
            while ((await hero(host)).abilities.find(row => row.name === 'Chain Lash').blocked_reason)
                await waitAction(host);
            await use(host, 'Chain Lash');
            await targetMode(host.page);
            await send(host.page, 'click_cell', { x: 42, y: 35, button: 1 });
            await ready(host.page);
        }
        assert((await hero(host)).chain, 'A successful real hit establishes the maintained tether');
        await host.page.screenshot({ path: path.join(out, 'chain-native.png') });
        check('Real chain attack establishes the native tether and renders its overlay');
        await use(guest, 'Profane Altar');
        await guest.page.waitForFunction(() => /Permanently steal/.test(document.body.innerText));
        await key(guest.page, 89);
        await guest.page.waitForFunction(() => window.crawl_party.state.members[1].defiance === 40);
        await ready(guest.page);
        assert(['', 'No God'].includes((await hero(guest)).god));
        const shield = (await hero(guest)).abilities.find(row => /Divine Shield/.test(row.name));
        assert(shield);
        await use(guest, shield.name);
        await guest.page.waitForFunction(() => window.crawl_party.state.members[1].defiance === 32);
        await ready(guest.page);
        assert((await hero(guest)).sh >= 3);
        assert.equal((await hero(host)).defiance, undefined);
        assert(await guest.page.locator('#party_defiance_1').isVisible());
        assert.match(await guest.page.locator('#party_defiance_1').innerText(), /Defiance 32\/100 · Rites 0\/3/);
        await guest.page.screenshot({ path: path.join(out, 'eldritch-native.png') });
        check('Confirmed theft grants one real power; its shield consumes only its owner’s Defiance');
        proof.saved = [await hero(host), await hero(guest)];
        await send(host.page, 'record_save', { exit: true });
        await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await send(host.page, 'library_load', { id: record });
        await host.page.waitForFunction(() => window.crawl_party?.state?.multiplayer === true,
            null, { timeout: 120000 });
        await send(guest.page, 'watch', { username: host.username });
        await send(guest.page, 'join_party');
        await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1);
        for (const target of clients) {
            await ready(target.page);
            const current = await hero(target), saved = proof.saved[target.slot];
            assert.equal(current.species, saved.species);
            assert.equal(current.player_id, saved.player_id);
            assert.equal(current.defiance, saved.defiance);
            assert.equal(current.elder_summary, saved.elder_summary);
            assert.deepEqual(current.chain, saved.chain);
            assert.deepEqual(current.pos, saved.pos);
        }
        check('Native save/resume preserves both owners, tether, stolen power and shared-reserve state');
        await send(host.page, 'record_save', { exit: true });
        await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        assert.deepEqual(proof.errors, []);
        proof.passed = true;
    } catch (error) {
        proof.failure = String(error.stack);
        for (const target of clients) {
            proof['client' + target.slot] = { state: await state(target.page).catch(() => null),
                text: (await target.page.locator('body').innerText().catch(() => '')).slice(-10000) };
            await target.page.screenshot({ path: path.join(out, 'failure-' + target.slot + '.png') }).catch(() => {});
        }
        throw error;
    } finally {
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(proof, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
