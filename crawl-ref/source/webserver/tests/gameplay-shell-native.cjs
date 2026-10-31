const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real native HUD workflows in an isolated localhost game, never a human save. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8896';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.HUD_PROOF_DIR || '/tmp/dcss-hud-reconfiguration/proof';
fs.mkdirSync(output, { recursive: true });
let browser, page;
const errors = [], evidence = {};
async function shot(name) {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(output, name + '.png') });
}
async function ready() {
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
}
async function geometry(width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
        const rect = id => {
            const r = document.getElementById(id).getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        return { canvas: rect('dungeon'), viewport: rect('dungeon_viewport'), header: rect('party_turn_banner'), sidebar: rect('right_column'),
            dock: rect('dcss_quick_dock'), log: rect('message_pane'), party: rect('party_hud'),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            transform: getComputedStyle(document.getElementById('dungeon')).transform,
            clippedButtons: [...document.querySelectorAll('#normal button')].filter(button => {
                const r = button.getBoundingClientRect();
                return r.width && r.height && (r.right > innerWidth + 1 || r.left < -1);
            }).map(button => button.textContent),
            names: [...document.querySelectorAll('.party-member-name')].map(name => ({
                text: name.textContent, clipped: name.scrollWidth > name.clientWidth + 1
            })) };
    });
    evidence[width + 'x' + height] = result;
    assert.equal(result.horizontalOverflow, false);
    assert.equal(result.transform, 'none', 'Canvas cannot be CSS scaled');
    assert(result.viewport.y >= result.header.bottom - 1, 'Header owns space above dungeon');
    assert(Math.abs(result.viewport.right - result.sidebar.x) < 1, 'Dungeon fills the width beside the sidebar');
    assert(Math.abs(result.viewport.bottom - result.dock.y) < 1, 'Dungeon fills the height above the dock');
    assert(result.canvas.y <= result.viewport.y - 12 && result.canvas.right >= result.viewport.right + 12,
        'Rendered tiles bleed underneath surrounding panels');
    assert(result.dock.bottom <= result.log.y + 1, 'Log cannot overlap actions');
    assert(result.log.bottom <= height + 1 && result.log.height >= 60, 'Keep messages readable');
    assert.deepEqual(result.clippedButtons, [], 'Every action label fits horizontally');
    assert(result.names.every(name => !name.clipped), 'Hero names remain readable');
    assert(result.party.bottom <= height + 1, 'All four heroes and signals fit without scrolling');
    assert(await page.locator('.party-card').evaluateAll(cards => cards.every(card => {
        const bars = card.querySelector('.party-bars').getBoundingClientRect();
        const actions = card.querySelector('.party-card-actions').getBoundingClientRect();
        return actions.top >= bars.bottom - 1 && actions.right <= card.getBoundingClientRect().right;
    })), 'Small hero controls fit under the bars');
    await shot('game-' + width + 'x' + height);
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: Number(process.env.HUD_DPR || 1) });
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(css|js)(\?|$)/.test(response.url())) errors.push(response.url());
    });
    await page.goto(url);
    evidence.account = 'HudQA' + Date.now().toString().slice(-8);
    await signInTestAccount(page, evidence.account, 'crawl');
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.locator('#lobby_home [data-lobby-create]').click();
    for (let slot = 1; slot < 4; slot++)
        await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
    await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('4 heroes'));
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
    await ready();
    await page.locator('#party_hud_members .party-card').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const initialClock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
    // Controlled clock presentation in a real HUD; this does not simulate combat.
    await page.evaluate(() => {
        window.initiativeOriginal = structuredClone(window.crawl_party.state);
        const state = structuredClone(window.initiativeOriginal);
        state.members.forEach((member, index) => {
            member.aut_clock = state.world_aut_clock + [0, 6, 10, 0][index];
            member.aut_lead = [0, 6, 10, 0][index];
        });
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/party'));
        window.renderInitiativeFixture = data => require(name).state(data);
        window.renderInitiativeFixture(state);
    });
    const meters = page.locator('#party_hud .party-initiative');
    assert.equal(await meters.count(), 4);
    assert.deepEqual(await meters.allTextContents(), ['', '', '', '']);
    await shot('controlled-initiative-balances');
    await page.locator('#party_hud').screenshot({ path: path.join(output, 'controlled-initiative-roster.png') });
    await meters.nth(1).focus();
    await page.waitForFunction(() => document.querySelector('#dcss_rich_tooltip')?.textContent.includes('Recovering with catch-up time'));
    await page.evaluate(() => {
        window.initiativeFocused = document.activeElement;
        const state = structuredClone(window.crawl_party.state);
        state.members[2].aut_clock += 10; state.members[2].aut_lead += 10;
        window.renderInitiativeFixture(state);
    });
    assert(await page.evaluate(() => document.activeElement === window.initiativeFocused));
    assert((await page.locator('#dcss_rich_tooltip').textContent()).includes('Recovering with catch-up time'));
    assert.equal(await meters.nth(1).locator('.initiative-bank i').evaluate(node => node.style.width), '70%',
        'Live clock changes update the visual fill while preserving the qualitative label');
    await meters.nth(1).press('ArrowRight');
    await page.evaluate(() => {
        window.renderInitiativeFixture(window.initiativeOriginal);
        document.activeElement.blur();
    });
    await geometry(1280, 800);
    await geometry(1440, 900);
    await geometry(1024, 768);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#party_banner_add').count(), 0, 'One add-hero entry point');
    assert.equal(await page.locator('#party_rules, #party_hud_header, #party_banner_sim_toggle').count(), 0);
    assert.equal(await page.locator('#party_turn_banner #party_banner_inspect').count(), 0);
    assert.equal(await page.locator('.party-card').count(), 4);

    // Roster density is reversible and retains live status information.
    await page.locator('#quickbar_more > summary').click();
    await page.locator('#workflow_compact_btn').click();
    assert.equal(await page.locator('.party-member-meta:visible').count(), 4);
    await shot('roster-details');
    await page.locator('#workflow_compact_btn').click();
    assert.equal(await page.locator('.party-bars:visible').count(), 4);
    assert.equal(await page.locator('.party-member-timing:visible').count(), 4);
    await page.locator('#quickbar_more > summary').click();

    // Compact presentation keeps urgent statuses visible and handles long names.
    await page.evaluate(() => {
        const name = document.querySelector('.party-member-name');
        window.hudOriginalName = name.textContent; name.textContent = 'AlexandertheShieldBearer';
        const status = document.createElement('span'); status.className = 'party-buff-pill is-bad hud-fixture-status';
        status.textContent = 'Poisoned'; document.querySelector('.party-buff-strip').appendChild(status);
    });
    assert(await page.locator('.hud-fixture-status').isVisible(), 'Compact mode cannot hide negative status');
    assert(await page.locator('.party-member-name').first().evaluate(name => name.scrollWidth <= name.clientWidth + 1));
    await shot('controlled-long-name-and-status');
    await page.evaluate(() => {
        document.querySelector('.party-member-name').textContent = window.hudOriginalName;
        document.querySelector('.hud-fixture-status').remove();
    });
    await page.locator('#hud_minimap > summary').click();
    assert(await page.locator('#minimap').isVisible(), 'Minimap remains directly available');
    await page.locator('#hud_minimap > summary').click();

    // Hero actions are one click; camera, inspect and explicit control stay distinct.
    await page.locator('.party-card').nth(1).getByRole('button', { name: 'Center camera', exact: true }).click();
    assert.equal(await page.evaluate(() => window.crawl_party.state.active_slot), 0);
    await page.locator('.party-card').nth(1).locator('.party-inspect-btn').click();
    await page.locator('#party_inspector_modal[open]').waitFor();
    assert.equal(await page.evaluate(() => window.crawl_party.inspector_slot), 1);
    await page.keyboard.press('Escape');
    await page.locator('.party-card').nth(1).getByRole('button', { name: /Control/ }).click();
    await page.waitForFunction(() => window.crawl_party.state.active_slot === 1);
    await ready();
    assert((await page.locator('#party_banner_who').textContent()).includes('Lyra'));

    // Keyboard activation is isolated from dungeon input, including the new header.
    await page.evaluate(() => {
        const comm = require('comm'), original = comm.send_message;
        window.hudPackets = [];
        comm.send_message = function (name, fields) {
            window.hudPackets.push({ name, fields });
            return original.apply(this, arguments);
        };
    });
    await page.locator('#party_banner_center').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.hudPackets.filter(packet => ['key', 'input'].includes(packet.name)).length), 0);

    // Test actual pointer-to-tile mapping after the header offset (also at DPR 2).
    await page.locator('[data-ping-kind="look"]').click();
    await page.locator('#workflow_ping_status').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    const target = await page.evaluate(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
        const renderer = require(name), bounds = renderer.element.getBoundingClientRect();
        const member = window.crawl_party.state.members.find(hero => hero.slot === 1);
        return { tile: member.pos,
            x: bounds.x + (member.pos.x - renderer.view.x + 0.5) * renderer.cell_width,
            y: bounds.y + (member.pos.y - renderer.view.y + 0.5) * renderer.cell_height };
    });
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => window.hudPackets.some(packet => packet.name === 'party_ping'));
    const ping = await page.evaluate(() => window.hudPackets.find(packet => packet.name === 'party_ping'));
    assert.equal(ping.fields.x, target.tile.x); assert.equal(ping.fields.y, target.tile.y);
    evidence.pointerTile = ping.fields;
    await page.keyboard.press('Escape');

    await page.locator('#workflow_map_btn').click();
    await page.waitForTimeout(200);
    await shot('native-map');
    await page.keyboard.press('Escape');
    await ready();
    await page.locator('#quickbar_more > summary').click();
    await page.locator('#workflow_expedition_details > summary').click();
    await page.locator('#workflow_expedition_details .library-game-link').waitFor({ state: 'visible' });
    const menu = await page.locator('.hud-expedition-menu').boundingBox();
    assert(menu.y >= 0 && menu.x + menu.width <= 1281, 'Expedition disclosure stays on screen');
    await shot('expedition-menu');
    await page.locator('#workflow_expedition_details > summary').click();
    assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), initialClock, 'Inspection and coordination spend no game time');
    assert.deepEqual(errors, []);
    evidence.browserErrors = errors; evidence.dpr = Number(process.env.HUD_DPR || 1);
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ success: true, output, account: evidence.account, dpr: evidence.dpr }));
})().catch(async error => {
    console.error(error); console.error(errors);
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify(evidence, null, 2));
    if (page) { await shot('failure'); console.error((await page.locator('body').innerText()).slice(-2500)); }
    process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
