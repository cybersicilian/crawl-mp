/* Shared pointer intent, legacy-title conversion, keyboard and cancellation. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><main id="normal">' +
            '<button id="rich" data-tip-title="Hit points" data-tip-body="Health explains how much damage a hero can take.">Health</button>' +
            '<button id="legacy" title="Native browser help">Inspect hero</button>' +
            '<button id="away" style="margin:100px">Away</button></main>' +
            '<div id="lobby_rich_tooltip" style="display:none"></div></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/materials.css',
            'static/tabletop/typography.css', 'static/styles/lobby-chronicle.css',
            'static/tabletop/properties.css', 'static/tabletop/tooltip-content.css',
            'static/tabletop/starting-sheet.css', 'game_data/static/styles/nested-tips.css']) {
            await page.addStyleTag({ path: path.join(root, file) });
        }
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.inGame = false;
            window.modules = { jquery: window.jQuery, comm: { send_message() {} } };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name])); };
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
            ['lobby', 'static/scripts/client-tooltips.js'],
            ['game', 'game_data/static/player-interactions.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.lobbyTips = window.modules.lobby({ in_game: () => window.inGame });
            window.lobbyTips.init_lobby_tooltips();
        });
        async function checkSurface(id) {
            const tip = page.locator(id);
            for (const selector of ['#rich', '#legacy']) {
                await page.locator('#away').hover();
                await page.locator(selector).hover();
                await page.waitForTimeout(150);
                assert.equal(await tip.isVisible(), false, selector + ' has a brief hover sleep');
                await tip.waitFor({ state: 'visible' });
                assert.equal(await page.locator(selector).getAttribute('title'), null, 'No second native bubble');
                await page.keyboard.press('Escape');
                assert.equal(await tip.isVisible(), false);
                await page.locator(selector).focus();
                assert(await tip.isVisible(), 'Keyboard focus bypasses the hover sleep');
                await page.locator('#away').focus();
                await page.locator(selector).hover();
                await page.locator('#away').hover();
                await page.waitForTimeout(450);
                assert.equal(await tip.isVisible(), false, 'Leaving cancels pending help');
                await page.locator(selector).hover();
                await page.keyboard.press('Escape');
                await page.waitForTimeout(450);
                assert.equal(await tip.isVisible(), false, 'Escape cancels pending help');
            }
        }
        await checkSurface('#lobby_rich_tooltip');
        await page.evaluate(() => { document.getElementById('legacy').title = 'Updated help after a state change'; });
        await page.waitForFunction(() => document.getElementById('legacy').dataset.tipBody === 'Updated help after a state change');
        await page.evaluate(() => {
            window.lobbyTips.hide_lobby_tooltip(); window.jQuery(document).off('.lobbytip');
            window.inGame = true; window.modules.game.init();
        });
        await checkSurface('#dcss_rich_tooltip');
        await page.evaluate(() => {
            const region = document.createElement('section');
            region.setAttribute('data-tip-inline', 'action_help');
            region.innerHTML = '<button id="inline_action" data-tip-title="Out of Bounds Tile" '
                + 'data-tip-body="Keep auto-explore out of this tile.">Mark tile</button>'
                + '<div id="action_help" tabindex="0" style="height:70px"></div>';
            document.getElementById('normal').appendChild(region);
        });
        const inline = page.locator('#inline_action');
        await inline.hover();
        assert.match(await page.locator('#action_help').innerText(), /Keep auto-explore/);
        await page.waitForTimeout(450);
        assert.equal(await page.locator('#dcss_rich_tooltip').isVisible(), false, 'Inline help never opens a hover card');
        assert.equal(await inline.getAttribute('aria-describedby'), 'action_help');
        await page.locator('#action_help').hover();
        assert.match(await page.locator('#action_help').innerText(), /Keep auto-explore/, 'Help stays readable off the action');
        await page.locator('#action_help').click();
        assert.match(await page.locator('#action_help').innerText(), /Keep auto-explore/, 'Reading and scrolling do not clear help');
        await inline.focus();
        assert.match(await page.locator('#action_help').innerText(), /Out of Bounds/);
        await page.keyboard.press('Escape');
        assert.equal(await inline.getAttribute('aria-describedby'), null);
        assert.equal(await page.locator('#action_help').innerText(), '');
        assert.deepEqual(errors, []);
        console.log('Lobby and game hover policy, inline action help, focus and dismissal passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
