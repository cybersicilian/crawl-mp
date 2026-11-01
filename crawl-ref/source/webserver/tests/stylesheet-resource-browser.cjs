/* Real HTTP reproduction of a shared custom-property URL used by bundled CSS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const stopChild = require('./helpers/stop-child.cjs');
const root = path.resolve(__dirname, '..'), output = process.env.CSS_RESOURCE_PROOF_DIR;
assert(output && process.env.CSS_RESOURCE_BEFORE_ROOT); fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions()), results = [], cleanup = [];
    try {
        for (const [label, web] of [['before', process.env.CSS_RESOURCE_BEFORE_ROOT], ['after', root]]) {
            const server = spawn(process.env.ASSET_PYTHON || 'python3', [path.join(__dirname, 'asset-delivery-fixture.py'), '--web-root', web]);
            const context = await browser.newContext(); let stderr = '', startup = '';
            server.stderr.on('data', chunk => { stderr += chunk; });
            try {
                const url = await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Fixture startup timeout: ' + stderr)), 10000);
                    server.stdout.on('data', chunk => { startup += chunk;
                        if (startup.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(startup.split('\n')[0]).url); }
                    }); server.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture exit: ' + code)); });
                });
                const index = JSON.parse(fs.readFileSync(path.join(web, 'static/stylesheet-bundle-index.json'), 'utf8'));
                const hash = index.bundles.lobby.sha256;
                const page = await context.newPage(), responses = [], errors = [];
                page.on('response', response => {
                    if (response.url().includes('expedition-vault.png')) responses.push({ url: response.url(), status: response.status() });
                }); page.on('pageerror', error => errors.push(error.message));
                await page.goto(url);
                await page.evaluate(async bundle => {
                    document.body.innerHTML = '<section class="welcome-entry"><header class="welcome-intro"><h1>Shared cover image</h1></header></section>';
                    function load(href) { return new Promise((resolve, reject) => {
                        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
                        link.onload = resolve; link.onerror = () => reject(new Error('Stylesheet failed: ' + href)); document.head.append(link);
                    }); }
                    await load(bundle);
                    // A later independent stylesheet can redefine shared tokens.
                    // Their URLs must remain valid when used in another CSS file.
                    await load('/static/tabletop/art-direction-tokens.css?resource-probe=raw');
                }, '/static/.css-bundles/' + hash + '.css?v=' + hash);
                await page.waitForLoadState('networkidle');
                const styles = await page.evaluate(() => ({
                    token: getComputedStyle(document.documentElement).getPropertyValue('--art-cover').trim(),
                    background: getComputedStyle(document.querySelector('.welcome-entry')).backgroundImage
                }));
                await page.screenshot({ path: path.join(output, label + '.png') });
                assert.deepEqual(errors, []); results.push({ label, styles, responses });
            } finally {
                await context.close(); cleanup.push({ label, ...await stopChild(server) });
            }
        }
        fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify(results, null, 2));
        assert(results[0].responses.some(row => row.status === 404 && row.url.includes('/static/.css-bundles/assets/expedition-vault.png')),
            'The original shared relative URL must reproduce the reported native request');
        assert(results[1].responses.length > 0 && results[1].responses.every(row => row.status === 200), 'Fixed cover did not load over real HTTP');
        assert(!results[1].styles.background.includes('/.css-bundles/assets/'), 'Fixed computed URL retains a bundle-relative image');
        const report = { passed: true, results, cleanup };
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
