/* Two real browser sessions, native actions and per-hero movement/turn evidence. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8897';
const hostname = new URL(url).hostname;
assert(['localhost', '127.0.0.1'].includes(hostname)
    || (hostname === 'dcss.iancaltabiano.com' && process.env.DCSS_CONTROL_ALLOW_LIVE === '1'));
const out = process.env.CONTROL_PROOF_DIR || '/tmp/dcss-party-control-proof';
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
const suffix = Date.now().toString(36);
const password = crypto.randomBytes(16).toString('hex');
const clients = [], evidence = { url, actions: [], errors: [] };
let browser;

async function client(role) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    const username = 'Control' + role + suffix;
    const result = { page, context, username };
    clients.push(result);
    await page.goto(url);
    await page.locator('#reg_link').click();
    await page.locator('#reg_username').fill(username);
    await page.locator('#reg_password').fill(password);
    await page.locator('#reg_repeat_password').fill(password);
    await page.locator('#reg_submit').click();
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.evaluate(() => {
        window.controlErrors = [];
        const comm = require('comm'), original = comm.handle_message;
        comm.handle_message = function (message) {
            if (message.msg === 'game_action_error') window.controlErrors.push(message.message);
            return original.apply(this, arguments);
        };
    });
    return result;
}
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
const send = (page, msg, data = {}) => page.evaluate(({ msg, data }) =>
    require('comm').send_message(msg, data), { msg, data });
async function ready(page) {
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
}
async function assertSelections(host, guest, hostSlot = 0) {
    for (const [target, slot] of [[host, hostSlot], [guest, 1]]) {
        await target.page.waitForFunction(slot => window.crawl_party.state.controlled_slot === slot, slot);
        const current = await state(target.page);
        assert((await target.page.locator('#party_banner_who').innerText()).includes(current.members[slot].name));
        assert.equal(await target.page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return require(name).controlledSlot();
        }), slot);
        await ready(target.page);
        await target.page.waitForFunction(slot => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
            const center = require(name).view_center;
            const hero = window.crawl_party.state.members.find(member => member.slot === slot);
            return center.x === hero.pos.x && center.y === hero.pos.y;
        }, slot);
    }
}
async function act(target, slot, kind = 'wait') {
    const page = target.page;
    await ready(page);
    const before = await state(page);
    if (kind === 'wait') {
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('.');
    } else {
        // Party state can arrive before the corresponding native map delta.
        const destinationHandle = await page.waitForFunction(slot => {
            const modules = require.s.contexts._.defined;
            const named = suffix => require(Object.keys(modules).find(name => name.endsWith('/' + suffix)));
            const map = named('map_knowledge'), enums = named('enums');
            const party = window.crawl_party.state, own = party.members[slot].pos;
            const walkable = [enums.MF_FLOOR, enums.MF_ITEM, enums.MF_STAIR_UP, enums.MF_STAIR_DOWN];
            let door = null;
            const directions = [[-1, 0, 'h'], [1, 0, 'l'], [0, -1, 'k'], [0, 1, 'j'],
                [-1, -1, 'y'], [1, -1, 'u'], [-1, 1, 'b'], [1, 1, 'n']];
            for (const [dx, dy, key] of directions) {
                const x = own.x + dx, y = own.y + dy, cell = map.get(x, y);
                // Map knowledge remains native even with a local camera.
                if (walkable.includes(cell.mf) && !cell.mon
                    && !party.members.some(member => member.pos?.x === x && member.pos?.y === y))
                    return { x, y, key };
                if (cell.mf === enums.MF_DOOR && !cell.mon
                    && !party.members.some(member => member.pos?.x === x && member.pos?.y === y))
                    door = { x, y, key, door: true };
            }
            return door;
        }, slot);
        const destination = await destinationHandle.jsonValue();
        await destinationHandle.dispose();
        assert(destination, 'A known unoccupied adjacent floor or door is required for movement proof');
        const move = async () => {
            if (kind === 'pointer') await send(page, 'click_cell', { x: destination.x, y: destination.y, button: 1 });
            else {
                await page.evaluate(() => document.activeElement.blur());
                await page.keyboard.press(destination.key);
            }
        };
        await move();
        if (destination.door) {
            await page.waitForFunction(({ slot, turns }) => window.crawl_party.state.members[slot].turns > turns,
                { slot, turns: before.members[slot].turns });
            const opened = (await state(page)).members[slot].pos;
            if (opened.x !== destination.x || opened.y !== destination.y) {
                await ready(page);
                await move();
            }
        }
        await page.waitForFunction(({ slot, destination }) => {
            const hero = window.crawl_party.state.members[slot];
            return hero.pos.x === destination.x && hero.pos.y === destination.y;
        }, { slot, destination });
    }
    await page.waitForFunction(({ slot, turns }) => window.crawl_party.state.members[slot].turns > turns,
        { slot, turns: before.members[slot].turns });
    const after = await state(page);
    for (const member of before.members) {
        if (member.slot === slot) continue;
        assert.equal(after.members[member.slot].turns, member.turns, 'Only the sender hero takes a turn');
        assert.deepEqual(after.members[member.slot].pos, member.pos, 'Other heroes do not move');
    }
    evidence.actions.push({ sender: target.username, slot, kind,
        before: before.members.map(member => ({ slot: member.slot, turns: member.turns, pos: member.pos })),
        after: after.members.map(member => ({ slot: member.slot, turns: member.turns, pos: member.pos })) });
}

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const host = await client('H'), guest = await client('G');
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    for (const slot of [1, 2])
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
    await send(guest.page, 'party_room_join', { room_id: host.username, slot: 3 });
    await host.page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of [host, guest])
        await target.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
    await guest.page.waitForFunction(() => window.crawl_party_slot === 1);
    await assertSelections(host, guest);
    for (const [target, slot] of [[host, 0], [guest, 1]]) {
        assert.deepEqual((await state(target.page)).controllable_slots, [slot]);
        assert.equal(await target.page.locator('#party_banner_cycle').isVisible(), false);
        assert.equal(await target.page.locator('.party-control-btn').count(), 0);
    }
    evidence.joinLocksReservedHeroes = true;

    const beforeCamera = await state(host.page);
    await host.page.locator(".party-card[data-party-slot='1']").getByRole('button', { name: 'Center camera', exact: true }).click();
    assert.equal((await state(host.page)).controlled_slot, 0, 'Centering another hero cannot transfer control');
    assert.deepEqual((await state(host.page)).members.map(member => member.turns),
        beforeCamera.members.map(member => member.turns), 'Camera actions cannot consume turns');
    await host.page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
        const center = require(name).view_center, hero = window.crawl_party.state.members[1];
        return center.x === hero.pos.x && center.y === hero.pos.y;
    });
    await host.page.locator('#party_banner_center').click();
    await assertSelections(host, guest);
    evidence.localCameraFollowsControl = true;

    // Alternating commands must never inherit the previously acting hero.
    for (const [target, slot, kind] of [[guest, 1, 'wait'], [host, 0, 'wait'],
        [guest, 1, 'keyboard'], [host, 0, 'keyboard'], [guest, 1, 'pointer'], [host, 0, 'pointer']]) {
        await act(target, slot, kind);
        await assertSelections(host, guest);
    }
    // Another player's keystrokes cannot answer an open inventory interaction.
    await send(guest.page, 'key', { keycode: 105 });
    await guest.page.locator('.workflow-inventory:visible').waitFor();
    const blockedBefore = await host.page.evaluate(() => window.controlErrors.length);
    await send(host.page, 'key', { keycode: 106 });
    await host.page.waitForFunction(count => window.controlErrors.length > count, blockedBefore);
    await send(guest.page, 'key', { keycode: 27 });
    await ready(guest.page);
    evidence.sharedPromptIsolation = true;
    // Stale controls and direct requests cannot take an unclaimed companion,
    // another player's character, or cycle to a different character.
    const beforeRejected = await state(host.page);
    for (const target of [host, guest]) {
        for (const [msg, fields] of [['switch_player', { slot: 2, control_owner: true }],
            ['switch_player', { slot: target === host ? 1 : 0 }], ['cycle_player', {}],
            ['party_action', { action: 'switch_player', slot: 2 }],
            ['party_action', { action: 'cycle_player' }]]) {
            const count = await target.page.evaluate(() => window.controlErrors.length);
            await send(target.page, msg, fields);
            await target.page.waitForFunction(count => window.controlErrors.length > count, count);
        }
    }
    assert.deepEqual((await state(host.page)).members.map(member => member.turns),
        beforeRejected.members.map(member => member.turns), 'Rejected switches spend no turns');
    evidence.multiplayerSwitchesRejected = true;
    await assertSelections(host, guest);

    await guest.page.reload();
    await guest.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
    await send(guest.page, 'join_party');
    await guest.page.waitForFunction(() => window.crawl_party_slot === 1);
    await act(guest, 1);
    await act(host, 0);
    await assertSelections(host, guest);
    evidence.reconnectRetainsHero = true;
    for (const [name, target] of [['host', host], ['guest', guest]])
        await target.page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
    assert.deepEqual(evidence.errors, []);
    await send(host.page, 'record_save', { exit: true });
    await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ success: true, nativeActions: evidence.actions.length, out }));
})().catch(async error => {
    evidence.failure = String(error.stack);
    fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify(evidence, null, 2));
    for (const [index, target] of clients.entries())
        if (!target.page.isClosed()) await target.page.screenshot({ path: path.join(out, 'failure-' + index + '.png') });
    console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
