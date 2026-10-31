/* Browser checks against the isolated synthetic stats HTTP fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.STATS_TEST_URL;
assert(base, 'Set STATS_TEST_URL to an isolated stats fixture server.');
const output = process.env.STATS_PROOF_DIR || '/tmp/dcss-stats-impact-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(base + '/stats/items/potions.curing?mode=solo');
        const impact = await page.request.get(base + '/api/stats/items/potions.curing?mode=solo');
        assert.equal((await impact.json()).impact.win_delta_pp, 35);
        await page.locator('#impact_partner').fill('hobgoblin');
        const suggestion = page.locator('#impact_matches a').first();
        await suggestion.waitFor();
        assert.match(await suggestion.getAttribute('href'), /items%3Apotions.curing%3A%3Amonsters%3Ahobgoblin/);
        await suggestion.click();
        await page.waitForURL(/impacts\/.+%3A%3A.+/);
        const pair = await (await page.request.get(base + '/api/stats/impacts/items:potions.curing::monsters:hobgoblin')).json();
        assert.equal(pair.impact.win_delta_pp, 30);
        assert.equal(pair.impact.score_delta, 300);
        assert.match(await page.locator('.stats-impact-summary').innerText(), /\+30.00/);
        assert.match(await page.locator('.stats-impact-evidence').innerText(), /10 \/ 10 \/ 10 \/ 10/);
        await page.screenshot({ path: path.join(output, 'interaction-desktop.png'), fullPage: true });
        await page.locator('#stats_stage').selectOption('5');
        await page.waitForURL(/stage=5/);
        assert.match(await page.locator('#interaction').innerText(), /Insufficient data/);
        await page.locator('#stats_stage').selectOption('1');
        await page.waitForURL(url => url.searchParams.get('stage') === '1');
        assert.match(await page.locator('#interaction').innerText(), /Estimated association/);

        await page.goto(base + '/stats/ratings');
        const account = page.locator('#global-elo_table tbody tr').filter({ hasText: 'Example0' });
        const elo = await account.locator('td').nth(1).innerText();
        await page.locator('#stats_account').fill('Example0');
        await page.locator('#stats_account').press('Enter');
        await page.waitForURL(/account=Example0/);
        assert.equal(await page.locator('#global-elo_table tbody tr').count(), 1);
        assert.equal(await page.locator('#global-elo_table tbody tr td').nth(1).innerText(), elo);
        await page.screenshot({ path: path.join(output, 'ratings-desktop.png'), fullPage: true });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(base + '/stats/items/potions.curing');
        assert(await page.locator('#impact_partner').isVisible());
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await page.screenshot({ path: path.join(output, 'impact-mobile.png'), fullPage: true });

        const plain = await browser.newContext({ javaScriptEnabled: false });
        const plainPage = await plain.newPage();
        await plainPage.goto(base + '/stats/items/potions.curing?mode=solo');
        await plainPage.locator('#impact_partner').fill('hobgoblin');
        await plainPage.locator('[data-impact-search] button').click();
        await plainPage.waitForURL(/compare=items%3Apotions.curing/);
        assert.match(await plainPage.locator('#impacts').innerText(), /30/);
        assert.match(plainPage.url(), /mode=solo/);
        await plain.close();
        assert.deepEqual(errors, []);
        process.stdout.write('Stats browser workflows passed: numeric effects, arbitrary pairs, immediate stage changes, global Elo filters, mobile overflow, and no-JS search.\n');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
