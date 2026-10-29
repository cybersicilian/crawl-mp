const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Disposable localhost expedition: native library modes, inspection and layout. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8908';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.MENU_COLUMNS_PROOF_DIR || '/tmp/dcss-menu-columns-native-proof';

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(15000);
    const errors = [], account = 'ColumnsQA' + Date.now().toString().slice(-8);
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const key = keycode => page.evaluate(keycode => require('comm').send_message('key', { keycode }), keycode);
    try {
        await page.goto(url);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-species').selectOption('Human');
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-job').selectOption('Reaver');
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 90000 });
        await ready();
        assert(await page.evaluate(() => window.crawl_party.state.members[0].spell_levels_left > 0), 'Fixture needs spare spell levels');
        const clock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        await page.locator('#hud_spell_library').click();
        await page.locator('.workflow-table-menu').waitFor();
        assert(await page.locator('.workflow-table-row').count());
        assert.equal(await page.locator('.menu_title').innerText(), 'Spell library');
        assert.equal(await page.locator('.workflow-menu-actions button').count(), 2);
        assert.equal(await page.locator('.menu_more').innerText().then(text => text.includes('[Tab]')), false);
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            assert(await page.locator('.workflow-table-menu').evaluate(node => node.scrollWidth <= node.clientWidth), 'Native menu fits at ' + width);
            const popup = page.locator('#ui-stack .ui-popup-outer').last();
            const bounds = await popup.boundingBox();
            assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Native popup fits at ' + width);
            assert.equal(await page.locator('.workflow-table-head').isVisible(), width > 700);
            await popup.screenshot({ path: path.join(output, 'native-spells-' + width + '.png') });
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        const first = page.locator('.workflow-table-row').first();
        const spellID = await first.getAttribute('data-entry-id');
        const spellName = await first.locator('.workflow-table-name').innerText();
        const spell = () => page.locator(`[data-entry-id='${spellID}']`);
        await first.locator('[data-entry-action=describe]').focus();
        await page.keyboard.press('Enter');
        await page.locator('.describe-spell .rich-text').first().waitFor();
        await page.locator('#ui-stack .ui-popup-outer').last().screenshot({ path: path.join(output, 'native-description.png') });
        await key(27);
        await page.locator('#ui-stack .describe-spell').waitFor({ state: 'detached' });
        await page.waitForFunction(id => document.activeElement?.closest('[data-entry-id]')?.dataset.entryId === id, spellID);
        await spell().locator('[data-entry-action=hide]').click();
        await spell().waitFor({ state: 'detached' });
        await page.locator('.workflow-menu-actions [data-entry-action=hidden]').click();
        await spell().waitFor();
        assert.equal(await spell().locator('[data-entry-action=primary]').count(), 0);
        await spell().locator('[data-entry-action=describe]').click();
        await page.locator('.describe-spell .rich-text').first().waitFor();
        await key(27);
        await page.locator('#ui-stack .describe-spell').waitFor({ state: 'detached' });
        await spell().locator('[data-entry-action=show]').click();
        await spell().waitFor({ state: 'detached' });
        assert.equal(await page.locator('.workflow-menu-actions [data-entry-action=hidden]').getAttribute('aria-pressed'), 'true');
        await page.locator('.workflow-menu-actions [data-entry-action=available]').click();
        await spell().waitFor();
        // A stale identity cannot act on another row after filtering/relettering.
        const count = await page.locator('.workflow-table-row').count();
        await page.evaluate(() => require('comm').send_message('menu_action', { action: 'hide', entry: -999 }));
        await page.waitForTimeout(150);
        assert.equal(await page.locator('.workflow-table-row').count(), count);
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close panel');
        assert.equal(await page.locator('.workflow-menu-actions [data-entry-action=available]').getAttribute('aria-pressed'), 'true');
        await key(27);
        await ready();
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock, 'Reading spends no world time');
        // The primary button reaches the native consequential confirmation.
        await page.locator('#hud_spell_library').click();
        await spell().locator('[data-entry-action=primary]').click();
        await page.waitForFunction(name => document.body.textContent.includes('Memorise ' + name + ', consuming'), spellName.trim());
        await key(110); // Decline: no spell levels or world time spent.
        await ready();
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock);
        assert.deepEqual(errors, []);
        const evidence = { success: true, account, nativeDescription: true, hideShow: true,
            primaryConfirmation: true, tabFocus: true, staleIdentityIgnored: true,
            zeroTurnInspection: true, widths: [1280, 768, 390, 320] };
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
