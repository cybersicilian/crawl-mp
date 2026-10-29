const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real startup/resume/spectating, with map delivery held to expose the blank-view gap. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18997';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.LOADING_PROOF_DIR || '/tmp/dcss-loading-native/proof';
fs.mkdirSync(output, { recursive: true });

async function holdMaps(page) {
    await page.waitForFunction(() => window.require?.defined('comm') && window.require?.defined('loading-ui'));
    await page.evaluate(() => {
        const comm = require('comm'), original = comm.handle_message;
        window.qaHeldMaps = [];
        window.qaHoldingMaps = true;
        window.qaGameCommands = [];
        comm.register_send_listener(msg => {
            if (['key', 'input', 'click_cell'].includes(msg)) window.qaGameCommands.push(msg);
        });
        comm.handle_message = function (message) {
            if (message.msg === 'map' && window.qaHoldingMaps) {
                window.qaHeldMaps.push(message);
                return;
            }
            return original.apply(this, arguments);
        };
        window.qaReleaseMaps = () => {
            window.qaHoldingMaps = false;
            window.qaHeldMaps.splice(0).forEach(message => original(message));
        };
    });
}

async function verifyGap(page, name) {
    await page.waitForFunction(() => current_layer === 'normal' && window.qaHeldMaps.length > 0,
        null, { timeout: 120000 });
    assert(await page.locator('#loading_folio').isVisible(), 'Cover the native layout before map data');
    assert(await page.evaluate(() => require('game-loading').blocking()));
    assert(await page.locator('#game').evaluate(game => game.inert));
    assert.equal(await page.locator('#game').getAttribute('aria-busy'), 'true');
    await page.keyboard.press('l');
    assert.deepEqual(await page.evaluate(() => window.qaGameCommands), [], 'Loading keys never enter the game');
    assert(await page.locator('#loading_return').isVisible());
    await page.screenshot({ path: path.join(output, name + '-loading.png') });
    await page.evaluate(() => window.qaReleaseMaps());
    await page.locator('#loader').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length > 0);
    assert.equal(await page.locator('#game').evaluate(game => game.inert), false);
    assert.equal(await page.locator('#game').getAttribute('aria-busy'), 'false');
    await page.screenshot({ path: path.join(output, name + '-ready.png') });
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const errors = [], evidence = {};
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(url);
        const account = 'LoadingQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await holdMaps(page);
        await page.locator('#btn_launch_party_room').click();
        await verifyGap(page, 'new-expedition');
        const initial = await page.evaluate(() => structuredClone(window.crawl_party.state));
        evidence.heroes = initial.members.map(member => member.player_id);

        const spectator = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        spectator.on('pageerror', error => errors.push(error.message));
        await spectator.goto(url);
        await holdMaps(spectator);
        await spectator.evaluate(account => { location.hash = '#watch-' + account; }, account);
        await verifyGap(spectator, 'spectator');
        assert.deepEqual(await spectator.evaluate(() => window.crawl_party.state.members.map(member => member.player_id)), evidence.heroes);
        await spectator.close();

        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return name && require(name).ready();
        });
        // Use the existing save protocol; dock organization is outside this contract.
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        await page.locator('#lobby').waitFor({ state: 'visible' });
        await page.evaluate(() => { window.qaHoldingMaps = true; });
        await page.locator('#game_library_panel [data-library-load]').first().click();
        await verifyGap(page, 'resumed-expedition');
        const resumed = await page.evaluate(() => window.crawl_party.state);
        assert.deepEqual(resumed.members.map(member => member.player_id), evidence.heroes);
        assert.equal(resumed.world_aut_clock, initial.world_aut_clock, 'Loading never advances the game');
        assert.deepEqual(errors, []);
        evidence.startup = evidence.spectating = evidence.resume = true;
        evidence.browserErrors = errors;
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, output, ...evidence }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') });
        throw error;
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
