/* Actual archive template with disposable records; filters, return context and narrow layout. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON || path.resolve(root, '../../../.venv/bin/python');
const output = process.env.ARCHIVE_PROOF_DIR || '/tmp/dcss-archive-proof';
fs.mkdirSync(output, { recursive: true });
const render = `
import sys
from tornado.template import Loader
class Handler:
    def get_cookie(self, name): return 'fixture'
entries=[dict(id='amber', name='Amber Expedition', owner='Lyra', status='saved'),
         dict(id='copper', name='Copper Cauldron', owner='Moss', status='active'),
         dict(id='ivory', name='<Ivory> Expedition', owner='Lyra', status='ended')]
sys.stdout.buffer.write(Loader(sys.argv[1]).load('library.html').generate(
    kind='games', entity=None, entries=entries, label='Expeditions',
    labels={'games':'Expeditions','players':'Players & heroes','randarts':'Randarts'},
    handler=Handler(), xsrf_form_html=lambda: ''))
`;
(async () => {
    const html = execFileSync(python, ['-c', render, path.join(root, 'templates')]);
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('https://outgame-archive.test/**', route => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
            return route.fulfill({ path: path.join(root, pathname) });
        });
        await page.goto('https://outgame-archive.test/');
        const search = page.getByRole('searchbox', { name: 'Find expeditions' });
        await search.fill('Lyra');
        assert.equal(await page.locator('[data-collection-entry]:visible').count(), 2);
        await search.fill('ivory');
        assert.equal(await page.locator('[data-collection-entry]:visible').count(), 1);
        assert(await page.getByRole('link', { name: '<Ivory> Expedition', exact: true }).isVisible());
        await page.reload(); assert.equal(await search.inputValue(), 'ivory');
        assert.equal(await page.locator('[data-collection-entry]:visible').count(), 1);
        await search.fill('no-such-record'); assert(await page.locator('#archive_no_matches').isVisible());
        await search.press('Escape'); assert.equal(await search.inputValue(), '');
        assert.equal(await page.locator('[data-collection-entry]:visible').count(), 3);
        await page.locator('.archive-account summary').click(); assert(await page.locator('#logout_link').isVisible());
        await page.locator('.archive-account summary').press('Escape'); assert.equal(await page.locator('#logout_link').isVisible(), false);
        assert.equal(await page.getByRole('link', { name: 'Saved expeditions', exact: true }).getAttribute('href'), '/?view=saved#lobby');
        for (const width of [390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: path.join(output, 'archive-' + width + '.png'), fullPage: true });
        }
        assert.deepEqual(errors, []);
        console.log('Archive: actual template, immediate name/host search, escaped names, query retention, empty results, Escape, account controls, return routes and 390–1440px layouts passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
