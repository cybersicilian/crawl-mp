/* Installed RequireJS 2.1.6, actual styles/imports and native image reuse. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(__dirname, '..'), output = process.env.GAME_CACHE_PROOF_DIR;
assert(output && process.env.GAME_CACHE_ROOT); fs.mkdirSync(output, { recursive: true });
function request(url) {
    return new Promise((resolve, reject) => {
        http.get(url, response => {
            const chunks = []; response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
        }).on('error', reject);
    });
}
(async () => {
    const server = spawn(process.env.ASSET_PYTHON || 'python3', [path.join(__dirname, 'asset-delivery-fixture.py'),
        '--web-root', root, '--cache-root', process.env.GAME_CACHE_ROOT]);
    let browser;
    try {
        let first = '', stderr = '';
        server.stderr.on('data', chunk => { stderr += chunk; });
        const url = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Fixture startup timed out: ' + stderr)), 10000);
            server.stdout.on('data', chunk => {
                first += chunk;
                if (first.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(first.split('\n')[0]).url); }
            });
            server.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture exited: ' + code)); });
        });
        const lobby = JSON.parse(fs.readFileSync(path.join(root, 'static/asset-delivery.json'), 'utf8')).script_revision;
        browser = await chromium.launch(chromiumLaunchOptions()); const context = await browser.newContext();
        const errors = [];
        async function visit(variant) {
            const fragment = await request(url + '/game-fragment?cache=' + variant); assert.equal(fragment.status, 200);
            const match = /"game-([0-9a-f]+)":\s*"(\/gamedata\/[0-9a-f]+)"/.exec(fragment.body); assert(match);
            const prefix = match[2] + '/';
            const before = JSON.parse((await request(url + '/metrics')).body);
            const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
            await page.goto(url);
            const sources = await page.evaluate(html => {
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                return { styles: Array.from(parsed.querySelectorAll('link[rel=stylesheet]')).map(link => link.getAttribute('href')),
                    floor: parsed.getElementById('floor').getAttribute('src') };
            }, fragment.body);
            await page.addScriptTag({ url: url + '/static/scripts/contrib/require.js?v=' + lobby });
            const observed = await page.evaluate(async ({ prefix, sources, lobby }) => {
                window.assert = value => { if (!value) throw new Error('Native metadata assertion'); };
                const probe = document.createElement('span'); probe.id = 'cache-style-probe'; document.body.append(probe);
                const styles = sources.styles.map(href => new Promise((resolve, reject) => {
                    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
                    link.onload = resolve; link.onerror = reject; document.head.append(link);
                }));
                const image = new Image(); image.src = sources.floor;
                window.require.config({ baseUrl: '/static/scripts', paths: { jquery: '/static/scripts/contrib/jquery',
                    'cache-game': prefix.slice(0, -1) }, urlArgs: 'v=' + lobby, waitSeconds: 20 });
                await Promise.all([...styles, image.decode(), new Promise((resolve, reject) => {
                    window.require(['cache-game/environment-art', 'cache-game/environment-sprites'], (catalog, regions) => {
                        if (!catalog.creatures || !regions.player.length) reject(new Error('Actual game modules did not initialize'));
                        else resolve();
                    }, reject);
                })]);
                return { code: window.cacheProbeVersion, color: getComputedStyle(probe).color };
            }, { prefix, sources, lobby });
            await page.close();
            const after = JSON.parse((await request(url + '/metrics')).body);
            const styles = new Set(sources.styles);
            const requested = Object.keys(after).filter(key => (key.startsWith(prefix) || styles.has(key)) && /\.(?:js|css)(?:\?|$)/.test(key));
            const codeRequests = requested.reduce((sum, key) => sum + after[key] - (before[key] || 0), 0);
            const imageRequests = (after[sources.floor] || 0) - (before[sources.floor] || 0);
            return { version: match[1], ...observed, codeRequests, imageRequests, imageUrl: sources.floor };
        }
        const cold = await visit('one'), warm = await visit('one'), changed = await visit('two'), changedWarm = await visit('two');
        assert(cold.codeRequests > 8); assert.equal(cold.imageRequests, 1);
        assert.equal(warm.codeRequests, 0); assert.equal(warm.imageRequests, 0);
        assert.equal(cold.code, 1); assert.equal(cold.color, 'rgb(11, 22, 33)');
        assert.notEqual(cold.version, changed.version); assert(changed.codeRequests > 8);
        assert.equal(changed.code, 2); assert.equal(changed.color, 'rgb(44, 55, 66)');
        assert.equal(changed.imageUrl, cold.imageUrl); assert.equal(changed.imageRequests, 0);
        assert.equal(changedWarm.codeRequests, 0); assert.equal(changedWarm.imageRequests, 0); assert.deepEqual(errors, []);
        const report = { passed: true, loader: 'installed RequireJS 2.1.6', cold, warm, changed, changedWarm, errors };
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report));
    } finally {
        if (browser) await browser.close();
        if (server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
