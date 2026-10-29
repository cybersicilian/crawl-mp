/* End-to-end collection comparisons against a synthetic, isolated archive. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.STATS_TEST_URL;
const output = process.env.STATS_PROOF_DIR;
assert(base && output, 'An isolated fixture URL and proof directory are required.');
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
        await page.goto(base + '/stats');
        assert(await page.locator('.stats-dashboard').isVisible());
        const metric = await page.locator('.stats-dashboard').boundingBox();
        const directory = await page.locator('.stats-directory').boundingBox();
        assert(metric.y < directory.y);
        assert.equal(await page.locator('#stats_stage').count(), 0);
        await page.screenshot({ path: path.join(output, 'dashboard-desktop.png') });
        await page.goto(base + '/stats/monsters?mode=solo&stage=5');
        assert(!(await page.locator('[data-column-view]').first().isVisible()));
        await page.locator('[data-table-view]').selectOption('reference');
        assert(await page.locator('[data-column-view]').first().isVisible());
        await page.locator('[data-table-view]').selectOption('record');
        await page.locator('[data-table-records]').check();
        const search = page.locator('#monsters_search');
        await search.fill('worm');
        await page.locator('#monsters_count').filter({ hasText: '1 of' }).waitFor();
        const row = page.locator('#monsters_table tbody tr:visible');
        assert.equal(await row.count(), 1);
        assert.match(await row.innerText(), /∞/);
        await row.locator('a').first().click();
        await page.waitForURL(/ribbon_worm/);
        assert.match(page.url(), /mode=solo/);
        assert.match(page.url(), /stage=5/);
        assert.match(await page.locator('[aria-labelledby="facts_gameplay"]').innerText(), /Mob KDR/);
        await page.goBack();
        await page.locator('#monsters_count').filter({ hasText: '1 of' }).waitFor();
        assert.equal(await search.inputValue(), 'worm');
        assert(await page.locator('[data-table-records]').isChecked());
        await search.fill('no such creature');
        await page.locator('.stats-noresults').waitFor();
        await page.locator('[data-stats-clear]').click();
        assert(!(await page.locator('[data-table-records]').isChecked()));
        await page.locator('.stats-sort').filter({ hasText: /^Mob KDR$/ }).click();
        assert.match(await page.locator('#monsters_table tbody tr').first().innerText(), /∞/);
        await page.locator('.stats-sort').filter({ hasText: /^Mob KDR$/ }).click();
        assert.equal(await page.locator('#monsters_table tbody tr').first().locator('td').nth(2).innerText(), '0');
        await page.screenshot({ path: path.join(output, 'bestiary-desktop.png') });
        await page.goto(base + '/stats/combos');
        const played = await page.locator('#played').boundingBox(), grid = await page.locator('#grid_title').boundingBox();
        assert(played.y < grid.y);
        for (const width of [390, 768, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const route of ['/stats', '/stats/monsters', '/stats/monsters/ribbon_worm', '/stats/combos', '/games', '/players', '/randarts']) {
                const res = await page.goto(base + route);
                assert.equal(res.status(), 200, route);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' overflows at ' + width);
            }
            await page.goto(base + '/stats/monsters');
            if (width < 981) {
                assert(await page.locator('#stats_section_select').isVisible());
                await page.locator('#stats_section_select').selectOption('/stats/species');
                await page.waitForURL(/species$/);
            }
            await page.screenshot({ path: path.join(output, 'stats-' + width + '.png') });
        }
        await page.goto(base + '/games');
        await page.locator('[data-collection-facet]').selectOption('saved');
        assert.equal(await page.locator('[data-collection-entry]:visible').count(), 1);
        await page.locator('[data-collection-entry]:visible > a').first().click();
        await page.goBack();
        assert.equal(await page.locator('[data-collection-facet]').inputValue(), 'saved');
        const plain = await browser.newContext({ javaScriptEnabled: false });
        const fallback = await plain.newPage();
        await fallback.goto(base + '/stats/monsters');
        assert(await fallback.locator('[data-column-view]').first().isVisible());
        assert(await fallback.locator('.stats-sections').isVisible());
        await fallback.locator('#stats_mode').selectOption('party');
        await fallback.locator('.stats-filters button[type=submit]').click();
        await fallback.waitForURL(/mode=party/);
        await plain.close();
        if (process.env.STATS_BRIEF_PATH) {
            await page.goto('file://' + process.env.STATS_BRIEF_PATH);
            await page.screenshot({ path: path.join(output, 'audit-report.png') });
        }
        assert.deepEqual(errors, []);
        console.log('Stats site passed: KDR sorting, record/mechanics views, preserved filters/search, combo hierarchy, archive facets, 3 widths, no-JS.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
