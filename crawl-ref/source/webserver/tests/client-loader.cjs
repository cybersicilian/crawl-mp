/* Legacy jQuery plugins must load safely even when the jQuery request is slow. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    let releaseImage;
    const imageGate = new Promise(resolve => { releaseImage = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    try {
        const config = fs.readFileSync(path.join(root, 'static/scripts/app.js'), 'utf8').split("require(['client'")[0];
        await page.route('http://loader.test/**', async route => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/') return route.fulfill({ contentType: 'text/html', body:
                '<!doctype html><html><body><script>window.game_version="loader-fixture";</script>'
                + '<img src="/decorative.png" alt=""><script src="/static/scripts/contrib/require.js"></script><script>' + config
                + 'require(["jquery", "contrib/jquery.json", "contrib/jquery.cookie",'
                + '"contrib/jquery.tablesorter", "contrib/jquery.waitforimages"], function ($) {'
                + '$(document).ready(function () { window.domConsumersReady = true; });'
                + 'window.loaderFacts = [$.toJSON, $.cookie, $.fn.tablesorter, $.fn.waitForImages]'
                + '.map(function (value) { return typeof value; });});</script></body></html>' });
            if (pathname === '/decorative.png') {
                await imageGate;
                return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64')}).catch(() => {});
            }
            const relative = pathname.replace(/^\//, '');
            assert(relative.startsWith('static/scripts/') && !relative.includes('..'));
            if (pathname.endsWith('/jquery.js')) await new Promise(resolve => setTimeout(resolve, 1000));
            await route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(root, relative)) });
        });
        await page.goto('http://loader.test/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.loaderFacts);
        assert.deepEqual(await page.evaluate(() => window.loaderFacts), Array(4).fill('function'));
        await page.waitForFunction(() => window.domConsumersReady);
        assert.equal(await page.evaluate(() => document.readyState), 'interactive', 'Decorative loading cannot delay DOM consumers');
        assert.deepEqual(errors, []);
        console.log('All four real legacy jQuery plugins wait for delayed jQuery and expose their APIs without errors.');
    } finally { releaseImage(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
