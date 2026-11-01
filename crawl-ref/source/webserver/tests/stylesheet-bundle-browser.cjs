/* Actual lobby/game CSS graphs, DOM layout, screenshots and origin traffic. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const stopChild = require('./helpers/stop-child.cjs');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(process.env.ASSET_WEB_ROOT || path.join(__dirname, '..')), output = process.env.STYLESHEET_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
function request(url) { return new Promise((resolve, reject) => {
    http.get(url, response => { const chunks = []; response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
}); }
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
(async () => {
    const server = spawn(process.env.ASSET_PYTHON || 'python3', [path.join(__dirname, 'asset-delivery-fixture.py'), '--web-root', root]);
    let browser, fixture;
    try {
        let startup = '', stderr = '';
        server.stderr.on('data', chunk => { stderr += chunk; });
        const url = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Fixture startup timeout: ' + stderr)), 10000);
            server.stdout.on('data', chunk => { startup += chunk;
                if (startup.includes('\n')) { clearTimeout(timer); fixture = JSON.parse(startup.split('\n')[0]); resolve(fixture.url); }
            }); server.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture exited: ' + code)); });
        });
        browser = await chromium.launch(chromiumLaunchOptions()); const errors = [], results = [];
        for (const kind of ['lobby', 'game']) {
            const raw = await request(url + '/' + kind + '-fragment?styles=raw');
            const bundled = await request(url + '/' + kind + '-fragment');
            assert.equal(raw.status, 200, stderr); assert.equal(bundled.status, 200, stderr);
            const game = /"game-([0-9a-f]+)":\s*"(\/gamedata\/[0-9a-f]+)"/.exec(raw.body);
            const media = /id="floor"[^>]*src="(\/gamedata\/[0-9a-f]+\/)/.exec(raw.body);
            const aliases = game && media ? [game[2] + '/', media[1]] : [];
            async function visit(context, html, label) {
                const before = JSON.parse((await request(url + '/metrics')).body);
                const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
                await page.goto(url);
                const count = await page.evaluate(async ({ html, markup, kind }) => {
                    const parsed = new DOMParser().parseFromString(html, 'text/html');
                    const body = new DOMParser().parseFromString(markup, 'text/html');
                    body.querySelectorAll('script').forEach(script => script.remove());
                    document.body.innerHTML = kind === 'game' ? '<div id="game">' + body.body.innerHTML + '</div>' : body.body.innerHTML;
                    const shown = document.getElementById(kind === 'game' ? 'normal' : 'lobby'); if (shown) shown.style.display = 'block';
                    const links = Array.from(parsed.querySelectorAll('link[rel=stylesheet]'));
                    await Promise.all(links.map(source => new Promise((resolve, reject) => {
                        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = source.getAttribute('href');
                        link.setAttribute('data-contract-css', ''); link.onload = resolve;
                        link.onerror = () => reject(new Error('Failed stylesheet: ' + link.href)); document.head.append(link);
                    })));
                    // Recalculate style before waiting: newly attached sheets can
                    // otherwise leave a swap font unused until the first layout.
                    document.body.getBoundingClientRect();
                    await document.fonts.ready;
                    const fonts = new Set(Array.from(document.body.querySelectorAll('*'))
                        .map(element => getComputedStyle(element).font).filter(Boolean));
                    await Promise.all(Array.from(fonts, font => document.fonts.load(font)));
                    await document.fonts.ready;
                    await Promise.all(Array.from(document.images).filter(image => image.getBoundingClientRect().width > 0
                        && image.getBoundingClientRect().height > 0).map(image => image.decode()));
                    return links.length;
                }, { html, markup: raw.body, kind });
                await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
                await page.waitForLoadState('networkidle');
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const contract = await page.evaluate(require('./helpers/stylesheet-contract.cjs'), aliases);
                await page.screenshot({ path: path.join(output, kind + '-' + label + '.png'), fullPage: false });
                await page.close();
                const after = JSON.parse((await request(url + '/metrics')).body);
                const cssRequests = Object.keys(after).filter(key => /\.css(?:\?|$)/.test(key))
                    .reduce((sum, key) => sum + after[key] - (before[key] || 0), 0);
                fs.writeFileSync(path.join(output, kind + '-' + label + '-contract.json'), JSON.stringify(contract));
                return { links: count, cssRequests, rules: contract.rules.length, elements: contract.layout.length,
                    ruleHash: hash(contract.rules), layoutHash: hash(contract.layout), geometryHash: hash(contract.geometry) };
            }
            const originalContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
            const original = await visit(originalContext, raw.body, 'original'); await originalContext.close();
            const preparedContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
            const prepared = await visit(preparedContext, bundled.body, 'prepared');
            const warm = await visit(preparedContext, bundled.body, 'warm'); await preparedContext.close();
            assert.equal(prepared.links, 1, 'Actual bundle must be selected');
            assert.equal(original.ruleHash, prepared.ruleHash, 'All CSS rules, order and resolved URLs must match');
            assert.equal(original.layoutHash, prepared.layoutHash, 'Computed layout and presentation must match');
            assert.equal(original.geometryHash, prepared.geometryHash, 'All element positions and dimensions must match');
            assert(prepared.cssRequests < original.cssRequests); assert.equal(warm.cssRequests, 0);
            results.push({ kind, original, prepared, warm });
        }
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: true, fixture, results, errors }, null, 2));
        console.log(JSON.stringify({ passed: true, results }));
    } finally {
        if (browser) await browser.close();
        await stopChild(server);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
