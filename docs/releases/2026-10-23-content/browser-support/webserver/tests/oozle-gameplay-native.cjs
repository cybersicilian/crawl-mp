/* Disposable native Oozle expedition with two separately authenticated owners. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, key, state, ready, lua, waitAction, packets } = require('./multiplayer-native-client.cjs');
const itemContext = require('./oozle-item-context-native.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8913';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.OOZLE_PROOF_DIR || '/tmp/dcss-oozle-gameplay';
fs.mkdirSync(out, { recursive: true });
const evidence = { url, environment: 'disposable local native wizard fixture', checks: [], errors: [] };
const clients = [];
let browser;
const own = async target => (await state(target.page)).members[target.slot];
const memory = hero => hero.equipment_profile.assimilation;
const item = (hero, text) => hero.inventory.find(entry => entry.name.includes(text));
const check = (name, detail = {}) => {
    evidence.checks.push({ name, ...detail }); console.log(name);
};
async function stopped(target) {
    await target.page.waitForFunction(slot => !window.crawl_party.state.members[slot].activity, target.slot);
    await ready(target.page);
}
async function create(target, spec, match) {
    await lua(target, `dgn.create_item(you.x_pos(),you.y_pos(),${JSON.stringify(spec)})`);
    await key(target.page, 103);
    await target.page.waitForFunction(({ slot, match }) =>
        window.crawl_party.state.members[slot].inventory.some(entry => entry.name.includes(match)),
    { slot: target.slot, match });
    await ready(target.page);
    return item(await own(target), match);
}
async function assimilationPicker(target, source) {
    await ready(target.page);
    await target.page.locator('#assimilation_start_' + target.slot).click();
    await target.page.waitForFunction(() => document.body.innerText.includes('Assimilate which carried item?'));
    await key(target.page, (source.slot < 26 ? 97 : 65 - 26) + source.slot);
    await itemContext.confirmation(target.page);
}
async function setWear(target, source, exposure) {
    await lua(target, `dgn.item_property_set(items.inslot(${source.slot}),"oozle_corrosion_aut","i",${exposure})`);
}
async function equipmentAction(target, source, action) {
    await send(target.page, 'inv_item_use', { expected_slot: target.slot, slot: source.slot,
        expected_name: source.name, action });
    await target.page.waitForFunction(({ slot, invSlot, equipped }) =>
        window.crawl_party.state.members[slot].inventory
            .some(entry => entry.slot === invSlot && entry.equipped === equipped),
    { slot: target.slot, invSlot: source.slot, equipped: action === 'use' });
    await ready(target.page);
}
async function move(target, code, expected) {
    const before = await own(target);
    await key(target.page, code);
    await target.page.waitForFunction(({ slot, expected }) => {
        const hero = window.crawl_party.state.members[slot];
        return hero.pos.x === expected.x && hero.pos.y === expected.y;
    }, { slot: target.slot, expected });
    await ready(target.page);
    assert((await own(target)).turns > before.turns);
}
(async () => {
    browser = await chromium.launch({ headless: true, ...(process.env.TACTICAL_BROWSER_CHANNEL
        ? { channel: process.env.TACTICAL_BROWSER_CHANNEL } : {}) });
    const host = await client(browser, url, 'H', evidence.errors);
    const guest = await client(browser, url, 'G', evidence.errors);
    clients.push(host, guest);
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    const leader = host.page.locator('.party-slot-box[data-slot="0"]');
    await leader.locator('.party-slot-species').selectOption('Oozle');
    await leader.locator('.party-slot-job').selectOption('Fighter');
    await leader.locator('.party-slot-weapon').selectOption('flail');
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
    const recordId = (await packets(host)).find(packet => packet.msg === 'record_identity').game_id;
    assert.equal((await own(host)).species, 'Oozle');
    assert.equal(memory(await own(host)).capacity, 1);
    assert.equal(memory(await own(guest)) ?? null, null);
    await host.page.locator('#assimilation_start_0').waitFor({ state: 'visible' });
    const layout = await host.page.locator('.assimilation-panel').first().evaluate(panel => ({
        width: panel.getBoundingClientRect().width,
        cardWidth: panel.closest('.party-card').getBoundingClientRect().width,
        slotWidth: panel.querySelector('.assimilation-slot').getBoundingClientRect().width,
    }));
    assert(layout.width >= layout.cardWidth - 40 && layout.slotWidth >= 80,
        'Memory panel and slots must use the player card width: ' + JSON.stringify(layout));
    check('Memory panel spans the player card with readable slot widths', layout);
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=30,55 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35); crawl.redraw_view()');
    await lua(guest, 'you.moveto(40,37); crawl.redraw_view()');
    const stableGuest = await own(guest);
    await move(host, 108, { x: 41, y: 35 });
    assert.deepEqual((await own(guest)).pos, stableGuest.pos);
    assert.equal((await own(guest)).turns, stableGuest.turns);
    const stableHost = await own(host);
    await move(guest, 108, { x: 41, y: 37 });
    assert.deepEqual((await own(host)).pos, stableHost.pos);
    assert.equal((await own(host)).turns, stableHost.turns);
    check('Two distinct owners start an Oozle and move independently');

    const plate = await create(host, 'plate armour plus:4 pre_id', 'plate armour');
    check('Item contexts target one carried item; safe cancellation and stale/owner guards take no turns',
        await itemContext.probe(host, guest, plate, out));
    const before = await own(host);
    await assimilationPicker(host, plate);
    await key(host.page, 89);
    await host.page.waitForFunction(() => window.crawl_party.state.members[0].activity === 'assimilating');
    await move(guest, 108, { x: 42, y: 37 });
    const during = await own(host);
    assert.equal(during.activity, 'assimilating', 'Peer input must complete before the long task finishes');
    await send(host.page, 'party_activity', { action: 'cancel' });
    await stopped(host);
    assert.equal(item(await own(host), 'plate armour').qty, plate.qty);
    assert.equal(memory(await own(host)).used, 0);
    check('Peer movement completes during assimilation; cancellation preserves source and memories',
        { ownerTurns: during.turns - before.turns, peerPosition: (await own(guest)).pos });

    const start = await own(host);
    await itemContext.start(host, plate, true);
    await key(host.page, 89);
    await host.page.waitForFunction(() => window.crawl_party.state.members[0].equipment_profile.assimilation.used === 1);
    await stopped(host);
    const learned = await own(host), armourMemory = memory(learned);
    assert.equal(learned.turns - start.turns, 5);
    assert.equal(item(learned, 'plate armour'), undefined);
    assert(learned.ac > start.ac, 'Inventory armour must improve the unarmoured body');
    assert(armourMemory.body_properties.some(effect => /^AC \+/.test(effect.label)));
    assert(armourMemory.slots[0].memory.effects.some(effect => effect.source_value > effect.value));
    await host.page.locator('.assimilation-inheritance').filter({ hasText: 'Body' }).waitFor();
    await host.page.screenshot({ path: path.join(out, 'armour-memory.png') });
    check('Five native owner turns consume one unequippable armour item and apply scaled body AC',
        { beforeAC: start.ac, afterAC: learned.ac, memory: armourMemory.slots[0] });

    const weapon = learned.inventory.find(entry => entry.equipped && /weapon/i.test(entry.kind_name));
    assert(weapon, 'Fighter must start with an equipped weapon');
    await setWear(host, weapon, 1500);
    let wear = memory(await own(host)).digesting.find(entry => entry.inv_slot === weapon.slot);
    assert.equal(wear.weapon_damage_percent, 50);
    assert.equal(wear.weapon_penalty, 4);
    await equipmentAction(host, weapon, 'unequip');
    const replacementText = await itemContext.start(host, item(await own(host), weapon.name));
    assert.match(replacementText, /Replaces the oldest memory when complete\./);
    assert.match(replacementText, /Current oldest: .*plate armour/);
    await key(host.page, 78);
    await ready(host.page);
    await waitAction(host);
    await equipmentAction(host, item(await own(host), weapon.name), 'use');
    wear = memory(await own(host)).digesting.find(entry => entry.inv_slot === weapon.slot);
    assert(wear.progress >= 50 && wear.progress < 60, 'Swapping preserves saved wear');
    check('Native weapon wear reduces damage and accuracy and survives swapping', { wear });

    const saved = await state(host.page);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await send(host.page, 'library_load', { id: recordId });
    await host.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
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
    check('Save and resume preserve memory bundles, wear and independent hero identities');

    await setWear(host, weapon, 2999);
    await waitAction(host);
    const dissolved = await own(host), full = memory(dissolved);
    assert.equal(dissolved.inventory.some(entry => entry.slot === weapon.slot), false);
    assert.equal(full.used, 1);
    assert.equal(full.slots[0].memory.family, 'Weapons');
    assert(full.slots[0].memory.effects.length > 0);
    assert(full.unarmed_properties.length > 0);
    assert(full.body_properties.length > 0, 'Weapon memories must strengthen the body');
    assert(!full.body_properties.some(effect => /^AC \+/.test(effect.label)), 'Oldest armour bundle must be overwritten at XL1');
    assert.equal(memory(await own(guest)) ?? null, null);
    await host.page.screenshot({ path: path.join(out, 'dissolved-weapon.png') });
    const guestBefore = await own(guest);
    await move(guest, 108, { x: guestBefore.pos.x + 1, y: guestBefore.pos.y });
    check('At the owner boundary a corroded weapon dissolves and replaces the oldest whole memory');
    evidence.final = await state(host.page);
    assert.deepEqual(evidence.errors, []);
    for (const target of clients)
        assert.deepEqual(await target.page.evaluate(() => window.qaErrors), []);
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
