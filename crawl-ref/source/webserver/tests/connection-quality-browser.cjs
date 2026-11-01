/* Real badge composition and lifecycle, without a game or network connection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const web = path.resolve(__dirname, '..');
const output = process.env.PERFORMANCE_PROOF_DIR || '/tmp/dcss-performance-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 360, height: 240 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<div id="party_progress">Turn order</div><div id="lobby_navigation">Lobby</div>');
        await page.addStyleTag({ path: path.join(web, 'static/styles/connection-quality.css') });
        await page.addStyleTag({ content: 'body{background:#171710;color:#e5d3a4;font:14px system-ui}#party_progress{display:flex;gap:8px;align-items:center;padding:8px;border:1px solid #a58c52}' });
        await page.addScriptTag({ path: path.join(web, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery,
                comm: { register_immediate_handlers(handlers) { window.handlers = handlers; } } };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
        });
        for (const name of ['latency-monitor', 'frame-rate-monitor', 'connection-quality']) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(web, 'static/scripts', name + '.js') });
        }
        await page.evaluate(() => {
            const quality = window.modules['connection-quality'];
            quality.bind();
            window.socket = { readyState: 1, bufferedAmount: 0,
                send(text) { window.probe = JSON.parse(text); } };
            quality.connected(window.socket);
            window.handlers.transport_pong({ sequence: window.probe.sequence });
        });
        await page.waitForFunction(() => /^\d+ FPS$/.test(document.querySelector('.connection-quality-fps').textContent));
        const badge = page.locator('#connection_quality');
        assert.match(await badge.textContent(), /\d+ ms\d+ FPS/);
        assert.match(await badge.getAttribute('aria-label'), /Connection: \d+ ms\. \d+ FPS/);
        assert.match(await badge.getAttribute('data-tip-body'), /including idle frames/);
        assert.equal(await page.locator('#party_progress > #connection_quality').count(), 1);
        assert(await badge.evaluate(node => {
            const ping = node.querySelector('.connection-quality-value').getBoundingClientRect();
            const fps = node.querySelector('.connection-quality-fps').getBoundingClientRect();
            return fps.left >= ping.right && Math.abs(fps.top - ping.top) < 1 && node.getBoundingClientRect().right <= innerWidth;
        }), 'FPS stays beside ping and fits a narrow viewport');
        await badge.focus();
        await page.screenshot({ path: path.join(output, 'performance-badge.png') });
        await page.evaluate(() => {
            window.jQuery('#party_progress').hide();
            window.jQuery(document).trigger('game_cleanup');
        });
        await page.waitForSelector('#lobby_navigation > #connection_quality');
        await page.evaluate(() => window.modules['connection-quality'].disconnected());
        assert.equal(await page.locator('.connection-quality-fps').textContent(), '— FPS');
        assert.equal(await badge.getAttribute('data-connection'), 'disconnected');
        await page.evaluate(() => window.modules['connection-quality'].connected(window.socket));
        await page.waitForFunction(() => /^\d+ FPS$/.test(document.querySelector('.connection-quality-fps').textContent));
        assert.equal(await badge.count(), 1, 'Reconnect reuses the badge');
        await page.evaluate(() => window.modules['connection-quality'].disconnected());
        assert.deepEqual(errors, []);
        console.log('Ping/FPS placement, accessibility, relocation, disconnect and reconnect passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
