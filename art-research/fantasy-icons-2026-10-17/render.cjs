/* Native-pixel artifact verification in an isolated browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
    const root = path.join(__dirname, 'private');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 800, height: 1000 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.join(root, 'report.html')).href);
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
        const result = await page.evaluate(() => ({
            canonical: document.querySelectorAll('#mapping-table tbody tr').length,
            brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth !== 16 || image.naturalHeight !== 16).length,
            native16Samples: [...document.querySelectorAll('#groups img')].every(image => image.getBoundingClientRect().width === 16 && image.getBoundingClientRect().height === 16),
            devicePixelRatio,
            hud: getComputedStyle(document.querySelector('.dark')).backgroundImage,
            folio: getComputedStyle(document.querySelector('.light')).backgroundColor,
        }));
        assert.equal(result.canonical, 112);
        assert.equal(result.brokenImages, 0);
        assert(result.native16Samples);
        assert.equal(result.devicePixelRatio, 1);
        await page.locator('#query').fill('zoom-reset');
        assert.equal(await page.locator('#mapping-table tbody tr:visible').count(), 1);
        await page.locator('#query').fill('');
        await page.locator('#comparison').screenshot({ path: path.join(root, 'fantasy-16px-comparison.png') });
        await page.locator('#groups').screenshot({ path: path.join(root, 'fantasy-16px-workflows.png') });
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(__dirname, 'browser-verification.json'), JSON.stringify({ ...result, searchFilterPassed: true, pageErrors: errors, liveGame: false }, null, 2) + '\n');
        console.log(JSON.stringify(result));
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
