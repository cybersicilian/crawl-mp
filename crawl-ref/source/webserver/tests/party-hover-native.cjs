/* Real localhost clients, native map hit-testing and receiving-canvas pixels. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18982';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.HOVER_PROOF_DIR || '/tmp/dcss-party-hover-proof';
fs.mkdirSync(output, { recursive: true });
const suffix = Date.now().toString(36), clients = [], errors = [];
const evidence = { url, checks: [], errors };
let browser;
const check = text => { evidence.checks.push(text); console.log(text); };

async function client(role, scale = 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    // These clients represent separate computers, each with its own active window.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const result = { page, context, username: 'Hover' + role + suffix, sent: [] };
    clients.push(result);
    page.on('pageerror', error => errors.push(role + ': ' + error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(js|css)(\?|$)/.test(response.url())) errors.push(response.url());
    });
    page.on('websocket', socket => socket.on('framesent', frame => {
        try { result.sent.push(JSON.parse(String(frame.payload))); } catch { /* Binary frames are unrelated. */ }
    }));
    await page.goto(url);
    await page.locator('#reg_link').click();
    await page.locator('#reg_username').fill(result.username);
    const password = crypto.randomBytes(8).toString('hex');
    await page.locator('#reg_password').fill(password);
    await page.locator('#reg_repeat_password').fill(password);
    await page.locator('#reg_submit').click();
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.evaluate(() => {
        const comm = require('comm'), original = comm.handle_message;
        window.hoverReceived = [];
        comm.handle_message = function (message) {
            if (['party_hover', 'party_hover_reset', 'party_joined'].includes(message.msg))
                window.hoverReceived.push(JSON.parse(JSON.stringify(message)));
            return original.apply(this, arguments);
        };
        window.hoverModule = suffix => require(Object.keys(require.s.contexts._.defined)
            .find(name => name.endsWith('/' + suffix)));
    });
    return result;
}
async function launch(target, count) {
    const page = target.page;
    await page.locator('#lobby_home [data-lobby-create]').click();
    for (let slot = 1; slot < 4; slot++)
        await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='${slot < count ? 'companion' : 'closed'}']`).click();
    await page.waitForFunction(count => document.querySelector('#btn_launch_party_room').textContent.includes(count + ' heroes'), count);
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(count => window.crawl_party?.state?.members?.length === count, count, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('#dungeon')?.width > 100 && window.hoverReceived.some(m => m.msg === 'party_hover_reset'));
}
async function watch(target, host, slot) {
    const selector = slot === null ? '.username a' : 'a.coop-join-table-btn';
    await target.page.locator(`#player_list ${selector}[href='#watch-${host.username}']`).click();
    await target.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3);
    if (slot !== null) {
        // Bind through the real server protocol; hover itself uses pointer events.
        await target.page.evaluate(slot => require('comm').send_message('join_party', { slot }), slot);
        await target.page.waitForFunction(slot => window.hoverReceived.some(m => m.msg === 'party_joined' && m.slot === slot), slot);
    }
}
async function point(target, tile) {
    const coords = await target.page.evaluate(tile => {
        const renderer = window.hoverModule('dungeon_renderer'), rect = renderer.element.getBoundingClientRect();
        const at = renderer.canvas_coords(tile.x, tile.y), ratio = devicePixelRatio;
        return { x: rect.left + (at.x + at.width / 2) / ratio,
            y: rect.top + (at.y + at.height / 2) / ratio };
    }, tile);
    await target.page.mouse.move(coords.x, coords.y);
}
async function received(target, source, active = true) {
    await target.page.waitForFunction(({ source, active }) => window.hoverReceived.some(message =>
        message.msg === 'party_hover' && message.user === source && message.active === active),
    { source: source.username, active });
}
async function colors(target, tile) {
    return target.page.evaluate(tile => {
        const renderer = window.hoverModule('dungeon_renderer'), cell = renderer.canvas_coords(tile.x, tile.y);
        const pixels = renderer.ctx.getImageData(cell.x, cell.y, cell.width, cell.height).data;
        const counts = [0, 0, 0], colors = [[252, 233, 79], [52, 226, 226], [138, 226, 52]];
        for (let i = 0; i < pixels.length; i += 4)
            colors.forEach((color, slot) => { if (color.every((value, index) => pixels[i + index] === value)) counts[slot]++; });
        return counts;
    }, tile);
}
async function clearLog(target) { await target.page.evaluate(() => { window.hoverReceived = []; }); }
const time = target => target.page.evaluate(() => window.crawl_party.state.members.map(member => member.turns));

(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const host = await client('H'), guest = await client('G', 2), third = await client('T'), outsider = await client('O');
    await launch(host, 3);
    await launch(outsider, 2);
    await watch(guest, host, 1);
    await watch(third, host, null);
    const tiles = await host.page.evaluate(() => {
        const renderer = window.hoverModule('dungeon_renderer'), map = window.hoverModule('map_knowledge');
        const result = [], members = window.crawl_party.state.members;
        for (let y = renderer.view.y + 2; y < renderer.view.y + renderer.rows - 2; y++)
            for (let x = renderer.view.x + 2; x < renderer.view.x + renderer.cols - 2; x++) {
                const cell = map.get(x, y);
                if (cell.t && map.visible(cell) && !cell.mon && !cell.item_name && /floor/i.test(cell.feature_name || '')
                    && !members.some(member => member.pos?.x === x && member.pos?.y === y)) result.push({ x, y });
            }
        const origin = members[0].pos;
        return result.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y)
            - Math.hypot(b.x - origin.x, b.y - origin.y)).slice(0, 3);
    });
    assert.equal(tiles.length, 3, 'Three native known floor tiles are required');
    const [first, second] = tiles, before = await time(host);
    evidence.tiles = tiles;
    await point(guest, first);
    await received(host, guest);
    await received(third, guest);
    assert((await colors(host, first))[1] > 20, 'P2 cyan outline must be rendered on the host canvas');
    assert.equal((await colors(guest, first))[1], 0, 'The sending client retains only its local cursor');
    assert(!await outsider.page.evaluate(() => window.hoverReceived.some(message => message.msg === 'party_hover')));
    check('Real P2 hover reaches host and spectator, renders pixels, excludes self and unrelated expedition');
    await guest.page.mouse.move(1, 1);
    await host.page.waitForFunction(() => window.hoverReceived.some(m => m.msg === 'party_hover' && m.active === false));
    assert.equal((await colors(host, first))[1], 0);
    check('Pointer leave immediately erases the receiving outline');

    const start = third.sent.length;
    await point(third, first);
    await third.page.waitForTimeout(150);
    assert(!third.sent.slice(start).some(message => message.msg === 'party_hover' && message.active));
    await third.page.mouse.move(1, 1);
    // Exercise the real server claim protocol after first proving spectator isolation.
    await third.page.evaluate(() => require('comm').send_message('join_party', {}));
    await third.page.waitForFunction(() => window.hoverReceived.some(m => m.msg === 'party_joined' && m.slot === 2));
    await point(guest, first);
    await point(third, first);
    await received(host, third);
    const overlap = await colors(host, first);
    assert(overlap[1] > 20 && overlap[2] > 20, 'Both P2 and P3 colors must remain visible on a shared tile');
    await host.page.screenshot({ path: path.join(output, 'overlapping-hover-highlights.png') });
    check('Spectators cannot publish; claimed P2 and P3 hovers overlap visibly');
    await clearLog(host);
    await point(guest, second);
    await host.page.waitForFunction(({ x, y }) => window.hoverReceived.some(m => m.msg === 'party_hover' && m.slot === 1 && m.x === x && m.y === y), second);
    assert.equal((await colors(host, first))[1], 0);
    assert((await colors(host, first))[2] > 20 && (await colors(host, second))[1] > 20);
    check('High-DPI hit-testing follows tile movement and clears only the old player outline');
    await guest.page.waitForTimeout(7000);
    assert((await colors(host, second))[1] > 20, 'Stationary pointer heartbeat must retain the highlight');
    check('Stationary hover stays live beyond its expiry lease');
    // Receiving camera/zoom changes must keep the outline on its dungeon tile.
    await host.page.evaluate(tile => {
        window.hoverModule('dungeon_renderer').set_view_center(tile.x, tile.y);
        window.hoverModule('game-context').set_view_zoom(1.5);
    }, second);
    assert((await colors(host, second))[1] > 20);
    check('Receiving camera movement and zoom retain the correct highlighted tile');
    await clearLog(host);
    // Headless focus emulation keeps these independent clients active. Dispatch
    // the lifecycle event explicitly to verify its real outgoing clear packet.
    await guest.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await host.page.waitForFunction(() => window.hoverReceived.some(m => m.msg === 'party_hover' && m.active === false));
    assert.equal((await colors(host, second))[1], 0);
    await guest.page.mouse.move(1, 1);
    await point(guest, second);
    await host.page.waitForFunction(({ x, y }) => window.hoverReceived.some(m => m.msg === 'party_hover' && m.active && m.slot === 1 && m.x === x && m.y === y), second);
    check('Window blur handler clears presence and a returning pointer resumes it');
    await clearLog(guest);
    await point(host, first);
    await received(guest, host);
    assert((await colors(guest, first))[0] > 20, 'Host P1 hover renders on the guest');
    await host.page.mouse.move(1, 1);
    check('Host hover also reaches the guest');
    assert.deepEqual(await time(host), before, 'Hover, leave and heartbeats cannot spend turns');
    const inputs = new Set(['input', 'key', 'click_cell', 'target_cursor']);
    assert(clients.every(target => !target.sent.some(message => inputs.has(message.msg))), 'Hover sends no engine input');
    await clearLog(host);
    await third.context.close();
    await host.page.waitForFunction(() => window.hoverReceived.some(m => m.msg === 'party_hover' && m.active === false));
    assert.equal((await colors(host, first))[2], 0);
    check('Disconnect removes the departing player highlight without spending turns');
    await host.page.screenshot({ path: path.join(output, 'remote-hover-highlight.png') });
    assert.deepEqual(errors, []);
    evidence.success = true;
})().catch(async error => {
    evidence.error = String(error.stack || error);
    console.error(error);
    evidence.clients = await Promise.all(clients.map(async target => ({ username: target.username,
        sent: target.sent.filter(m => ['join_party', 'party_hover'].includes(m.msg)),
        state: await target.page.evaluate(() => ({ received: window.hoverReceived,
            slot: window.crawl_party?.state?.controlled_slot, party: require('client').is_party_member(),
            focus: document.hasFocus(), hidden: document.hidden })).catch(() => null) })));
    for (const [index, target] of clients.entries())
        await target.page.screenshot({ path: path.join(output, 'failure-' + index + '.png') }).catch(() => {});
    process.exitCode = 1;
}).finally(async () => {
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
