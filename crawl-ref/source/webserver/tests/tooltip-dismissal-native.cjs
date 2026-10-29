const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Launch, save to lobby, then launch again with gameplay handlers still loaded. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8896';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.TOOLTIP_DISMISSAL_PROOF_DIR || '/tmp/dcss-tooltip-dismissal-proof';

(async () => {
    fs.mkdirSync(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = { url, account: 'TooltipQA' + Date.now().toString(36), launches: [] };
    page.on('pageerror', error => errors.push(error.stack));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready() && require('client').in_game()
            && require('library-ui').save_status().reason === '';
    }, null, { timeout: 90000 });
    async function noTips() {
        for (const id of ['lobby_rich_tooltip', 'dcss_rich_tooltip'])
            assert.equal(await page.locator('#' + id).isVisible(), false, id + ' is dismissed');
    }
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        for (let round = 0; round < 2; round++) {
            if (!(await page.locator('#party_room_view').isVisible()))
                await page.locator('#lobby_home [data-lobby-create]').click();
            await page.locator('#party_room_view').waitFor({ state: 'visible' });
            const launch = page.locator('#btn_launch_party_room');
            await launch.hover();
            await page.locator('#lobby_rich_tooltip').waitFor({ state: 'visible' });
            await page.waitForTimeout(450);
            assert.equal(await page.locator('#dcss_rich_tooltip').isVisible(), false,
                'Launch has only lobby help, even with gameplay modules loaded');
            await launch.click();
            await ready();
            // Keep the pointer where Launch was. No click-away or refresh may be needed.
            await noTips();
            assert.equal(await launch.getAttribute('aria-describedby'), null);
            evidence.launches.push(await page.evaluate(() => ({ route: location.hash,
                heroes: window.crawl_party.state.members.length,
                layer: window.current_layer, title: document.title })));
            await page.screenshot({ path: path.join(out, `launch-${round + 1}.png`) });
            console.log('Launch ' + (round + 1) + ': dungeon ready, no lingering tooltip');
            await page.locator('#dock_session_menu').click();
            await page.locator('#session_menu[open]').waitFor();
            page.once('dialog', dialog => dialog.accept());
            await page.locator('[data-session-save="quit"]').click();
            await page.locator('#game_library_panel').waitFor({ state: 'visible' });
            await page.mouse.move(1400, 850);
            await noTips();
        }
        assert.deepEqual(errors, []);
        evidence.success = true;
        evidence.errors = errors;
        fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
        fs.writeFileSync(path.join(out, 'failure.txt'), String(error.stack) + '\n' + errors.join('\n')
            + '\n' + await page.locator('body').innerText().catch(() => ''));
        throw error;
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
