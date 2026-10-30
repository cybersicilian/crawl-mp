/* Isolated collection adapters: production modules and CSS, disposable DOM data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.COLLECTION_PROOF_DIR || '/tmp/dcss-collection-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.route('https://collection.test/**', route => {
            const pathname = new URL(route.request().url()).pathname;
            return route.fulfill({ path: path.join(root, pathname) });
        });
        await page.goto('https://collection.test/static/scripts/text-query.js');
        await page.setContent('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body>' +
            '<main id="lobby" class="has-chapter-index"><section id="party_lobby_panel">' +
            '<div id="party_room_view" style="display:none"></div><div id="party_rooms_list_view">' +
            '<table id="party_rooms_table"><thead><tr><th>Host</th><th>Party</th></tr></thead><tbody>' +
            '<tr data-joinable="true"><td>Café</td><td>Amber gathering</td></tr><tr data-joinable="false"><td>Orin</td><td>Jade gathering</td></tr></tbody></table></div></section>' +
            '<section id="lobby_body"><span>Live games</span><table id="player_list"><thead><tr><th>Hero</th><th>Floor</th></tr></thead>' +
            '<tbody><tr><td>Lyra Amber</td><td>D:3</td></tr><tr><td>Orin Jade</td><td>Lair:2</td></tr></tbody></table></section>' +
            '<section id="coop_chronicle_panel"><header class="party-hall-header"><h1 class="party-hall-title">Chronicle</h1></header>' +
            '<div id="coop_chronicle_grid">' +
            ['comps', 'ghosts', 'items'].map((name, i) => '<section class="chronicle-box"><h2>' + name +
                '<span>(1)</span></h2><div id="chronicle_' + name + '_list"><div class="chronicle-entry">' +
                ['Amber recipe Lyra Human Fighter', 'Jade Orin Deep Elf', 'Café sword Lyra D:3'][i] +
                '</div></div></section>').join('') + '</div></section></main></body></html>');
        for (const file of ['style.css', 'tabletop/navigation.css', 'tabletop/lobby-workspace.css',
            'tabletop/lobby-dashboard.css', 'tabletop/layout-rhythm.css', 'tabletop/library.css', 'tabletop/party-management.css'])
            await page.addStyleTag({ url: 'https://collection.test/static/' + file });
        await page.evaluate(() => {
            window.modules = {};
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
        });
        for (const name of ['text-query', 'lobby-browser', 'lobby-discovery']) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, 'static/scripts', name + '.js') });
        }
        await page.evaluate(() => {
            const lobby = document.getElementById('lobby');
            window.modules['lobby-browser'].init(lobby);
            window.modules['lobby-discovery'].init(lobby);
            window.modules['lobby-discovery'].refresh(false);
        });
        const friends = page.getByRole('searchbox', { name: 'Find a friend or expedition' });
        await friends.fill('D:3 lyra');
        assert.equal(await page.locator('#player_list tbody tr:visible').count(), 1);
        assert.equal(await page.locator('#party_rooms_table tbody tr:visible').count(), 0);
        assert.equal(await page.locator('.lobby-discovery-count').textContent(), '1 matching result');
        await friends.fill('cafe amber');
        assert.equal(await page.locator('#party_rooms_table tbody tr:visible').count(), 1);
        await friends.press('Escape');
        assert.equal(await friends.inputValue(), '');
        assert.equal(await page.locator('.lobby-discovery-count').textContent(), '4 listings available');
        await friends.fill('none');
        assert(await page.locator('.lobby-discovery-no-results').isVisible());
        await page.locator('.lobby-discovery-header').getByRole('button', { name: 'Clear filters', exact: true }).click();
        assert(await friends.evaluate(node => node === document.activeElement));
        await page.getByRole('button', { name: 'Open seats', exact: true }).click();
        assert.equal(await page.locator('#party_rooms_table tbody tr:visible').count(), 1);
        assert.equal(await page.locator('#player_list tbody tr:visible').count(), 0);
        await page.getByRole('button', { name: 'Live expeditions', exact: true }).click();
        assert.equal(await page.locator('#party_rooms_table tbody tr:visible').count(), 0);
        assert.equal(await page.locator('#player_list tbody tr:visible').count(), 2);
        await page.locator('.lobby-discovery-header').getByRole('button', { name: 'Clear filters', exact: true }).click();
        assert.equal(await page.locator('.lobby-discovery-count').textContent(), '4 listings available');
        const chronicle = page.getByRole('searchbox', { name: 'Search Chronicle' });
        await page.getByRole('button', { name: 'Discoveries', exact: true }).click();
        await chronicle.fill('d:3 CAFE');
        assert.equal(await page.locator('.chronicle-entry:visible').count(), 1);
        assert.equal(await page.locator('.chronicle-search-count').textContent(), '1 of 1 entry');
        await chronicle.press('Escape');
        assert.equal(await chronicle.inputValue(), '');
        assert.equal(await page.getByRole('button', { name: 'Discoveries', exact: true }).getAttribute('aria-pressed'), 'true');
        await page.locator('#coop_chronicle_panel').getByRole('button', { name: 'Clear filters', exact: true }).click();
        assert.equal(await page.locator('.chronicle-entry:visible').count(), 3);
        assert(await chronicle.evaluate(node => node === document.activeElement));
        for (const width of [320, 390, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Collections fit width ' + width);
            await page.screenshot({ path: path.join(output, 'collections-' + width + '.png'), fullPage: true });
        }
        assert.deepEqual(errors, []);
        console.log('Lobby collection search: separated terms, accents, status counts, category reset, Escape, focus and 320–1280px layouts passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
