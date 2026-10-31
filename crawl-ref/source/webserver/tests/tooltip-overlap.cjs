/* Real-browser placement and lifetime contracts, with actual game materials. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.TOOLTIP_PROOF_DIR || '/tmp/dcss-tooltip-overlap-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [], evidence = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent(`<!doctype html><html><head><style>
            body { margin: 0; background: #171410; color: white; font: 14px sans-serif; }
            #party_turn_banner { height: 48px; background: #29231b; }
            #right_column { position: fixed; right: 0; top: 48px; bottom: 140px; width: 260px; background: #29231b; }
            #dcss_quick_dock { position: fixed; bottom: 100px; left: 0; right: 260px; height: 40px; }
            #message_pane { position: fixed; bottom: 0; left: 0; right: 0; height: 100px; }
            #stat, #action { display: block; width: 230px; margin: 12px; padding: 8px; }
            #far { position: fixed; left: 20px; top: 180px; }
            .dcss-tip-body { white-space: pre-line; }
            @media (max-width: 500px) { #right_column { width: 160px; } #stat, #action { width: 130px; } }
            </style></head><body><main id="normal">
            <header id="party_turn_banner">Expedition · 4 heroes</header>
            <section id="right_column"><button id="stat" data-tip-title="Fire resistance" data-tip-body="Fire resistance reduces damage. Poisoned heroes can resist poison with rPois.">Fire resistance +</button>
            <button id="action">Inspect hero</button></section>
            <button id="far">Dungeon action</button><nav id="dcss_quick_dock">Inventory · Spells · Explore · Rest</nav>
            <section id="message_pane">The hero is poisoned.</section>
            <div id="tooltip" style="display:none"></div></main></body></html>`);
        for (const file of ['static/tabletop/tokens.css', 'game_data/static/styles/game-coop.css',
            'static/tabletop/materials.css', 'static/tabletop/typography.css',
            'static/tabletop/properties.css', 'static/tabletop/tooltip-content.css', 'game_data/static/styles/nested-tips.css'])
            await page.addStyleTag({ path: path.join(root, file) });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery, comm: { send_message() {} } };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name])); };
            document.getElementById('action').onclick = () => { window.actionClicks = (window.actionClicks || 0) + 1; };
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
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => window.modules.interactions.init());
        const tip = page.locator('#dcss_rich_tooltip');
        async function check(label) {
            const state = await page.evaluate(() => {
                const overlap = window.modules['tooltip-layout'].overlap;
                const cards = [...document.querySelectorAll('#dcss_rich_tooltip, #tooltip, .dcss-nested-tip')]
                    .filter(node => getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden');
                const bounds = cards.map(node => node.getBoundingClientRect());
                return { cards: cards.map(node => node.textContent.slice(0, 65)),
                    within: bounds.every(r => r.left >= 7 && r.top >= 7 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7),
                    overlaps: bounds.some((r, i) => bounds.some((other, j) => j > i && overlap(r, other) > 0)),
                    hudOverlap: bounds.some(r => ['right_column', 'party_turn_banner', 'dcss_quick_dock', 'message_pane']
                        .some(id => overlap(r, document.getElementById(id).getBoundingClientRect()) > 0)) };
            });
            evidence.push({ label, ...state });
            assert(state.within, label + ': fit viewport');
            assert.equal(state.overlaps, false, label + ': visible cards never overlap');
            return state;
        }
        for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [420, 700], [320, 240]]) {
            await page.setViewportSize({ width, height });
            await page.mouse.move(2, 2);
            await page.locator('#stat').hover();
            await tip.waitFor({ state: 'visible' });
            const state = await check(width + ' root');
            if (width >= 1024) assert.equal(state.hudOverlap, false, 'Desktop help keeps HUD regions clear');
            const anchorOverlap = await page.evaluate(() => window.modules['tooltip-layout'].overlap(
                document.getElementById('stat').getBoundingClientRect(), document.getElementById('dcss_rich_tooltip').getBoundingClientRect()));
            if (anchorOverlap) console.log(await page.evaluate(() => ({ width: innerWidth,
                source: document.getElementById('stat').getBoundingClientRect().toJSON(),
                card: document.getElementById('dcss_rich_tooltip').getBoundingClientRect().toJSON(),
                maxHeight: getComputedStyle(document.getElementById('dcss_rich_tooltip')).maxHeight })));
            assert.equal(anchorOverlap, 0, width + ': root never covers the hovered control');
            await page.screenshot({ path: path.join(output, 'root-' + width + '.png') });
            await tip.locator('.dcss-term').first().hover();
            await page.locator('.dcss-nested-tip').first().waitFor({ state: 'visible' });
            await check(width + ' child');
            await page.screenshot({ path: path.join(output, 'nested-' + width + '.png') });
            const back = page.locator('.dcss-tip-back:visible').last();
            if (await back.count()) {
                await back.click();
                assert(await tip.isVisible(), 'Back restores the root explanation');
                assert.equal(await page.locator('.dcss-nested-tip').count(), 0);
            }
            await page.keyboard.press('Escape');
            assert.equal(await tip.getAttribute('aria-hidden'), 'true');
            assert.equal(await page.locator('.dcss-nested-tip').count(), 0);
        }

        await page.setViewportSize({ width: 1280, height: 800 });
        // Glancing across a control must not open help after leaving it.
        await page.locator('#stat').hover();
        await page.locator('#far').hover();
        await page.waitForTimeout(250);
        assert.equal(await tip.isVisible(), false);
        // Keyboard focus is immediate and dismissal allows the action in one click.
        await page.locator('#stat').focus();
        assert(await tip.isVisible());
        await page.locator('#action').click();
        assert.equal(await page.evaluate(() => window.actionClicks), 1);
        assert.equal(await tip.isVisible(), false);

        // A map root and a rich HUD root can never remain open together.
        await page.evaluate(() => {
            const nested = window.modules['./nested-tips'];
            const cell = document.getElementById('tooltip');
            window.cellHost = nested.host('cell-test', () => cell, () => {
                window.cellHost.hidden(); cell.style.display = 'none'; cell.setAttribute('aria-hidden', 'true');
            });
            cell.innerHTML = '<div class="dcss-tip-body">Dungeon creature</div>'; cell.style.display = 'block';
            window.cellHost.shown(null);
        });
        await page.locator('#stat').focus();
        assert.equal(await page.locator('#tooltip').isVisible(), false);
        await page.evaluate(() => {
            document.getElementById('tooltip').style.display = 'block'; window.cellHost.shown(null);
        });
        assert.equal(await tip.isVisible(), false);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#tooltip').isVisible(), false);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log('Tooltip overlap, constrained Back, HUD avoidance, one-click actions, focus and root dismissal passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
