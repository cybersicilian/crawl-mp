const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Actual StashSearchMenu packets and zero-turn inspection in a fresh local game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8917';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.MENU_SEARCH_PROOF_DIR || '/tmp/dcss-menu-search-native-proof';

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(15000);
    const errors = [], evidence = { account: 'SearchQA' + Date.now().toString().slice(-8), widths: [1280, 768, 390, 320] };
    page.on('pageerror', error => errors.push(error.message));
    const key = keycode => page.evaluate(keycode => require('comm').send_message('key', { keycode }), keycode);
    const control = name => page.locator(`[data-search-control='${name}']`);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const search = async text => {
        await key(6);
        const input = page.locator('#messages input:visible, #input_dialog input:visible');
        await input.waitFor({ state: 'visible' });
        await input.fill(text);
        await input.press('Enter');
        await page.locator('.workflow-search-menu').waitFor();
        await page.evaluate(() => document.fonts.ready);
    };
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-job').selectOption('Berserker');
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.waitForFunction(() => /1 hero\b/.test(document.getElementById('btn_launch_party_room').textContent));
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1, null, { timeout: 120000 });
        await ready();
        const clock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        await search('animal skin');
        assert.equal(await page.locator('.workflow-search-summary > span').first().innerText(), '1 match');
        assert.match(await page.locator('.workflow-search-name').innerText(), /animal skin/);
        assert.equal(await page.locator('.workflow-search-location').innerText(), 'Carried');
        assert.equal(await page.locator('.workflow-state').innerText(), 'Equipped');
        assert.equal(await page.locator('.workflow-key').innerText(), 'a');
        for (const width of evidence.widths) {
            await page.setViewportSize({ width, height: 800 });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await page.waitForTimeout(200); // Native popup fade and viewport reflow.
            const bounds = await page.locator('#ui-stack .ui-popup-outer').last().boundingBox();
            assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Native popup fits at ' + width);
            assert(await page.locator('.workflow-search-menu').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
            assert(await page.locator('.workflow-search-tools button').evaluateAll(buttons => buttons.every(button => {
                const box = button.getBoundingClientRect();
                return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
            })), 'All controls are visible and clickable at ' + width);
            await page.locator('#ui-stack .ui-popup-outer').last().screenshot({ path: path.join(output, `native-search-${width}.png`) });
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(output, 'native-search-context.png') });
        await page.locator('#ui-stack .ui-popup-outer').last().screenshot({ path: path.join(output, 'native-search-desktop.png') });
        await control('mode-view').click();
        await page.waitForFunction(() => document.querySelector('[data-search-control="mode-view"]')?.getAttribute('aria-pressed') === 'true');
        await page.locator('.workflow-search-row').click();
        await page.locator('#ui-stack .describe-item').waitFor();
        await key(27);
        await page.locator('#ui-stack .describe-item').waitFor({ state: 'detached' });
        assert(await page.locator('.workflow-search-menu').isVisible(), 'Inspection returns to results');
        await control('sort').focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-search-control="sort"]')?.textContent.includes('Name'));
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-search-control') === 'sort');
        await control('sort').click();
        await page.waitForFunction(() => document.querySelector('[data-search-control="sort"]')?.textContent.includes('Distance'));
        await control('filter').click();
        await page.waitForFunction(() => document.querySelector('[data-search-control="filter"]')?.getAttribute('aria-pressed') === 'false');
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-search-control') === 'filter');
        await page.keyboard.press('/');
        await page.waitForFunction(() => document.querySelector('[data-search-control="sort"]')?.textContent.includes('Item type'));
        await page.keyboard.press('=');
        await page.waitForFunction(() => document.querySelector('[data-search-control="filter"]')?.getAttribute('aria-pressed') === 'true');
        await key(27); await ready();
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock, 'Search, sorting, filtering and reading spend no world time');
        // Native letter selection also opens the inspected result directly.
        await search('animal skin');
        await control('mode-view').click();
        await page.waitForFunction(() => document.querySelector('[data-search-control="mode-view"]')?.getAttribute('aria-pressed') === 'true');
        await page.keyboard.press(await page.locator('.workflow-search-row').first().getAttribute('data-menu-key'));
        await page.locator('#ui-stack .describe-item').waitFor();
        await key(27); await key(27); await ready();
        assert.deepEqual(errors, []);
        Object.assign(evidence, { success: true, nativeItemDetails: true, pointerInspection: true,
            keyboardInspection: true, nativeSortAndFilter: true, focusRetention: true, zeroTurnInspection: true });
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') });
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
