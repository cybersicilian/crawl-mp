/* Real transfers across two isolated browser sessions and native inventories. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8901';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.TRADE_NATIVE_PROOF_DIR || '/tmp/dcss-party-trade/native';
fs.mkdirSync(out, { recursive: true });
const suffix = Date.now().toString(36), password = crypto.randomBytes(16).toString('hex');
const clients = [], errors = [], cases = [];
let browser;
const state = page => page.evaluate(() => structuredClone(window.crawl_party.state));
const send = (page, msg, fields) => page.evaluate(({ msg, fields }) => require('comm').send_message(msg, fields), { msg, fields });
async function ready(page) {
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
}
async function client(role) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(), username = 'Trade' + role + suffix;
    page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.stack || error.message));
    const result = { page, context, username }; clients.push(result);
    await page.goto(url); await page.locator('#reg_link').click();
    await page.locator('#reg_username').fill(username); await page.locator('#reg_password').fill(password);
    await page.locator('#reg_repeat_password').fill(password); await page.locator('#reg_submit').click();
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.evaluate(() => {
        window.tradeResults = []; window.actionErrors = [];
        const comm = require('comm'), original = comm.handle_message;
        comm.handle_message = function (message) {
            if (message.msg === 'party_trade_result') window.tradeResults.push(message);
            if (message.msg === 'game_action_error') window.actionErrors.push(message);
            return original.apply(this, arguments);
        };
    });
    return result;
}
const stack = (snapshot, slot) => snapshot.members[slot].inventory.find(item => /poison/.test(item.name));
const packet = (snapshot, slot = 0) => {
    const item = stack(snapshot, slot);
    return { expected_slot: slot, recipient_slot: 1 - slot, slot: item.slot,
        expected_name: item.name, expected_qty: item.qty, quantity: 1,
        request_id: crypto.randomUUID() };
};
async function rejected(page, fields) {
    const before = await state(page), count = await page.evaluate(() => window.tradeResults.length);
    await send(page, 'party_trade', fields);
    await page.waitForFunction(count => window.tradeResults.length > count, count);
    assert.equal(await page.evaluate(() => window.tradeResults.at(-1).ok), false);
    const after = await state(page);
    assert.deepEqual(after.members.map(hero => hero.inventory), before.members.map(hero => hero.inventory));
    assert.deepEqual(after.members.map(hero => hero.turns), before.members.map(hero => hero.turns));
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const host = await client('H'), guest = await client('G');
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    for (const slot of [0, 1]) {
        const row = host.page.locator(`.party-slot-box[data-slot='${slot}']`);
        if (slot) await row.locator('[data-mode=companion]').click();
        await row.locator('.party-slot-species').selectOption('Human');
        await row.locator('.party-slot-job').selectOption('Brigand');
    }
    for (const slot of [2, 3]) await host.page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode=closed]`).click();
    await host.page.locator('#btn_launch_party_room').click();
    await host.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
    await guest.page.evaluate(username => { window.location.hash = '#watch-' + username; }, host.username);
    await guest.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
    await ready(host.page); await ready(guest.page);
    await send(guest.page, 'join_party');
    await guest.page.waitForFunction(() => window.crawl_party.state.controlled_slot === 1);
    const initial = await state(host.page);
    assert.equal(initial.party_trade, true);
    assert(initial.members[0].trade_targets.includes(1));
    const original = [stack(initial, 0).qty, stack(initial, 1).qty];
    await host.page.locator('.party-card[data-party-slot="1"] .party-trade-btn').click();
    const slot = stack(initial, 0).slot;
    await host.page.locator('#trade_quantity_' + slot).fill('2');
    await host.page.locator('#trade_give_' + slot).click();
    for (const target of clients) await target.page.waitForFunction(qty => {
        const item = window.crawl_party.state.members[0].inventory.find(item => /poison/.test(item.name));
        return item.qty === qty;
    }, original[0] - 2);
    await host.page.waitForFunction(turns => window.crawl_party.state.members[0].turns === turns, initial.members[0].turns + 1);
    await ready(host.page);
    const transferred = await state(host.page);
    assert.equal(stack(transferred, 1).qty, original[1] + 2);
    assert.equal(transferred.members[0].turns, initial.members[0].turns + 1);
    assert.equal(transferred.members[1].turns, initial.members[1].turns);
    assert(await host.page.locator('#party_trade_dialog').isVisible());
    assert.equal(await host.page.locator('#trade_quantity_' + slot).inputValue(), '2');
    assert.equal((await state(guest.page)).controlled_slot, 1);
    cases.push('A two-item split merges into the recipient stack, costs the giver one turn, and keeps the picker open');
    await host.page.locator('#party_trade_dialog').screenshot({ path: path.join(out, 'trade-native.png') });
    await host.page.locator('#party_trade_close').click();
    await rejected(host.page, { ...packet(transferred), expected_qty: original[0] });
    await rejected(host.page, { ...packet(transferred), quantity: -1 });
    const equipped = transferred.members[0].inventory.find(item => item.equipped);
    await rejected(host.page, { ...packet(transferred), slot: equipped.slot,
        expected_name: equipped.name, expected_qty: equipped.qty });
    cases.push('Stale quantities, negative amounts and equipped gear are rejected without item or time changes');
    // A guest cannot claim the source identity of the owner.
    await rejected(guest.page, { ...packet(await state(guest.page)), player_id: 0 });
    cases.push('A forged guest player_id cannot transfer the host inventory');
    await guest.page.locator('.party-card[data-party-slot="0"] .party-trade-btn').click();
    const received = stack(await state(guest.page), 1);
    await guest.page.locator('#trade_quantity_' + received.slot).fill('2');
    await guest.page.locator('#trade_give_' + received.slot).click();
    for (const target of clients) await target.page.waitForFunction(qty =>
        window.crawl_party.state.members[0].inventory.find(item => /poison/.test(item.name)).qty === qty, original[0]);
    await guest.page.waitForFunction(turns => window.crawl_party.state.members[1].turns === turns, initial.members[1].turns + 1);
    const returned = await state(host.page);
    assert.equal(stack(returned, 1).qty, original[1]);
    assert.equal(returned.members[1].turns, initial.members[1].turns + 1);
    cases.push('The guest can give items back from their own hero without changing either connection selection');
    await guest.page.locator('#party_trade_close').click(); await ready(host.page);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify({ passed: true, cases, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, cases, out }));
})().catch(async error => {
    for (const [index, target] of clients.entries()) {
        fs.writeFileSync(path.join(out, 'failure-state-' + index + '.json'), JSON.stringify(await state(target.page).catch(() => null), null, 2));
        await target.page.screenshot({ path: path.join(out, 'failure-' + index + '.png') }).catch(() => {});
        fs.writeFileSync(path.join(out, 'failure-' + index + '.txt'), await target.page.locator('body').innerText().catch(() => ''));
    }
    console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
