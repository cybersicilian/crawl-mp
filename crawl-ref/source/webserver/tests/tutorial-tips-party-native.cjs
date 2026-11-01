/* Two real accounts in one expedition: the tips only a party can trigger. */
const { assert, chromium, client, send, key, state, ready, lua, named } = require('./multiplayer-native-client.cjs');
const { promptLua } = require('./helpers/native-wizard.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8932';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const fits = page => named(page, 'tutorial-tips', 'module.fits()');
const { createLiveRuleProof } = require('./helpers/live-rule-proof.cjs');
const proof = createLiveRuleProof({ name: 'party', read: fits, timeout: 10000, output: process.env.TIPS_PROOF_DIR,
    capture: page => page.evaluate(() => ({
        members: window.crawl_party?.state?.members, multiplayer: window.crawl_party?.state?.multiplayer,
        controlledSlot: window.crawl_party?.state?.controlled_slot,
        watching: require('client').is_watching(), inGame: require('client').in_game(),
        inputMode: require(Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/game-context'))).get_input_mode(),
        blocking: [...document.querySelectorAll('#ui-stack > *, dialog[open]')].map(node => node.textContent.slice(0, 700)),
        messages: [...document.querySelectorAll('#messages .game_message')].slice(-5).map(node => node.textContent),
        displayed: [...document.querySelectorAll('.tutorial-tip[data-tip]')].map(node => node.dataset.tip)
    })) });
const results = proof.results;
async function expectTips(target, name, wanted, absent = []) {
    await proof.expect(target.page, name, wanted, absent);
}
const own = async target => (await state(target.page)).members[target.slot];
let browser, deadline;
(async () => {
    const errors = [];
    browser = await chromium.launch({ headless: true, ...(process.env.TACTICAL_BROWSER_CHANNEL ? { channel: process.env.TACTICAL_BROWSER_CHANNEL } : {}) });
    deadline = setTimeout(async () => { console.error('FAILED deadline'); await browser.close(); process.exit(3); },
        Number(process.env.TIPS_DEADLINE || 300000));
    deadline.unref();
    const host = await client(browser, url, 'H', errors), guest = await client(browser, url, 'G', errors);
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    const leader = host.page.locator('.party-slot-box[data-slot="0"]');
    await leader.locator('.party-slot-species').selectOption('Deep Elf');
    await leader.locator('.party-slot-job').selectOption('Conjurer');
    await send(guest.page, 'party_room_join', { room_id: host.username, slot: 1 });
    for (const slot of [2, 3]) {
        await host.page.locator('#party_seat_tab_' + slot).click();
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
    }
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of [host, guest]) {
        await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
            && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 180000 });
        await ready(target.page);
        await target.page.waitForFunction(() => { const name = Object.keys(require.s.contexts._.defined).find(entry => entry.endsWith('/tutorial-tips'));
            return name && require(name).catalog().length > 60; }, null, { timeout: 60000 });
    }
    await lua(host, 'debug.disable("spawns",true); dgn.dismiss_monsters("harmful")');
    await expectTips(host, 'a real party', ['party'], ['switch_hero']);
    await expectTips(guest, 'a real party, seen by the guest', ['party'], ['switch_hero']);
    if (process.env.TIPS_PARTY_ONLY_DOWNED !== '1') {
    for (let i = 0; i < 40 && (await own(host)).turns < 32; i++) { await key(host.page, 46); await host.page.waitForTimeout(150); await ready(host.page); }
    for (let i = 0; i < 40 && (await own(guest)).turns < 32; i++) { await key(guest.page, 46); await guest.page.waitForTimeout(150); await ready(guest.page); }
    await expectTips(host, 'party chat after settling in', ['chat']);
    await expectTips(host, 'sharing items', ['trade']);
    await expectTips(host, 'a known spell', ['spells']);
    await lua(guest, 'debug.goto_place("D:2")');
    await guest.page.waitForTimeout(800);
    await expectTips(host, 'a teammate on another floor', ['floors']);
    await lua(host, 'dgn.create_monster(you.x_pos()+3,you.y_pos(),"orc warrior")');
    await host.page.waitForTimeout(500);
    for (let i = 0; i < 10; i++) {
        const hero = await own(host);
        if (hero.mp / hero.mp_max <= 0.25) break;
        await key(host.page, 122); await host.page.waitForTimeout(300); await key(host.page, 97); await host.page.waitForTimeout(400);
        await key(host.page, 13); await host.page.waitForTimeout(700);
        await key(host.page, 27); await host.page.waitForTimeout(300);
    }
    console.log('mp', (await own(host)).mp, '/', (await own(host)).mp_max);
    await expectTips(host, 'out of magic in a fight', ['low_magic']);
    await lua(host, 'debug.dismiss_monsters()');
    }
    await promptLua(guest, 'you.die("test"); crawl.sendkeys(string.char(27))');
    await guest.page.waitForFunction(() => /Die\?/.test(document.body.innerText));
    await key(guest.page, 89);
    await guest.page.waitForFunction(() => {
        const state = window.crawl_party.state, hero = state.members[state.controlled_slot];
        return hero.alive === false || hero.ghost_haunting;
    });

    await key(guest.page, 13);
    await guest.page.waitForTimeout(300);
    const fallen = await own(host), peer = (await state(host.page)).members[guest.slot];
    console.log('peer', JSON.stringify({ alive: peer.alive, ghost: peer.ghost_haunting, hp: fallen.hp }));
    await expectTips(host, 'a fallen teammate', ['teammate_down']);
    await expectTips(guest, 'the fallen player', ['downed']);
    const failed = results.filter(result => !result.pass);
    console.log(`${results.length - failed.length}/${results.length} party situations passed`);
    console.log('page errors', errors.length, JSON.stringify(errors.slice(0, 3)));
    await browser.close();
    process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error('FAILED', error.message.slice(0, 400)); process.exitCode = 2; })
    .finally(async () => { clearTimeout(deadline); if (browser) await browser.close(); });
