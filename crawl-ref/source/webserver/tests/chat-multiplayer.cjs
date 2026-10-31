/* Actual localhost multiplayer delivery using three new, isolated QA accounts.
 * Requires Playwright, a rebuilt Crawl binary, and a restarted WebTiles server.
 * No seeded items, intercepted sends, existing accounts, or remote servers.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.WEBTILES_URL || 'http://localhost:8888';
const parsedURL = new URL(url);
assert(['localhost', '127.0.0.1', '[::1]'].includes(parsedURL.hostname),
    'Multiplayer QA only runs against a localhost server');
assert(['http:', 'https:'].includes(parsedURL.protocol), 'Use an HTTP WebTiles URL');
const output = process.env.CHAT_PROOF_DIR || '/tmp/dcss-chat-multiplayer-proof';
fs.mkdirSync(output, { recursive: true });
const runID = Date.now().toString(36).slice(-7) + crypto.randomBytes(2).toString('hex');
const clients = [];
const evidence = { runID, url, accounts: {}, stage: 'starting', errors: [] };
const dungeonMessages = new Set(['input', 'key', 'click', 'mouse', 'travel',
    'party_action', 'cycle_player', 'add_party_member', 'toggle_friendly_fire']);
let browser;

async function freshClient(role) {
    const username = 'FolioQA' + runID + role[0].toUpperCase();
    assert(username.length <= 20 && /^FolioQA[a-zA-Z0-9]+$/.test(username));
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const client = { role, username, context, page, sent: [], errors: [] };
    clients.push(client);
    evidence.accounts[role] = username;
    page.on('pageerror', error => client.errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(css|js)(\?|$)/.test(response.url()))
            client.errors.push(response.status() + ' ' + response.url());
    });
    page.on('websocket', socket => socket.on('framesent', frame => {
        try { client.sent.push(JSON.parse(String(frame.payload))); }
        catch { /* Only JSON client commands are relevant to input isolation. */ }
    }));
    await page.goto(url);
    await page.locator('#reg_link').click();
    await page.locator('#reg_username').fill(username);
    const password = crypto.randomBytes(8).toString('hex');
    await page.locator('#reg_password').fill(password);
    await page.locator('#reg_repeat_password').fill(password);
    await page.locator('#reg_email').fill('');
    await page.locator('#reg_submit').click();
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    assert.equal(client.sent.filter(message => message.msg === 'register').length, 1,
        'Every client must register a new account through the native dialog');
    await page.evaluate(() => {
        const comm = require('comm'), original = comm.handle_message;
        window.qaReceived = [];
        comm.handle_message = function (message) {
            if (['chat', 'watching_started', 'party_joined', 'game_started'].includes(message.msg))
                window.qaReceived.push(JSON.parse(JSON.stringify(message)));
            return original.apply(this, arguments);
        };
    });
    return client;
}

async function startExpedition(client) {
    const page = client.page;
    await page.locator('#lobby_home [data-lobby-create]').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    // Two native heroes guarantee there is a companion slot for the guest.
    await page.locator(".party-slot-box[data-slot='1'] .party-mode-btn[data-mode='companion']").click();
    for (const slot of [2, 3])
        await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='closed']`).click();
    await page.waitForFunction(() => /2 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
    await page.locator('#dock_chat_btn').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#stats_time')?.textContent.trim());
    assert(client.sent.some(message => message.msg === 'party_room_launch'),
        'Fresh expeditions must launch through the native staging workflow');
}

async function joinCompanion(guest, host) {
    const page = guest.page;
    const watchLink = page.locator(`#player_list .username a[href='#watch-${host.username}']`);
    await watchLink.waitFor({ state: 'visible' });
    await watchLink.click();
    await page.waitForFunction(username => window.qaReceived.some(message =>
        message.msg === 'watching_started' && message.username === username), host.username);
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
    await page.locator('#party_join_btn').click();
    await page.waitForFunction(() => window.qaReceived.some(message =>
        message.msg === 'party_joined' && message.slot === 1));
    assert.equal(await page.evaluate(() => window.crawl_party_slot), 1,
        'Guest must claim companion hero P2, not merely spectate');
    assert.equal(await page.evaluate(() => require('client').is_party_member()), true);
    assert(guest.sent.some(message => message.msg === 'watch' && message.username === host.username));
    assert(guest.sent.some(message => message.msg === 'join_party'));
    evidence.companionSlot = 1;
}

async function openChat(client) {
    if (!await client.page.locator('#chat_input').isVisible())
        await client.page.locator('#dock_chat_btn').click();
    await client.page.locator('#chat_input').waitFor({ state: 'visible' });
    await client.page.locator('#chat_input').focus();
}

async function gameTime(client) {
    return client.page.locator('#stats_time').innerText();
}

function assertNoDungeonInput(client, fromIndex) {
    const leaked = client.sent.slice(fromIndex).filter(message => dungeonMessages.has(message.msg));
    assert.deepEqual(leaked, [], client.role + ' chat controls must not send dungeon input');
}

async function waitForChat(client, marker, sender) {
    await client.page.waitForFunction(({ marker, sender }) => window.qaReceived.some(message =>
        message.msg === 'chat' && message.sender === sender
        && typeof message.text === 'string' && message.text.includes(marker)), { marker, sender });
    return client.page.evaluate(({ marker, sender }) => window.qaReceived.find(message =>
        message.msg === 'chat' && message.sender === sender && message.text?.includes(marker)), { marker, sender });
}

async function verifyItemTag(host, guest, outsider) {
    await Promise.all([openChat(host), openChat(guest), openChat(outsider)]);
    // Allow initial view updates to settle before recording turn/input evidence.
    await host.page.waitForTimeout(300);
    const times = await Promise.all(clients.map(gameTime));
    const inputStarts = clients.map(client => client.sent.length);
    const marker = 'Folio shared loot ' + runID;
    const phrase = marker + ' hjklyubn 2468 . < > ';
    await host.page.locator('#chat_input').pressSequentially(phrase);
    assert.equal(await host.page.locator('#chat_input').inputValue(), phrase);
    assert.equal(await gameTime(host), times[0], 'Typing movement keys in chat must not consume a turn');
    assertNoDungeonInput(host, inputStarts[0]);

    await host.page.locator('#chat_tag_btn').click();
    await host.page.locator('.chat-item-choice').first().waitFor({ state: 'visible' });
    // This reads the picker populated by real server-known inventory/loot data.
    const item = await host.page.locator('.chat-item-choice').first().evaluate(element =>
        require('jquery')(element).data('chatItem'));
    assert(item?.name && item.description?.trim(), 'A real known item must include hover details');
    evidence.item = { id: item.id, name: item.name, description: item.description };
    await host.page.locator('.chat-item-choice').first().click();
    assert((await host.page.locator('#chat_input').inputValue()).includes('[item:' + item.name + ']'));
    assert(await host.page.locator('#chat_input').evaluate(element => document.activeElement === element),
        'Tagging an item must return focus directly to the composer');
    await host.page.locator('#chat_send_btn').click();
    const received = await waitForChat(guest, marker, host.username);
    await waitForChat(host, marker, host.username);
    assert.equal(received.tags.length, 1);
    assert.equal(received.tags[0].name, item.name);
    const expectedDescription = item.description.replace(/\r/g, '').trim();
    assert.equal(received.tags[0].description, expectedDescription);
    assert.equal(received.tags[0].kind, 'item');
    const line = guest.page.locator('#chat_history .chat-line').filter({ hasText: marker });
    await line.waitFor({ state: 'visible' });
    assert.equal(await line.locator('.chat_sender').innerText(), host.username);
    assert.equal(await line.locator('.chat-item-chip').count(), 1);
    const chip = line.locator('.chat-item-chip');
    assert.equal(await chip.innerText(), item.name);
    await guest.page.bringToFront();
    await chip.hover();
    evidence.hoverState = await chip.evaluate(element => {
        const $ = require('jquery'), tip = document.getElementById('chat_item_tooltip');
        return { item: $(element).data('chatItem'), hover: element.matches(':hover'),
            tooltip: tip ? { display: getComputedStyle(tip).display,
                ariaHidden: tip.getAttribute('aria-hidden'), text: tip.textContent } : null,
            delegated: Object.values($._data(document, 'events') || {}).flat()
                .filter(handler => handler.namespace === 'chatItems')
                .map(handler => ({ type: handler.origType, selector: handler.selector })) };
    });
    const tooltip = guest.page.locator('#chat_item_tooltip');
    await tooltip.waitFor({ state: 'visible' });
    assert.equal(await tooltip.locator('.chat-tooltip-body').innerText(), expectedDescription);
    assert((await tooltip.locator('.chat-tooltip-footer').innerText()).includes('Shared by ' + host.username));
    assert.equal(await tooltip.locator('script,iframe,object').count(), 0);
    await guest.page.screenshot({ path: path.join(output, 'guest-item-hover.png') });
    await host.page.screenshot({ path: path.join(output, 'host-tagged-message.png') });

    // Keyboard focus is an equally direct path to the same receiving-client tooltip.
    await guest.page.mouse.move(1, 1);
    await chip.focus();
    await tooltip.waitFor({ state: 'visible' });
    assert.equal(await chip.getAttribute('aria-describedby'), 'chat_item_tooltip');
    await guest.page.keyboard.press('Escape');
    assert(await guest.page.locator('#chat_input').evaluate(element => document.activeElement === element));

    // A real P2 reply proves both directions still use multiplayer chat.
    const reply = 'Folio companion received ' + runID;
    await guest.page.locator('#chat_input').pressSequentially(reply);
    await guest.page.locator('#chat_input').press('Enter');
    const response = await waitForChat(host, reply, guest.username);
    assert.deepEqual(response.tags, [], 'Plain multiplayer replies must remain supported');
    await waitForChat(guest, reply, guest.username);
    await outsider.page.waitForTimeout(500);
    const outsidersChat = await outsider.page.evaluate(() => window.qaReceived.filter(message => message.msg === 'chat'));
    assert(!outsidersChat.some(message => message.text?.includes(marker) || message.text?.includes(reply)),
        'An unrelated QA expedition must receive neither direction of this conversation');
    assert.equal(await outsider.page.locator('#chat_history .chat-line').filter({ hasText: marker }).count(), 0);
    assert.equal(await outsider.page.locator('#chat_history .chat-line').filter({ hasText: reply }).count(), 0);
    for (let index = 0; index < clients.length; index++) {
        assertNoDungeonInput(clients[index], inputStarts[index]);
        assert.equal(await gameTime(clients[index]), times[index],
            clients[index].role + ' time must remain unchanged through chat, tagging, and tooltips');
    }
    evidence.times = Object.fromEntries(clients.map((client, index) => [client.role, times[index]]));
    evidence.delivery = { hostToCompanion: true, companionToHost: true, outsiderExcluded: true,
        nativeKnownItem: true, pointerAndKeyboardTooltip: true, dungeonInputLeakage: false };
    await outsider.page.screenshot({ path: path.join(output, 'unrelated-expedition.png') });
}

(async () => {
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    evidence.stage = 'fresh native registration';
    // Keep order deterministic for time/input evidence; each has its own browser context.
    const host = await freshClient('host');
    const guest = await freshClient('guest');
    const outsider = await freshClient('outsider');
    evidence.stage = 'fresh native expedition launches';
    await startExpedition(host);
    await startExpedition(outsider);
    evidence.stage = 'watch and claim companion';
    await joinCompanion(guest, host);
    evidence.stage = 'real tagged multiplayer conversation';
    await verifyItemTag(host, guest, outsider);
    evidence.errors = clients.flatMap(client => client.errors.map(error => ({ role: client.role, error })));
    assert.deepEqual(evidence.errors, [], 'The three clients must have no browser or asset errors');
    evidence.stage = 'passed';
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ success: true, output, accounts: evidence.accounts,
        item: evidence.item.name, delivery: evidence.delivery }));
})().catch(async error => {
    evidence.error = String(error.stack || error);
    evidence.errors = clients.flatMap(client => client.errors.map(message => ({ role: client.role, message })));
    console.error('Multiplayer chat QA failed at: ' + evidence.stage);
    console.error(error);
    for (const client of clients) {
        evidence[client.role + 'Commands'] = client.sent.map(message => message.msg);
        evidence[client.role + 'Context'] = await client.page.evaluate(() => {
            const button = document.getElementById('party_join_btn'), parents = [];
            for (let node = button; node && parents.length < 6; node = node.parentElement)
                parents.push({ id: node.id, className: node.className, display: getComputedStyle(node).display });
            return { watching: require('client').is_watching(), member: require('client').is_party_member(), parents };
        }).catch(() => null);
        try { await client.page.screenshot({ path: path.join(output, 'failure-' + client.role + '.png') }); }
        catch { /* A closed page must not hide the original assertion. */ }
    }
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
}).finally(async () => {
    // Closing these QA contexts releases their own games and watcher connections.
    if (browser) await browser.close();
});
