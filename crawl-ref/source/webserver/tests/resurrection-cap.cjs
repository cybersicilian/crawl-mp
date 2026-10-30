const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent('<!doctype html><html><body><div id="party_hud_members"><div class="party-card" data-party-slot="0">'
            + '<div class="party-member-meta"></div><div class="party-member-equipment"></div></div></div></body></html>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const frame = fn => { const callback = () => fn(); callback.cancel = () => {}; return callback; };
            window.modules = { jquery: window.jQuery, './frame-update': frame,
                './status-icons': { icon: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
                './native-tile-art': { create: (art, label, css, fallback) => fallback },
                './party-faith': {}, './portrait-status': {}, 'item-properties': {} };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
        });
        for (const name of ['party-status-model', 'party-card-status', 'party-card-readings']) {
            await page.evaluate(name => { window.moduleName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        const render = hero => page.evaluate(hero => {
            window.crawl_party = { state: { multiplayer: true, members: [hero] } };
            const card = window.jQuery('.party-card');
            card.children('.party-member-state').remove();
            card.append(window.modules['./party-card-status'].activity(hero, window.crawl_party.state));
            window.modules['./party-card-readings'].mount();
        }, hero);
        const hero = { slot: 0, name: 'Moss', species: 'Human', job: 'Fighter', alive: true,
            xl: 26, xl_cap: 26, xl_next: 0, statuses: [], resists: {} };
        await render(hero);
        const bar = page.getByRole('progressbar');
        assert.equal(await bar.getAttribute('data-progress-state'), 'capped');
        assert.equal(await bar.getAttribute('aria-valuenow'), '100');
        assert.match(await bar.getAttribute('data-tip-body'), /Maximum level: 26/);
        assert.equal(await page.locator('[data-reading="level"] .party-reading-value').innerText(), '26/26');
        await render({ ...hero, xl: 5, xl_cap: 25, xl_next: 34 });
        assert.equal(await bar.getAttribute('data-progress-state'), 'known');
        assert.equal(await bar.getAttribute('aria-valuenow'), '34');
        assert.equal(await page.locator('[data-reading="level"] .party-reading-value').innerText(), '5/25');
        assert.deepEqual(errors, []);
        if (process.env.LEVEL_CAP_SCREENSHOT)
            await page.screenshot({ path: process.env.LEVEL_CAP_SCREENSHOT });
        console.log('Reduced level caps render in card metadata, accessible progress and live tooltips.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
