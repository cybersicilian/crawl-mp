/* Isolated artifact QA and screenshots; never loads the running game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(pathToFileURL(path.join(__dirname, 'report.html')).href);
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
        const geometry = await page.evaluate(() => ({
            canonicalRows: document.querySelectorAll('#roles tbody tr').length,
            brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth !== 16).length,
            nativeSamples: [...document.querySelectorAll('#semantic img')].every(image => image.getBoundingClientRect().width === 16 && image.getBoundingClientRect().height === 16),
            darkGradient: getComputedStyle(document.querySelector('.dark')).backgroundImage,
            folio: getComputedStyle(document.querySelector('.light')).backgroundColor,
            devicePixelRatio,
        }));
        assert.equal(geometry.canonicalRows, 112);
        assert.equal(geometry.brokenImages, 0);
        assert(geometry.nativeSamples);
        assert.equal(geometry.devicePixelRatio, 1);
        assert(geometry.darkGradient.includes('linear-gradient'));
        await page.locator('#query').fill('zoom-in');
        assert.equal(await page.locator('#roles tbody tr:visible').count(), 1);
        await page.locator('#query').fill('');
        await page.locator('#status').selectOption('gap');
        assert.equal(await page.locator('#roles tbody tr:visible').count(), 22);
        await page.locator('#status').selectOption('');
        await page.addStyleTag({ content: '#semantic .tile{width:94px;padding:6px}#semantic code{font-size:9px}#semantic .group{gap:10px}' });
        await page.locator('#semantic').screenshot({ path: path.join(__dirname, 'browser-semantic-16px.png') });
        await page.locator('#shortlist').screenshot({ path: path.join(__dirname, 'browser-shortlist-16px.png') });
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(__dirname, 'browser-verification.json'), JSON.stringify({ ...geometry, searchFilterPassed: true, gapFilterPassed: true, pageErrors: errors, liveGame: false }, null, 2) + '\n');
        console.log(JSON.stringify(geometry));
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
