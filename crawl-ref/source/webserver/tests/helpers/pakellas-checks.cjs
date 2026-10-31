/* Shared native workshop assertions; setup and XP award are supplied by the runtime adapter. */
const path = require('node:path');
const source = process.env.PAKELLAS_TEST_SOURCE || path.resolve(__dirname, '../../..');
const { assert, send, key, state, ready } =
    require(process.env.PAKELLAS_TEST_CLIENT || path.join(source, 'webserver/tests/multiplayer-native-client.cjs'));

async function settle(page) {
    for (let i = 0; i < 12; ++i) {
        const mode = await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(n => n.endsWith('/workflow-actions'));
            if (name && require(name).ready() && !require('jquery')('#loader').is(':visible')) return 'ready';
            const text = document.body.innerText;
            return text.includes('--more--') ? 'more' : text.includes('Increase (S)trength') ? 'stat' : 'pending';
        });
        if (mode === 'ready') return;
        if (mode === 'more' || mode === 'stat') await key(page, mode === 'more' ? 32 : 83);
        await page.waitForTimeout(100);
    }
    await ready(page);
}

async function runPakellasChecks({ host, recordId, evidence, repayLoan, out }) {
    const page = host.page;
    const check = name => { evidence.checks.push(name); console.log(name); };
    const hero = async () => (await state(page)).members[0];
    const wand = async () => (await hero()).inventory.find(item => item.name.includes('wand of flame'));
    const invoke = async action => {
        const member = await hero(), item = await wand();
        assert(item.device_actions.some(entry => entry.key === action && !entry.blocked_reason), action);
        await page.evaluate(({ member, item, action }) => {
            const name = Object.keys(require.s.contexts._.defined).find(n => n.endsWith('/workflow-actions'));
            require(name).itemAction(member, item, false, action);
        }, { member, item, action });
    };
    const aiming = () => page.waitForFunction(() => Object.keys(require.s.contexts._.defined)
        .some(name => name.endsWith('/game') && require(name).can_target()));
    const fire = async action => {
        const before = await hero();
        await invoke(action); await aiming();
        await send(page, 'click_cell', { x: before.pos.x + 2, y: before.pos.y, button: 1 });
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, before.turns);
        await settle(page);
    };
    assert(!(await hero()).abilities.some(entry => entry.name.includes('Field Kit')));
    assert.match((await wand()).name, /\(6\)/);
    assert(!await page.evaluate(() => document.body.innerText.includes('Unlinked temporary item:')));
    check('The chosen six-charge Field Kit is present and cannot be claimed again');

    const designationTurn = (await hero()).turns;
    await invoke('designate');
    await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, designationTurn);
    await settle(page);
    assert.match((await wand()).description, /3\/3 workshop uses; 6 ordinary charges/);
    const slotId = await page.locator('#quickbar_slots .hud-quick-slot').first().getAttribute('id');
    const pinned = page.locator('#' + slotId);
    await pinned.click({ modifiers: ['Shift'] });
    await page.locator('#quickbar_categories [data-quick-category="item"]').click();
    const catalog = page.locator(`#quickbar_catalog [data-quick-action="overclock"][data-quick-uid="${(await wand()).uid}"]`);
    assert.match(await catalog.getAttribute('data-tip-body'), /4 piety/);
    await catalog.click();
    await page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-label').includes('Overclock'), slotId);
    assert.match(await pinned.getAttribute('aria-label'), /Overclock/);
    const beforeCancel = await hero(), beforeWand = await wand();
    await pinned.click(); await aiming(); await key(page, 27); await settle(page);
    assert.equal((await hero()).turns, beforeCancel.turns);
    assert.equal((await hero()).piety, beforeCancel.piety);
    assert.equal((await wand()).workshop_stamp, beforeWand.workshop_stamp);
    check('A real pinned Overclock opens targeting directly; cancelling spends no turn, piety, reserve or finite charge');

    const before = await hero();
    await fire('overclock');
    assert.match((await wand()).description, /1\/3 workshop uses; 6 ordinary charges/);
    assert.equal((await hero()).piety, before.piety - 4);
    await fire('overclock');
    assert.match((await wand()).description, /0\/3 workshop uses; 6 ordinary charges/);
    await page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-disabled') === 'true', slotId);
    assert.equal(await pinned.getAttribute('aria-disabled'), 'true');
    assert.equal((await hero()).piety, before.piety - 8);
    check('Two real Overclocks apply rounded reserve debt and preserve all finite charges');
    await fire('breakthrough');
    assert.match((await wand()).description, /0\/3 workshop uses; 6 ordinary charges/);
    assert.match((await wand()).description, /loan: 100% remaining/);
    assert.equal((await hero()).piety, before.piety - 16);
    assert.match((await wand()).device_actions.find(entry => entry.key === 'breakthrough').blocked_reason, /Repay/);
    await fire('overclock_finite');
    assert.match((await wand()).description, /0\/3 workshop uses; 4 ordinary charges/);
    assert.match((await wand()).description, /loan: 100% remaining/);
    check('Breakthrough creates one personal loan; explicitly chosen finite Overclock remains separate');

    const stale = await wand(), staleHero = await hero();
    await send(page, 'inv_item_use', { slot: stale.slot, expected_slot: 0,
        expected_name: stale.name, expected_uid: stale.uid + 1,
        expected_workshop: stale.workshop_stamp, action: 'overclock_finite' });
    await page.waitForFunction(() => window.qaErrors.some(text => text.includes('device or workshop funding changed')));
    assert.equal((await wand()).workshop_stamp, stale.workshop_stamp);
    assert.equal((await hero()).turns, staleHero.turns);
    check('Native item identity validation rejects stale browser actions without payment');

    await repayLoan({ host, page, hero, wand });
    assert.match((await wand()).description, /0\/3 workshop uses; 4 ordinary charges/);
    assert.match((await wand()).description, /loan: (?!100%)\d+% remaining/);
    const saved = await wand(), savedHero = await hero();
    evidence.saved = { item: saved, piety: savedHero.piety, turns: savedHero.turns };
    await send(page, 'record_save', { exit: true });
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await send(page, 'library_load', { id: recordId });
    await page.waitForFunction(() => window.crawl_party?.state?.members?.[0]?.god === 'Pakellas');
    await ready(page);
    assert.equal((await wand()).uid, saved.uid);
    assert.equal((await wand()).workshop_stamp, saved.workshop_stamp);
    assert.equal((await wand()).description, saved.description);
    assert(!(await hero()).abilities.some(entry => entry.name.includes('Field Kit')));
    check('XP pays the loan first; save and reload preserve identity, charge debt and gift history');
    assert.deepEqual(evidence.errors, []);
    await page.screenshot({ path: path.join(out, 'pakellas-native.png'), fullPage: true });
    await send(page, 'record_save', { exit: true });
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    evidence.passed = true;
}

module.exports = { settle, runPakellasChecks };
