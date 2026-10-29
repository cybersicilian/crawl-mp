const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Local, fresh-account UI proof. Requires Playwright and a running WebTiles server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.WEBTILES_URL || 'http://localhost:8888';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'Use a local QA server');
const output = process.env.THEME_PROOF_DIR || '/tmp/dcss-tabletop-proof';
fs.mkdirSync(output, { recursive: true });
const errors = [];
const evidence = {};
let browser, qaPage;

async function shot(page, name) {
    await page.mouse.move(10, 10);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
}
async function moduleValue(page, suffix, code) {
    return page.evaluate(({ suffix, code }) => {
        const names = Object.keys(requirejs.s.contexts._.defined);
        const name = names.find(n => n.endsWith(suffix));
        if (!name) throw new Error('Missing AMD module: ' + suffix);
        return Function('value', code)(require(name));
    }, { suffix, code });
}
async function checkGeometry(page, width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const geometry = await page.evaluate(() => {
        const rect = id => {
            const r = document.getElementById(id).getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        return { canvas: rect('dungeon'), header: rect('party_turn_banner'), sidebar: rect('right_column'), dock: rect('dcss_quick_dock'),
            log: rect('message_pane'), monsters: rect('monster_list'),
            transform: getComputedStyle(document.getElementById('left_column')).transform };
    });
    assert.equal(geometry.transform, 'none', 'Canvas parent must not scale');
    assert.equal(geometry.canvas.x, 0);
    assert(geometry.canvas.y >= geometry.header.bottom - 1, 'Header must own space above the canvas');
    assert(geometry.canvas.right <= geometry.sidebar.x + 1, 'Canvas must not overlap sidebar');
    assert(geometry.dock.right <= geometry.sidebar.x + 1, 'All dock actions must stay in the viewport column');
    assert(geometry.log.bottom <= height + 1, 'Log must fit the window');
    assert(geometry.log.height >= 60, 'Leave readable log space');
    assert(geometry.monsters.y < height - 20, 'Monster list must remain reachable on screen');
    evidence[`${width}x${height}`] = geometry;
    await shot(page, `game-${width}x${height}`);
}

(async () => {
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = qaPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(45000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', r => { if (r.status() >= 400 && /\.(css|js)(\?|$)/.test(r.url())) errors.push(r.url()); });
    await page.goto(url);
    const username = 'FolioQA' + Date.now().toString().slice(-8);
    evidence.account = username;
    await signInTestAccount(page, username, 'crawl');
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.locator('.lobby-chapters [data-workspace-target="chronicle"]').click();
    const arga = page.locator('.chronicle-entry-title').filter({ hasText: 'Arga' }).first();
    if (await arga.count()) {
        await arga.locator('.item-properties').waitFor({ state: 'visible' });
        assert(!(await arga.innerText()).includes('{'), 'Relic properties should render as icons');
        assert.equal(await arga.locator('[data-property="brand-speed"] svg').count(), 1);
        assert.equal(await arga.locator('[data-property="will"] .item-property-value').innerText(), '+');
    }
    await page.locator('.lobby-chapters [data-workspace-target="play"]').click();
    await page.locator('#lobby_home [data-lobby-create]').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    for (let slot = 1; slot < 4; slot++)
        await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
    await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('4 heroes'));
    assert.equal(await page.locator('.party-slot-box').count(), 4);
    await shot(page, 'staging-1440x900');
    await page.setViewportSize({ width: 1280, height: 800 });
    await shot(page, 'staging-1280x800');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4);
    await page.locator('#dock_codex_btn').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.party-card').count(), 4);
    assert(await page.locator('.party-buff-pill .tt-icon').count() >= 4, 'Status icons must accompany labels');
    await checkGeometry(page, 1440, 900);
    await checkGeometry(page, 1280, 800);

    // Exercise every inspector section and a different hero, retaining native dialog focus.
    await page.keyboard.press('F2');
    await page.locator('#party_inspector_modal[open]').waitFor();
    assert((await page.locator('.party-insp-hero-btn.active').innerText()).includes('Lyra'));
    for (const tab of ['overview', 'abilities', 'mutations', 'skills']) {
        await page.locator(`[data-insp-tab='${tab}']`).click();
        assert.equal(await page.locator('.party-insp-panel:visible').count(), 1);
        assert.equal(await page.locator('.party-insp-panel:visible').getAttribute('data-insp-panel'), tab);
    }
    await page.locator("[data-insp-tab='overview']").click();
    assert.equal(await page.locator('#party_insp_tab_bar[role="tablist"] [role="tab"]').count(), 4);
    assert.equal(await page.locator('.party-insp-panel[role="tabpanel"]').count(), 4);
    const inspectorBeforeKeys = await page.evaluate(() => {
        window.qaInspectorInventory = document.querySelector('#party_insp_panel_skills .inventory-share-btn');
        window.qaInspectorEngineMessages = [];
        window.qaInspectorSocketSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (payload) {
            const message = typeof payload === 'string' ? JSON.parse(payload) : {};
            if (message.msg === 'input' || message.msg === 'key') {
                window.qaInspectorEngineMessages.push(message);
                return; // A failed isolation check must never advance this QA game.
            }
            return window.qaInspectorSocketSend.apply(this, arguments);
        };
        return { time: document.getElementById('stats_time').textContent, slot: window.crawl_party.inspector_slot };
    });
    await page.locator('#party_insp_tab_overview').focus();
    for (const [key, tab] of [['ArrowRight', 'abilities'], ['ArrowRight', 'mutations'], ['End', 'skills'],
        ['ArrowRight', 'overview'], ['ArrowLeft', 'skills'], ['Home', 'overview']]) {
        await page.keyboard.press(key);
        const selected = page.locator(`#party_insp_tab_${tab}`);
        assert.equal(await selected.getAttribute('aria-selected'), 'true');
        assert.equal(await selected.getAttribute('aria-controls'), `party_insp_panel_${tab}`);
        assert.equal(await selected.getAttribute('tabindex'), '0');
        assert(await selected.evaluate(element => element === document.activeElement));
        assert.equal(await page.locator('#party_insp_tab_bar [tabindex="0"]').count(), 1);
        assert.equal(await page.locator('.party-insp-panel:visible').getAttribute('aria-labelledby'), `party_insp_tab_${tab}`);
    }
    await page.keyboard.press('End');
    const inventoryScroll = await page.locator('#party_insp_body').evaluate(element => {
        element.scrollTop = Math.min(80, element.scrollHeight - element.clientHeight);
        return element.scrollTop;
    });
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#party_insp_body').evaluate(element => element.scrollTop), inventoryScroll,
        'Returning to inventory preserves its reading position');
    assert(await page.evaluate(() => window.qaInspectorInventory === document.querySelector('#party_insp_panel_skills .inventory-share-btn')),
        'Section navigation preserves inventory DOM and item actions');
    await page.keyboard.press('3');
    assert.equal(await page.evaluate(() => window.crawl_party.inspector_slot), 2);
    assert.equal(await page.locator('.party-insp-panel:visible').getAttribute('data-insp-panel'), 'skills');
    await page.keyboard.press('2');
    assert.equal(await page.evaluate(() => window.crawl_party.inspector_slot), inspectorBeforeKeys.slot);
    assert.equal(await page.locator('#stats_time').textContent(), inspectorBeforeKeys.time, 'Inspector navigation cannot consume turns');
    assert.deepEqual(await page.evaluate(() => window.qaInspectorEngineMessages), [], 'Inspector keys cannot reach engine input');
    await page.evaluate(() => { WebSocket.prototype.send = window.qaInspectorSocketSend; });
    await page.keyboard.press('Home');
    assert.equal(await page.locator('.party-insp-res-row .resistance-symbol svg').count(), 10);
    assert.equal(await page.locator('.party-insp-res-pips').count(), 0, 'Resistance levels should use visual gems');
    const ratings = await page.evaluate(() => window.crawl_party.state.members.find(m => m.slot === 1).resists);
    assert.equal(await page.locator('[data-resistance="Will"] .is-filled').count(), Math.min(5, Math.floor(ratings.Will / 40)));
    assert.equal(await page.locator('[data-resistance="Stlth"] .is-filled').count(), Math.min(10, Math.ceil(ratings.Stlth / 50)));
    await page.locator('.party-insp-res-row[data-tip-title]').first().hover();
    await page.locator('#dcss_rich_tooltip').waitFor({ state: 'visible' });
    assert(await page.locator('#party_inspector_modal #dcss_rich_tooltip').count(), 'Tooltip must be in the dialog top layer');
    await shot(page, 'inspector-1280x800');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#party_inspector_modal[open]').count(), 0);

    const inspectorOpener = page.locator('#party_banner_inspect');
    await inspectorOpener.click();
    await page.locator('#party_inspector_modal[open]').waitFor();
    assert(await page.evaluate(() => document.getElementById('party_inspector_modal').contains(document.activeElement)),
        'Opening the native modal moves focus inside');
    await page.keyboard.press('Escape');
    assert(await inspectorOpener.evaluate(element => element === document.activeElement), 'Closing returns focus to the opener');

    await page.keyboard.press('F2');
    await page.locator("[data-insp-tab='skills']").click();
    await page.locator('.inventory-share-btn').first().click();
    assert.equal(await page.locator('#party_inspector_modal[open]').count(), 0);
    assert((await page.locator('#chat_input').inputValue()).includes('[item:'));
    assert(await page.locator('#chat_input').evaluate(el => el === document.activeElement));
    await page.locator('#chat_input').fill('');
    await page.keyboard.press('Escape');

    // Sending is intercepted; this never posts a test message to other players.
    await page.evaluate(() => {
        const comm = require('comm'), original = comm.send_message;
        window.qaChat = [];
        comm.send_message = function (name, data) {
            if (name === 'chat_msg') window.qaChat.push(data);
            else return original.apply(this, arguments);
        };
    });
    await page.locator('#dock_chat_btn').click();
    assert(await page.locator('#chat_input').evaluate(e => document.activeElement === e));
    await page.locator('#chat_input').fill('Local QA message, intercepted before transmission');
    await page.locator('#chat_send_btn').click();
    assert.equal(await page.evaluate(() => window.qaChat.length), 1);
    assert.equal(await page.locator('#chat_input').inputValue(), '');
    await shot(page, 'chat-1280x800');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#chat').isVisible(), false);

    const timeBefore = await page.locator('#stats_time').innerText();
    await page.locator('#dock_codex_btn').click();
    await page.locator('.tt-codex').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.codex-chapter').count(), 17);
    await shot(page, 'encyclopedia-1280x800');
    await page.locator('.codex-close').click();
    await page.waitForFunction(() => !document.querySelector('#ui-stack .tt-codex'));
    await page.locator('#dock_codex_btn').click();
    await page.locator('.tt-codex').waitFor({ state: 'visible' });
    await page.locator('.tt-codex li[aria-label^="Items & Equipment"]').click();
    await page.waitForFunction(() => document.body.textContent.includes('Describe what?'));
    await page.keyboard.type('war axe');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    await shot(page, 'encyclopedia-item-search');
    for (let depth = 0; depth < 6 && await page.locator('#ui-stack .ui-popup:visible').count(); depth++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(80);
    }
    assert.equal(await page.locator('#ui-stack .ui-popup:visible').count(), 0);
    assert.equal(await page.locator('#stats_time').innerText(), timeBefore, 'Lookup must not consume a turn');

    // Hover a real server-supplied item through the renderer's native coordinates.
    const findItem = () => moduleValue(page, '/map_knowledge', `
        const bounds = value.bounds();
        for (let y = bounds.top; y <= bounds.bottom; y++)
            for (let x = bounds.left; x <= bounds.right; x++) {
                const cell = value.get(x, y);
                if (cell.item_name && value.visible(cell)) return {x, y, name: cell.item_name};
            }
        return null;`);
    let item = await findItem();
    if (!item) {
        // Starts vary by seed. Drop a real starting weapon in this QA game.
        await page.keyboard.press('d');
        await page.locator('.menu_contents li.selectable:visible').filter({ hasText: /war axe/i }).first().click();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        item = await findItem();
    }
    assert(item, 'Fresh map should contain a known item for native hover proof');
    const coords = await moduleValue(page, '/dungeon_renderer', `
        const bounds = value.element.getBoundingClientRect();
        return {x: bounds.x + (${item.x} - value.view.x + 0.5) * value.cell_width,
                y: bounds.y + (${item.y} - value.view.y + 0.5) * value.cell_height};`);
    await page.mouse.move(coords.x, coords.y);
    await page.locator('#tooltip').waitFor({ state: 'visible' });
    assert((await page.locator('#tooltip').innerText()).includes(item.name));
    assert((await page.locator('#tooltip').evaluate(el => getComputedStyle(el).backgroundImage)).includes('243, 228, 193'), 'Hover ink requires the light vellum surface');
    await page.screenshot({ path: path.join(output, 'item-hover.png') });
    evidence.itemHover = item.name;
    const hostileHTML = await moduleValue(page, '/hover-cards', `
        value.show('#tooltip', {title:'<img src=x onerror=alert(1)>', body:'<script>bad</script>'}, 1270, 790);
        const el = document.querySelector('#tooltip');
        const r = el.getBoundingClientRect();
        return {injected: el.querySelectorAll('img,script').length, right:r.right, bottom:r.bottom};`);
    assert.equal(hostileHTML.injected, 0, 'Hover text must not become HTML');
    assert(hostileHTML.right <= 1280 && hostileHTML.bottom <= 800, 'Hover must stay in the viewport');
    evidence.browserErrors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ success: true, output, account: username, item: item.name, sizes: ['1440x900', '1280x800'] }));
})().catch(async error => { console.error(error); console.error('Browser errors:', errors); console.error('Evidence:', evidence); if (qaPage) { console.error((await qaPage.locator('body').innerText()).slice(0,3000)); await qaPage.screenshot({path:path.join(output,'failure.png')}); } process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
