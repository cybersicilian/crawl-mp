/* Verify real transported assets, decoded pixels and origin-free warm cache. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const stopChild = require('./helpers/stop-child.cjs');
const root = path.resolve(process.env.ASSET_WEB_ROOT || path.join(__dirname, '..')), output = process.env.ASSET_DELIVERY_PROOF_DIR;
const engine = process.env.ASSET_DELIVERY_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const cacheDiagnostic = process.env.ASSET_CACHE_DIAGNOSTIC === '1';
const profile = process.env.ASSET_DELIVERY_PROFILE;
if (profile) {
    assert(path.resolve(profile).startsWith(path.resolve(output) + path.sep), 'Use only a new test-owned browser profile');
    assert(!fs.existsSync(profile), 'Preserve existing browser profiles');
}
assert(output); fs.mkdirSync(output, { recursive: true });
function request(url, headers = {}) {
    return new Promise((resolve, reject) => {
        http.get(url, { headers }, response => {
            const chunks = []; response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
            response.on('error', reject);
        }).on('error', reject);
    });
}
(async () => {
    const server = spawn(process.env.ASSET_PYTHON || 'python3', [path.join(__dirname, 'asset-delivery-fixture.py'), '--web-root', root]);
    let browser, context, fixture;
    try {
        let first = '', stderr = '';
        server.stderr.on('data', chunk => { stderr += chunk; });
        const url = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Fixture startup timed out: ' + stderr)), 10000);
            server.stdout.on('data', chunk => {
                first += chunk;
                if (first.includes('\n')) { clearTimeout(timer); fixture = JSON.parse(first.split('\n')[0]); resolve(fixture.url); }
            });
            server.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture exited: ' + code + ' ' + stderr)); });
        });
        const images = [], texts = [], budgets = {};
        for (const [directory, prefix] of [['static', '/static/'], ['game_data/static', '/gamedata/c0ffee/']]) {
            const base = path.join(root, directory), manifest = JSON.parse(fs.readFileSync(path.join(base, 'asset-delivery.json'), 'utf8'));
            for (const [name, record] of Object.entries(manifest.assets)) {
                const location = prefix + name.split('/').map(encodeURIComponent).join('/');
                if (name.endsWith('.png')) budgets[location] = Math.min(record.bytes,
                    ...['webp', 'png'].filter(kind => record.variants[kind]).map(kind => record.variants[kind].bytes));
                for (const kind of ['webp', 'png']) if (record.variants[kind])
                    images.push({ name: directory + '/' + name, kind, url: location, sha256: record.sha256 });
                for (const coding of ['br', 'gzip']) if (record.variants[coding]) texts.push({ name, coding, base, url: location });
            }
        }
        const textResults = [];
        for (const asset of texts) {
            const response = await request(url + asset.url, { 'Accept-Encoding': asset.coding });
            assert.equal(response.status, 200); assert.equal(response.headers['content-encoding'], asset.coding);
            const decoded = asset.coding === 'br' ? zlib.brotliDecompressSync(response.body) : zlib.gunzipSync(response.body);
            assert(decoded.equals(fs.readFileSync(path.join(asset.base, asset.name))), 'decoded text: ' + asset.name);
            textResults.push({ name: asset.name, coding: asset.coding, bytes: response.body.length });
        }
        if (profile) {
            context = await (engine === 'webkit' ? webkit : chromium).launchPersistentContext(profile,
                engine === 'webkit' ? { headless: true } : chromiumLaunchOptions());
        } else {
            browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch(chromiumLaunchOptions());
            context = await browser.newContext();
        }
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        // Exercise the actual optional-sheet loader with the image tags from the
        // game template. Rendering dependencies are inert in this network test.
        const fragment = await request(url + '/game-fragment'); assert.equal(fragment.status, 200);
        const tags = fragment.body.toString().match(/<img[^>]*\bid="illustrated_[^"]+"[^>]*>/g);
        assert(tags && tags.length >= 6);
        await page.evaluate(html => { document.body.innerHTML = html; }, tags.join(''));
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.assert = value => { if (!value) throw new Error('Native metadata assertion'); };
            const passthrough = { create: () => ({ image: source => source, imageGroups: source => source, tile: () => null }) };
            window.deliveryModules = { jquery: window.jQuery, 'image-grade': passthrough, 'atlas-materials': passthrough,
                'atlas-sprites': passthrough, './native-tile-art': { setImageTransform() {},
                    setTileTransform(transform) { window.portraitDemand = transform; } },
                'texture-pack': { illustrated: () => Boolean(window.useIllustrated) } };
            window.define = (deps, factory) => {
                window.deliveryModules[window.deliveryName] = factory(...deps.map(name => window.deliveryModules[name]));
            };
        });
        for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player', 'tileinfo-dngn',
            'environment-art', 'environment-materials', 'terrain-materials', 'environment-sprites',
            'deferred-images', 'asset-readiness', 'tile-art-direction']) {
            const shared = ['deferred-images', 'asset-readiness'].includes(name);
            await page.evaluate(label => { window.deliveryName = label; }, (shared ? '' : './') + name);
            await page.addScriptTag({ path: path.join(root, shared ? 'static/scripts' : 'game_data/static', name + '.js') });
        }
        const optional = await page.evaluate(require('./helpers/asset-demand-checks.cjs'), budgets);
        const beforeRevisit = JSON.parse((await request(url + '/metrics')).body.toString());
        const revisit = await context.newPage(); await revisit.goto(url);
        const revisitedPaths = await revisit.evaluate(async paths => {
            const sheets = paths.map(path => { const image = document.createElement('img'); image.src = path; document.body.append(image); return image; });
            await Promise.all(sheets.map(sheet => sheet.decode()));
            return sheets.map(sheet => sheet.getAttribute('src'));
        }, optional.activePaths);
        const afterRevisit = JSON.parse((await request(url + '/metrics')).body.toString());
        const revisitPassed = revisitedPaths.every(path => beforeRevisit[path] === afterRevisit[path]);
        optional.revisitRequests = revisitedPaths.map(path => ({ path, requests: (afterRevisit[path] || 0) - (beforeRevisit[path] || 0) }));
        if (!cacheDiagnostic) assert(revisitPassed, 'Revisit contacted origin for unchanged artwork');
        await revisit.close();
        delete optional.activePaths;
        optional.revisitOriginRequests = optional.revisitRequests.reduce((sum, row) => sum + row.requests, 0);
        const imageResults = await page.evaluate(async assets => {
            const results = [], a = document.createElement('canvas'), b = document.createElement('canvas');
            for (const asset of assets) {
                const original = await fetch(asset.url, { headers: { Accept: 'image/png', Range: 'bytes=0-' }, cache: 'no-store' });
                const mime = asset.kind === 'webp' ? 'image/webp' : 'image/png';
                const compressed = await fetch(asset.url, { headers: { Accept: mime }, cache: 'no-store' });
                if (!original.ok || !compressed.ok || !compressed.headers.get('Content-Type').includes(mime))
                    throw new Error('Image negotiation failed: ' + asset.name);
                const x = await createImageBitmap(await original.blob()), y = await createImageBitmap(await compressed.blob());
                if (x.width !== y.width || x.height !== y.height) throw new Error('Image dimensions changed: ' + asset.name);
                a.width = b.width = x.width; a.height = b.height = x.height;
                const ac = a.getContext('2d', { willReadFrequently: true }), bc = b.getContext('2d', { willReadFrequently: true });
                ac.drawImage(x, 0, 0); bc.drawImage(y, 0, 0);
                const left = ac.getImageData(0, 0, a.width, a.height).data, right = bc.getImageData(0, 0, b.width, b.height).data;
                let different = 0; for (let n = 0; n < left.length; n++) if (left[n] !== right[n]) different++;
                if (different) throw new Error('Browser pixels changed: ' + asset.name + ' (' + different + ' channels)');
                results.push({ name: asset.name, kind: asset.kind, width: x.width, height: x.height, identicalBrowserPixels: true,
                    originalBytes: Number(original.headers.get('Content-Length')), compressedBytes: Number(compressed.headers.get('Content-Length')) });
                x.close(); y.close();
            }
            return results;
        }, images);
        const warm = await page.evaluate(async asset => {
            const target = asset.url + '?v=' + asset.sha256;
            const before = await (await fetch('/metrics', { cache: 'no-store' })).json();
            for (let i = 0; i < 2; i++) {
                const response = await fetch(target, { headers: { Accept: 'image/webp' } });
                if (!response.headers.get('Cache-Control').includes('immutable')) throw new Error('Missing immutable cache');
                await response.arrayBuffer();
            }
            const after = await (await fetch('/metrics', { cache: 'no-store' })).json();
            return { originRequestsForTwoFetches: (after[target] || 0) - (before[target] || 0) };
        }, images[0]);
        if (!cacheDiagnostic) assert.equal(warm.originRequestsForTwoFetches, 1);
        assert.deepEqual(errors, []);
        const conditional = await request(url + texts[0].url, { 'Accept-Encoding': texts[0].coding });
        const cached = await request(url + texts[0].url, { 'Accept-Encoding': texts[0].coding, 'If-None-Match': conditional.headers.etag });
        assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
        const cachePassed = revisitPassed && warm.originRequestsForTwoFetches === 1;
        const report = { passed: cachePassed, browser: engine, context: profile ? 'persistent' : 'private', fixture,
            imageFidelityPassed: true, textFidelityPassed: true,
            cachePassed, images: imageResults, textRepresentationsVerified: textResults.length,
            warmCache: warm, conditional304: true, optionalArtwork: optional, browserErrors: errors };
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
        fs.writeFileSync(path.join(output, 'request-log.json'), JSON.stringify(JSON.parse((await request(url + '/request-log')).body.toString()), null, 2));
        console.log(JSON.stringify({ passed: cachePassed, imageFidelityPassed: true, textFidelityPassed: true,
            images: imageResults.length, textRepresentations: textResults.length, warmCache: warm,
            revisitRequests: optional.revisitRequests }));
        assert(cachePassed, 'Cache acceptance failed; independent fidelity proof and request log preserved');
    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
        await stopChild(server);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
