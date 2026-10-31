const path = require('node:path');
const source = process.env.PAKELLAS_TEST_SOURCE || path.resolve(__dirname, '../../..');
const { send, key, ready, lua, packets } = require(process.env.PAKELLAS_TEST_CLIENT
    || path.join(source, 'webserver/tests/multiplayer-native-client.cjs'));
const { settle } = require('./pakellas-checks.cjs');

async function preparePakellasGame(host) {
    const page = host.page;
    await page.locator('#lobby_home [data-lobby-create]').click();
    const leader = page.locator('.party-slot-box[data-slot="0"]');
    await leader.locator('.party-slot-species').selectOption('Human');
    await leader.locator('.party-slot-job').selectOption('Fighter');
    for (const slot of [1, 2, 3])
        await page.locator(`.party-slot-box[data-slot="${slot}"] [data-mode="closed"]`).click();
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1,
        undefined, { timeout: 60000 });
    await ready(page);
    const recordId = (await packets(host)).find(packet => packet.msg === 'record_identity').game_id;
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); dgn.dismiss_monsters("harmful"); for x=30,52 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35)');
    await key(page, 38); await key(page, 95);
    const prompt = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
    await prompt.fill('Pakellas'); await prompt.press('Enter');
    await page.waitForFunction(() => /Field Kit: choose one device|--more--/.test(document.body.innerText));
    if (!await page.evaluate(() => document.body.innerText.includes('Field Kit: choose one device')))
        await key(page, 32);
    await page.waitForFunction(() => document.body.innerText.includes('Field Kit: choose one device'));
    await key(page, 97); await settle(page);
    await page.waitForFunction(() => window.crawl_party.state.members[0].god === 'Pakellas');
    await lua(host, 'you.piety(200); crawl.redraw_stats()');
    return recordId;
}

module.exports = { preparePakellasGame };
