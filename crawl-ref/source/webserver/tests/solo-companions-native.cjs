/* Solo companion control and preservation of an existing mixed save. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, state, ready, waitAction } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8895';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.SOLO_PROOF_DIR || '/tmp/dcss-multiplayer/solo';
fs.mkdirSync(out, { recursive: true });
const evidence = { errors: [] };
let browser;
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const host = await client(browser, url, 'H', evidence.errors);
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    for (const slot of [1, 2])
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
    await host.page.locator(".party-slot-box[data-slot='3'] .party-mode-btn[data-mode='closed']").click();
    await host.page.waitForFunction(() => /3 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    await host.page.locator('#btn_launch_party_room').click();
    await host.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3, null, { timeout: 120000 });
    await ready(host.page);
    assert.equal((await state(host.page)).multiplayer, false);
    assert(await host.page.locator('#party_banner_cycle').isVisible());
    await host.page.locator(".party-card[data-party-slot='2'] .party-control-btn").click();
    await host.page.waitForFunction(() => window.crawl_party.state.controlled_slot === 2);
    host.slot = 2;
    const action = await waitAction(host);
    assert.equal(action.after.members[0].turns, action.before.members[0].turns);
    assert.equal(action.after.members[1].turns, action.before.members[1].turns);
    await host.page.locator('#party_banner_cycle').click();
    await host.page.waitForFunction(() => window.crawl_party.state.controlled_slot === 0);
    host.slot = 0;
    const beforeJoin = await state(host.page);
    const guest = await client(browser, url, 'G', evidence.errors);
    await send(guest.page, 'watch', { username: host.username });
    await guest.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3);
    await send(guest.page, 'join_party');
    await guest.page.waitForFunction(() => window.qaErrors.some(error => error.includes('unclaimed companions')));
    assert.equal((await state(host.page)).multiplayer, false);
    assert.deepEqual((await state(host.page)).controllable_slots, [0, 1, 2]);
    assert.deepEqual((await state(host.page)).members.map(member => member.player_id),
        beforeJoin.members.map(member => member.player_id));
    assert.deepEqual((await state(host.page)).members.map(member => member.inventory),
        beforeJoin.members.map(member => member.inventory));
    assert.deepEqual(evidence.errors, []);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    Object.assign(evidence, { soloControl: true, nativeCompanionAction: true, mixedSavePreserved: true });
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
})().catch(error => { console.error(error); process.exitCode = 1; })
    .finally(async () => { if (browser) await browser.close(); });
