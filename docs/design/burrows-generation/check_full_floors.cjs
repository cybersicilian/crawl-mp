const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.argv[2], 'playwright'));

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
    const output = path.resolve(process.argv[4]);
    const page = await browser.newPage({ viewport: { width: 736, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(pathToFileURL(path.resolve(process.argv[3])).href);
        const frame = page.frameLocator('iframe');
        const floor = frame.locator('[data-floor]');
        const canvas = frame.locator('#dcss-native-full-floors canvas');
        await frame.locator('[data-summary]').filter({ hasText: 'monsters' }).waitFor();
        const options = await floor.locator('option').evaluateAll(nodes => nodes.map(n => n.value));
        assert.equal(options.length, 9);
        for (const id of options) {
            await floor.selectOption(id);
            assert.equal(await floor.inputValue(), id);
            assert.match(await canvas.getAttribute('aria-label'), /monsters/);
        }
        await floor.selectOption('worm-2');
        const contents = frame.locator('[data-inspect]');
        const mushroom = await contents.locator('option').evaluateAll(nodes => {
            const match = nodes.find(n => /mushroom|deathcap/.test(n.textContent));
            return match ? match.value : nodes.find(n => n.value)?.value;
        });
        assert.ok(mushroom);
        await contents.selectOption(mushroom);
        assert.match(await frame.locator('[data-detail]').textContent(), /\d+,\d+/);
        const before = await canvas.screenshot();
        await frame.locator('[data-plus]').click();
        const zoomed = await canvas.screenshot();
        assert.ok(!before.equals(zoomed), 'Zoom must change the rendered map');
        await frame.locator('[data-fit]').click();
        await frame.locator('#dcss-native-full-floors').screenshot({ path: path.join(output, 'viewer-wide.png') });
        await page.setViewportSize({ width: 320, height: 1000 });
        await page.emulateMedia({ colorScheme: 'dark' });
        const fits = await frame.locator('#dcss-native-full-floors').evaluate(node =>
            node.scrollWidth <= node.clientWidth + 1);
        assert.ok(fits, 'Map controls must fit a 320-pixel viewport');
        await frame.locator('#dcss-native-full-floors').screenshot({ path: path.join(output, 'viewer-narrow.png') });
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'viewer-checks.json'), JSON.stringify({
            passed: true, floors: options, inspectedCell: mushroom,
            zoomChangesPixels: true, fits320px: fits, pageErrors: errors
        }, null, 2) + '\n');
        process.stdout.write('PASS: nine floor choices, native tile inspection, zoom and narrow layout.\n');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
