/* Real pointer, saved setting and native movement in a disposable two-owner game. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, state, ready, lua } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL;
assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const output = process.env.MULTIPLAYER_PROOF_DIR;
fs.mkdirSync(output, { recursive: true });
const proof = { checks: [], errors: [] }, clients = [];
let browser;
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const host = await client(browser, url, 'H', proof.errors);
    const guest = await client(browser, url, 'G', proof.errors);
    clients.push(host, guest);
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    for (const slot of [1, 2]) {
        await host.page.locator('#party_seat_tab_' + slot).click();
        await host.page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
    }
    await send(guest.page, 'party_room_join', { room_id: host.username, slot: 3 });
    await host.page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of clients) {
        await target.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
        await ready(target.page);
    }
    await lua(guest, 'debug.disable("spawns",true); debug.disable("mon_act",true); dgn.dismiss_monsters("harmful"); you.moveto(38,34)');
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); dgn.dismiss_monsters("harmful"); for x=29,39 do for y=25,35 do dgn.grid(x,y,"floor") end end; dgn.grid(32,30,"rock_wall"); you.moveto(34,30); crawl.redraw_view()');
    await lua(host, 'you.moveto(30,30); crawl.redraw_view()');
    const page = host.page;
    await page.evaluate(() => {
        const module = suffix => require(Object.keys(require.s.contexts._.defined).find(name => name.endsWith(suffix)));
        const planned = module('/planned-route'), preview = planned.preview, comm = require('comm'), sendMessage = comm.send_message;
        const hero = () => window.crawl_party.state.members[window.crawl_party.state.controlled_slot];
        window.hoverProof = { module, hero, line: null, requests: 0, trail: [] };
        planned.preview = function (points) {
            window.hoverProof.line = points && points.map(point => ({ x: point.x, y: point.y }));
            return preview.apply(this, arguments);
        };
        comm.send_message = function (name) {
            if (name === 'travel_route') ++window.hoverProof.requests;
            return sendMessage.apply(this, arguments);
        };
        require('jquery')(document).on('party_state_rendered.hoverProof', () => {
            const proof = window.hoverProof, pos = proof.hero().pos, last = proof.trail.at(-1);
            if (!last || last.x !== pos.x || last.y !== pos.y) proof.trail.push({ x: pos.x, y: pos.y });
        });
    });
    const point = await page.evaluate(() => {
        const renderer = window.hoverProof.module('/dungeon_renderer');
        const box = renderer.element.getBoundingClientRect(), cell = renderer.canvas_coords(34, 30);
        const scale = box.width / renderer.element.width;
        return { x: box.left + (cell.x + cell.width / 2) * scale,
            y: box.top + (cell.y + cell.height / 2) * scale };
    });
    async function hover() {
        await page.mouse.move(10, 10);
        await page.mouse.move(point.x, point.y);
    }
    async function toggle(wanted) {
        await page.evaluate(() => window.hoverProof.module('graphics-dialog').open());
        await page.getByRole('switch', { name: /Movement path on hover/ }).setChecked(wanted);
        await page.waitForFunction(wanted => {
            const value = window.hoverProof.module('graphics-preferences').snapshot();
            return value.settings.route_preview === wanted && !value.saving;
        }, wanted);
        await page.keyboard.press('Escape');
    }
    const before = await state(page), guestBefore = await state(guest.page);
    const mode = await page.evaluate(() => document.documentElement.dataset.presentation);
    await toggle(false);
    await page.evaluate(() => { window.hoverProof.requests = 0; });
    await hover();
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.hoverProof.requests), 0);
    assert.equal(await page.evaluate(() => window.hoverProof.line), null);
    await page.screenshot({ path: path.join(output, 'route-off.png') });
    proof.checks.push('Saved toggle disables real hover queries and the preview');
    await toggle(true);
    await hover();
    await page.waitForFunction(() => window.hoverProof.line?.length > 2);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.presentation), mode);
    const line = await page.evaluate(() => window.hoverProof.line);
    assert.deepEqual(line[0], { x: 30, y: 30 });
    assert.deepEqual(line.at(-1), { x: 34, y: 30 });
    assert(!line.some(cell => cell.x === 32 && cell.y === 30));
    assert.deepEqual((await state(page)).members.map(member => member.turns), before.members.map(member => member.turns));
    proof.checks.push('Real hover follows a native detour and spends no turns; effects mode is preserved');
    await page.screenshot({ path: path.join(output, 'route-on.png') });
    await page.evaluate(() => { window.hoverProof.trail = [{ ...window.hoverProof.hero().pos }]; });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.hoverProof.hero().pos.x === 34 && window.hoverProof.hero().pos.y === 30);
    await ready(page);
    const trail = await page.evaluate(() => window.hoverProof.trail);
    assert.deepEqual(trail, line);
    assert.deepEqual((await state(guest.page)).members[1].pos, guestBefore.members[1].pos);
    proof.line = line; proof.trail = trail;
    proof.checks.push('The actual clicked walk matches every previewed cell and leaves the other owner in place');
    assert.deepEqual(proof.errors, []);
    proof.success = true;
})().catch(error => { proof.error = String(error.stack || error); process.exitCode = 1; })
    .finally(async () => {
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
        for (const target of clients) await target.context.close().catch(() => {});
        if (browser) await browser.close();
        console.log(JSON.stringify(proof));
    });
