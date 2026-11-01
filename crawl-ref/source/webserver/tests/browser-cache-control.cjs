/* Compare private and persistent browser caches against an independent HTTP control. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium, webkit } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const output = process.env.CACHE_CONTROL_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
const requests = [], results = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const server = http.createServer((request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Cache control</title>'); return; }
    const body = request.url.startsWith('/image') ? png : Buffer.from('Unchanged cache control bytes.');
    const etag = '"' + crypto.createHash('sha256').update(body).digest('hex') + '"';
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('ETag', etag); response.setHeader('Vary', 'Accept, Accept-Encoding');
    response.setHeader('Content-Type', request.url.startsWith('/image') ? 'image/png' : 'text/plain');
    response.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString());
    const status = request.headers['if-none-match'] === etag ? 304 : 200;
    requests.push({ url: request.url, status, ifNoneMatch: request.headers['if-none-match'] || null });
    response.writeHead(status); response.end(status === 304 ? undefined : body);
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = 'http://127.0.0.1:' + server.address().port;
    try {
        for (const [engine, persistent] of [['chromium', false], ['webkit', false], ['webkit', true]]) {
            let browser, context;
            try {
                if (persistent) context = await webkit.launchPersistentContext(path.join(output, 'webkit-profile'), { headless: true });
                else {
                    browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch(chromiumLaunchOptions());
                    context = await browser.newContext();
                }
                const key = engine + '-' + (persistent ? 'persistent' : 'private');
                const page = await context.newPage(); await page.goto(address);
                const image = '/image.png?v=' + key, text = '/control.txt?v=' + key;
                await page.evaluate(async ({ image, text }) => {
                    for (let i = 0; i < 2; i++) await (await fetch(text)).arrayBuffer();
                    const picture = new Image(); picture.src = image; document.body.append(picture); await picture.decode();
                }, { image, text });
                const next = await context.newPage(); await next.goto(address);
                await next.evaluate(async image => { const picture = new Image(); picture.src = image; document.body.append(picture); await picture.decode(); }, image);
                results.push({ browser: engine, context: persistent ? 'persistent' : 'private',
                    fetchOriginRequestsForTwoFetches: requests.filter(row => row.url === text).length,
                    imageOriginRequestsForTwoPages: requests.filter(row => row.url === image).length });
            } finally {
                if (context) await context.close();
                if (browser) await browser.close();
            }
        }
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ results, requests }, null, 2));
        console.log(JSON.stringify(results));
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
