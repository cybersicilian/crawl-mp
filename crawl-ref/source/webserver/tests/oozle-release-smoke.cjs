/* Production-binary smoke: ordinary Oozle equipment, assimilation and co-op. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, key, state, ready, packets } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8914';
const origin = new URL(url).origin;
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname)
    || (origin === 'https://dcss.iancaltabiano.com' && process.env.WEBTILES_PUBLIC_QA_ORIGIN === origin));
const out = process.env.OOZLE_PROOF_DIR || '/tmp/dcss-oozle-release-smoke';
fs.mkdirSync(out, { recursive: true });
const evidence = { url, checks: [], errors: [], wizardCommandsUsed: false,
    environment: origin === 'https://dcss.iancaltabiano.com' ? 'public production' : 'isolated candidate' };
const clients = [];
let browser, host;
const own = async target => (await state(target.page)).members[target.slot];
const memory = hero => hero.equipment_profile.assimilation;
const check = (name, detail = {}) => { evidence.checks.push({ name, ...detail }); console.log(name); };
async function stopped(target) {
    await target.page.waitForFunction(slot => !window.crawl_party.state.members[slot].activity, target.slot);
    await ready(target.page);
}
async function move(target) {
    await ready(target.page);
    const before = await state(target.page);
    const handle = await target.page.waitForFunction(slot => {
        const names = Object.keys(require.s.contexts._.defined);
        const mod = suffix => require(names.find(name => name.endsWith('/' + suffix)));
        const map = mod('map_knowledge'), enums = mod('enums');
        const party = window.crawl_party.state, own = party.members[slot].pos;
        const walkable = [enums.MF_FLOOR, enums.MF_ITEM, enums.MF_STAIR_UP, enums.MF_STAIR_DOWN];
        for (const [dx, dy, code] of [[1, 0, 108], [-1, 0, 104], [0, 1, 106], [0, -1, 107]]) {
            const x = own.x + dx, y = own.y + dy, cell = map.get(x, y);
            if (cell && walkable.includes(cell.mf) && !cell.mon
                && !party.members.some(hero => hero.pos?.x === x && hero.pos?.y === y))
                return { x, y, code };
        }
        return false;
    }, target.slot);
    const destination = await handle.jsonValue(); await handle.dispose();
    await key(target.page, destination.code);
    await target.page.waitForFunction(({ slot, destination }) => {
        const hero = window.crawl_party.state.members[slot];
        return hero.pos.x === destination.x && hero.pos.y === destination.y;
    }, { slot: target.slot, destination });
    const after = await state(target.page);
    for (const hero of before.members) if (hero.slot !== target.slot) {
        assert.deepEqual(after.members[hero.slot].pos, hero.pos);
        if (!hero.activity) assert.equal(after.members[hero.slot].turns, hero.turns);
    }
    assert(after.members[target.slot].turns > before.members[target.slot].turns);
}
(async () => {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chrome' }) });
    host = await client(browser, url, 'H', evidence.errors);
    const guest = await client(browser, url, 'G', evidence.errors);
    clients.push(host, guest);
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    const leader = host.page.locator('.party-slot-box[data-slot="0"]');
    await leader.locator('.party-slot-species').selectOption('Oozle');
    await leader.locator('.party-slot-job').selectOption('Fighter');
    await leader.locator('.party-slot-weapon').selectOption('rapier');
    await send(guest.page, 'party_room_join', { room_id: host.username, slot: 1 });
    for (const slot of [2, 3])
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of clients) {
        await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
            && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 120000 });
        await ready(target.page);
        assert.deepEqual((await state(target.page)).controllable_slots, [target.slot]);
    }
    const identity = (await packets(host)).find(packet => packet.msg === 'record_identity');
    assert(identity, 'Native save identity must be delivered');
    const start = await own(host);
    assert.equal(start.species, 'Oozle');
    assert.equal(memory(start).capacity, 1);
    assert.equal(memory(start).used, 0);
    assert.equal(memory(await own(guest)) ?? null, null);
    const weapon = start.inventory.find(item => item.equipped && item.name.includes('rapier'));
    assert(weapon, 'Explicit starting rapier must be equipped');
    const ability = start.abilities.find(entry => entry.name === 'Assimilate');
    assert(ability, 'Native Assimilate ability must be available');
    await host.page.locator('#assimilation_start_0').waitFor({ state: 'visible' });
    const layout = await host.page.locator('.assimilation-panel').first().evaluate(panel => ({
        width: panel.getBoundingClientRect().width,
        cardWidth: panel.closest('.party-card').getBoundingClientRect().width,
        slotWidth: panel.querySelector('.assimilation-slot').getBoundingClientRect().width,
    }));
    assert(layout.width >= layout.cardWidth - 40 && layout.slotWidth >= 80,
        'Memory panel must fit the player card: ' + JSON.stringify(layout));
    check('Memory panel has readable native card and slot widths', layout);
    await move(host); await move(guest);
    check('Native Oozle selection, memory display and independent two-owner movement');
    const assimilation = host.page.locator('#assimilation_toggle_0');
    await assimilation.focus();
    await move(guest);
    assert.equal(await host.page.locator('.assimilation-digestion').count(), 0);
    assert.equal(await host.page.evaluate(() => document.activeElement.id), 'assimilation_toggle_0');
    check('Memory display preserves keyboard focus across peer updates without passive digestion');

    await send(host.page, 'inv_item_use', { expected_slot: 0, slot: weapon.slot,
        expected_name: weapon.name, action: 'unequip' });
    await host.page.waitForFunction(slot => !window.crawl_party.state.members[0].inventory
        .find(item => item.slot === slot)?.equipped, weapon.slot);
    await stopped(host);
    const beforeAssimilation = await own(host);
    await host.page.locator('#assimilation_start_0').click();
    await host.page.waitForFunction(() => document.body.innerText.includes('Assimilate which carried item?'));
    await key(host.page, (weapon.slot < 26 ? 97 : 65 - 26) + weapon.slot);
    await host.page.waitForFunction(() => document.querySelector('#ui-stack')?.innerText
        .includes('Consumes one item after 5 of your turns.'));
    await key(host.page, 89);
    await host.page.waitForFunction(() => window.crawl_party.state.members[0].activity === 'assimilating');
    await move(guest);
    assert.equal((await own(host)).activity, 'assimilating', 'Peer action completes during active work');
    await host.page.waitForFunction(() => window.crawl_party.state.members[0].equipment_profile.assimilation.used === 1);
    await stopped(host);
    const learned = await own(host), learnedMemory = memory(learned);
    assert.equal(learned.turns - beforeAssimilation.turns, 5);
    assert.equal(learned.inventory.some(item => item.slot === weapon.slot), false);
    assert.equal(learnedMemory.slots[0].memory.family, 'Weapons');
    assert(learnedMemory.slots[0].memory.effects.length >= 2);
    assert(learnedMemory.unarmed_properties.length >= 2);
    await host.page.locator('.assimilation-inheritance').filter({ hasText: 'Body' }).waitFor();
    await host.page.screenshot({ path: path.join(out, 'oozle-assimilated.png') });
    check('Ordinary five-turn assimilation consumes the starting rapier and strengthens unarmed attacks',
        { memory: learnedMemory, ownerTurns: learned.turns - beforeAssimilation.turns });

    const saved = await state(host.page);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await send(host.page, 'library_load', { id: identity.game_id });
    await host.page.waitForFunction(() => window.crawl_party?.state?.members?.[0]?.equipment_profile?.assimilation?.used === 1,
        null, { timeout: 120000 });
    await ready(host.page);
    await send(guest.page, 'watch', { username: host.username });
    await send(guest.page, 'join_party');
    await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1);
    await ready(guest.page);
    const resumed = await state(host.page);
    for (const slot of [0, 1]) {
        assert.equal(resumed.members[slot].player_id, saved.members[slot].player_id);
        assert.deepEqual(resumed.members[slot].pos, saved.members[slot].pos);
        assert.equal(resumed.members[slot].turns, saved.members[slot].turns);
    }
    assert.deepEqual(memory(resumed.members[0]), memory(saved.members[0]));
    await move(guest);
    check('Native save and resume preserve full memory bundles and independent hero ownership');
    assert.deepEqual(evidence.errors, []);
    for (const target of clients) assert.deepEqual(await target.page.evaluate(() => window.qaErrors), []);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    evidence.passed = true;
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
})().catch(async error => {
    evidence.passed = false; evidence.failure = error.stack;
    for (const target of clients) {
        evidence['player' + target.slot] = await state(target.page).catch(() => null);
        await target.page.screenshot({ path: path.join(out, `failure-${target.slot}.png`) }).catch(() => {});
        fs.writeFileSync(path.join(out, `failure-${target.slot}.txt`), await target.page.locator('body').innerText().catch(() => ''));
    }
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
