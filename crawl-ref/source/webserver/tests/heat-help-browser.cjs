const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const web = path.resolve(__dirname, '..');
const output = process.env.TOOLTIP_CONTENT_PROOF_DIR || '/tmp/dcss-heat-help-proof';
(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1024, height: 850 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await require('./helpers/ui-sprite-fixture.cjs').install(page);
        await page.route('http://hud.test/static/tabletop/share-link.css', route =>
            route.fulfill({ contentType: 'text/css', path: path.join(web, 'static/tabletop/share-link.css') }));
        await page.setContent('<!doctype html><html><body style="margin:30px;background:#222620">' +
            '<main id="normal"><button id="away">Away</button></main></body></html>');
        for (const file of ['game_data/static/styles/game-coop.css', 'static/tabletop/tokens.css',
            'static/tabletop/materials.css', 'static/tabletop/typography.css', 'static/tabletop/properties.css',
            'static/tabletop/tooltip-content.css', 'game_data/static/styles/nested-tips.css',
            'game_data/static/styles/gameplay-workflows.css'])
            await page.addStyleTag({ path: path.join(web, file) });
        await page.addScriptTag({ path: path.join(web, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery, comm: { send_message() {} } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const [name, file] of [
            ['item-properties', 'static/scripts/item-properties.js'],
            ['tooltip-content', 'static/scripts/tooltip-content.js'],
            ['tooltip-policy', 'static/scripts/tooltip-policy.js'],
            ['tooltip-source', 'static/scripts/tooltip-source.js'],
            ['tooltip-layout', 'static/scripts/tooltip-layout.js'],
            ['./tip-placement', 'game_data/static/tip-placement.js'],
            ['./tooltip-glossary', 'game_data/static/tooltip-glossary.js'],
            ['./persistent-help', 'game_data/static/persistent-help.js'],
            ['./nested-tips', 'game_data/static/nested-tips.js'],
            ['interactions', 'game_data/static/player-interactions.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(web, file) });
        }
        await page.evaluate(() => window.modules.interactions.init());
        await require('./helpers/heat-help-browser.cjs').verify(page, output);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ passed: true, errors }, null, 2));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') });
        console.log(await page.evaluate(() => ({ active: document.activeElement?.outerHTML,
            tip: document.getElementById('dcss_rich_tooltip')?.outerHTML })));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
