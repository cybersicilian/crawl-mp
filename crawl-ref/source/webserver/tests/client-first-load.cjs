/* The initial app request must honor the same slow-link policy as its modules. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/client.html'), 'utf8');
const bootstrap = template.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1]
    .replace(/\{%.*?%\}/g, '');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        for (const configured of [false, true]) {
            const page = await browser.newPage();
            const errors = [];
            let releaseApp, requested;
            const gate = new Promise(resolve => { releaseApp = resolve; });
            const appRequest = new Promise(resolve => { requested = resolve; });
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.install();
            await page.route('http://first-load.test/**', async route => {
                const pathname = new URL(route.request().url()).pathname;
                if (pathname === '/') return route.fulfill({ contentType: 'text/html', body:
                    '<!doctype html><script>' + (configured ? bootstrap : '') + '</script>'
                    + '<script src="/require.js" data-main="/app.js"></script>' });
                if (pathname === '/require.js') return route.fulfill({
                    contentType: 'application/javascript',
                    body: fs.readFileSync(path.join(root, 'static/scripts/contrib/require.js')) });
                assert.equal(pathname, '/app.js');
                requested();
                await gate;
                return route.fulfill({ contentType: 'application/javascript', body:
                    'window.firstAppReady = true;' }).catch(() => {});
            });
            try {
                await page.goto('http://first-load.test/', { waitUntil: 'domcontentloaded' });
                await appRequest;
                try {
                    await page.clock.runFor(8000);
                } catch (error) {
                    if (configured) throw error;
                    assert.match(error.message, /Load timeout for modules: app/);
                    errors.push(error.message);
                }
                if (configured) assert.deepEqual(errors, [], 'A delayed data-main must not time out');
                else assert(errors.some(error => error.includes('Load timeout for modules: app')),
                    'The control must reproduce the original RequireJS timeout');
                releaseApp();
                if (configured) {
                    await page.waitForFunction(() => window.firstAppReady);
                    assert.deepEqual(errors, []);
                }
            } finally { releaseApp(); await page.close(); }
        }
        console.log('Delayed initial app loads safely; the unconfigured control reproduces its timeout.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
