/* Offline loading/recovery contract: no WebTiles server or native game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = process.env.LOADING_PROOF_DIR || '/tmp/dcss-loading-proof';
fs.mkdirSync(output, { recursive: true });
const fixture = `<!doctype html><html><head><title>Loading fixture</title></head><body>
    <div id="loader" style="display:none"><div id="loader_center">
        <span id="loader_text">Loading...</span><br>
        <img id="native_title" style="display:none" loading="lazy" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
    </div><div id="stale_processes_message" class="floating_dialog" style="display:none">Existing process recovery</div>
    <div id="force_terminate" class="floating_dialog" style="display:none">Force termination?
        <button id="force_terminate_no">No</button><button id="force_terminate_yes">Yes</button>
    </div></div>
    <div id="game"><div id="normal"><button id="game_action">Move</button></div></div>
    <div id="prompt" style="display:none"><div><div id="prompt_title">Sign in to continue</div>
        <input id="native_username" aria-label="Adventurer name"><button>Sign in</button>
    </div></div></body></html>`;

async function mount(page, url) {
    let documents = 0;
    const engineCommands = [];
    await page.exposeFunction('qaRecordEngineCommand', key => engineCommands.push(key));
    await page.route('https://loading.qa.invalid/**', async route => {
        const requestURL = new URL(route.request().url());
        if (requestURL.pathname.endsWith('/dungeon-threshold.png'))
            return route.fulfill({ path: path.join(root, 'static/tabletop/assets/dungeon-threshold.png'), contentType: 'image/png' });
        if (route.request().isNavigationRequest()) {
            documents++;
            return route.fulfill({ contentType: 'text/html', body: fixture });
        }
        return route.abort();
    });
    await page.goto(url);
    await page.clock.install({ time: new Date('2026-10-16T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-16T00:01:00Z'));
    await page.addStyleTag({ path: path.join(root, 'static/styles/lobby-base.css') });
    await page.addStyleTag({ path: path.join(root, 'static/styles/lobby-shell.css') });
    await page.addStyleTag({ path: path.join(root, 'static/tabletop/tokens.css') });
    await page.addStyleTag({ path: path.join(root, 'static/tabletop/typography.css') });
    // addStyleTag CSS has no stylesheet URL; use an explicit local route for its art.
    const loadingCSS = fs.readFileSync(path.join(root, 'static/tabletop/loading.css'), 'utf8')
        .replace('url("assets/dungeon-threshold.png")', 'url("/static/tabletop/assets/dungeon-threshold.png")');
    await page.addStyleTag({ content: loadingCSS });
    await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
    await page.evaluate(() => {
        window.qaNativeNodes = Object.fromEntries(['loader', 'loader_center', 'loader_text', 'native_title',
            'prompt', 'stale_processes_message', 'force_terminate', 'force_terminate_no', 'force_terminate_yes']
            .map(id => [id, document.getElementById(id)]));
        window.qaEngineCommands = [];
        document.addEventListener('keydown', event => {
            window.qaEngineCommands.push(event.key);
            window.qaRecordEngineCommand(event.key);
        });
        window.define = (dependencies, factory) => {
            if (!dependencies.length) window.qaReadiness = factory();
            else window.qaLoading = factory(window.qaReadiness);
        };
    });
    await page.addScriptTag({ path: path.join(root, 'static/scripts/game-loading.js') });
    await page.addScriptTag({ path: path.join(root, 'static/scripts/loading-ui.js') });
    await page.evaluate(() => window.jQuery(document).off());
    return { documents: () => documents, engineCommands };
}

async function show(page, id, display) {
    await page.evaluate(({ id, display }) => { document.getElementById(id).style.display = display; }, { id, display });
}

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        const state = await mount(page, 'https://loading.qa.invalid/webtiles/?load=old-save&ticket=qa#watch-FolioQA');
        assert.equal(await page.locator('#loading_folio').isVisible(), false);
        // The native layout hides #loader before the map/player updates arrive.
        // Keep it above the measurable game layout until every real signal exists.
        for (const last of ['assets', 'player', 'map']) {
            await page.evaluate(() => { window.qaReadiness.begin(); window.qaReadiness.setLayer('normal'); });
            await page.locator('#loading_folio').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#game').getAttribute('aria-busy'), 'true');
            assert(await page.locator('#game').evaluate(game => game.inert));
            assert(await page.locator('#game_action').evaluate(button => button.getBoundingClientRect().width > 0),
                'Game layout can measure underneath the loading screen');
            const missing = ['assets', 'player', 'map'].filter(key => key !== last);
            await page.evaluate(keys => keys.forEach(key => window.qaReadiness.mark(key)), missing);
            assert(await page.locator('#loading_folio').isVisible(), 'Never reveal a partially loaded view');
            if (last === 'map') await page.screenshot({ path: path.join(output, 'loading-before-dungeon.png') });
            await page.evaluate(key => window.qaReadiness.mark(key), last);
            await page.locator('#loading_folio').waitFor({ state: 'hidden' });
            assert.equal(await page.locator('#game').getAttribute('aria-busy'), 'false');
            assert.equal(await page.locator('#game').evaluate(game => game.inert), false);
        }
        await page.evaluate(() => {
            window.qaReadiness.begin(); window.qaReadiness.mark('assets');
            window.qaReadiness.setLayer('crt');
        });
        assert.equal(await page.locator('#loading_folio').isVisible(), false, 'Native text prompts remain accessible');
        assert.equal(await page.locator('#game').evaluate(game => game.inert), false);
        await page.evaluate(() => window.qaReadiness.setLayer('normal'));
        await page.locator('#loading_folio').waitFor({ state: 'visible' });
        await page.evaluate(() => window.qaReadiness.setPopupCount(1));
        assert.equal(await page.locator('#loading_folio').isVisible(), false, 'Native creation menus yield the loading cover');
        assert.equal(await page.locator('#game').evaluate(game => game.inert), false);
        await page.evaluate(() => window.qaReadiness.setPopupCount(0));
        await page.locator('#loading_folio').waitFor({ state: 'visible' });
        await page.evaluate(() => window.qaReadiness.setLayer('lobby'));
        await page.locator('#loading_folio').waitFor({ state: 'hidden' });
        await page.evaluate(() => { window.qaReadiness.begin(); window.qaReadiness.cancel(); });
        assert.equal(await page.locator('#loading_folio').isVisible(), false, 'Cleanup/connection errors release the cover');
        await show(page, 'loader', 'table');
        await page.locator('#loading_folio').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#loader_text').innerText(), 'Preparing your expedition…');
        assert.equal(await page.locator('#loader_text').getAttribute('aria-live'), 'polite');
        assert.equal(await page.locator('#loading_return').getAttribute('href'), 'https://loading.qa.invalid/webtiles/');
        assert.equal(await page.locator('#loader img').count(), 1, 'The native title image collection stays intact');
        assert.equal(await page.locator('#native_title').isVisible(), false);
        await page.clock.runFor(11999);
        assert(!(await page.locator('#loader_text').innerText()).includes('Still'));
        await page.clock.runFor(2);
        assert.equal(await page.locator('#loader_text').innerText(), 'Still preparing your expedition.');
        assert((await page.locator('.loading-folio-detail').innerText()).includes('keep waiting'));
        await page.screenshot({ path: path.join(output, 'loading-desktop.png') });

        await show(page, 'loader', 'none');
        await page.clock.runFor(20000);
        assert.equal(await page.locator('#loader_text').textContent(), 'Preparing your expedition…');
        await show(page, 'loader', 'table');
        await page.clock.runFor(6000);
        await show(page, 'loader', 'none');
        await show(page, 'loader', 'table');
        await page.clock.runFor(6001);
        assert.equal(await page.locator('#loader_text').innerText(), 'Preparing your expedition…', 'A new load gets a fresh twelve seconds');
        await page.clock.runFor(6000);
        assert((await page.locator('#loader_text').innerText()).includes('Still preparing'));

        await page.evaluate(() => {
            window.qaReadiness.begin(); window.qaReadiness.setLayer('normal');
            window.qaReadiness.fail('Return to the party hall and resume your expedition to try again.');
        });
        assert(await page.locator('#loading_return').isVisible());
        assert.equal(await page.locator('#loader_text').innerText(), 'The dungeon view is unavailable.');
        assert.equal(await page.locator('#game').getAttribute('aria-busy'), 'true');
        await page.evaluate(() => window.qaReadiness.begin());
        assert.equal(await page.locator('#loader_text').innerText(), 'Preparing your expedition…');
        await page.evaluate(() => window.qaReadiness.cancel());

        // Native sign-in and process confirmation keep their own visibility,
        // controls, and keyboard routing. The new card yields to every prompt.
        await show(page, 'loader_text', 'none');
        assert(await page.locator('#loading_return').isVisible(), 'A hidden status alone must not remove explicit recovery');
        await show(page, 'prompt', 'block');
        await page.locator('#loading_folio').waitFor({ state: 'hidden' });
        assert(await page.locator('#native_username').isVisible());
        assert.equal(await page.locator('#loading_return').isVisible(), false, 'The native sign-in prompt keeps exclusive controls');
        await page.clock.runFor(20000);
        await page.screenshot({ path: path.join(output, 'loading-native-prompt.png') });
        await show(page, 'prompt', 'none');
        await show(page, 'loader_text', 'block');
        await page.locator('#loading_folio').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#loader_text').innerText(), 'Preparing your expedition…');
        for (const id of ['stale_processes_message', 'force_terminate']) {
            await show(page, id, 'block');
            await page.locator('#loading_folio').waitFor({ state: 'hidden' });
            assert(await page.locator('#' + id).isVisible());
            assert.equal(await page.locator('#loading_return').isVisible(), false, 'Recovery must not overlap native process confirmation');
            if (id === 'force_terminate') {
                assert(await page.locator('#force_terminate_yes').isVisible());
                assert(await page.locator('#force_terminate_no').isVisible());
            }
            await show(page, id, 'none');
            await page.locator('#loading_folio').waitFor({ state: 'visible' });
            assert(await page.locator('#loading_return').isVisible());
        }
        assert(await page.evaluate(() => Object.entries(window.qaNativeNodes)
            .every(([id, node]) => node === document.getElementById(id))), 'Every native loader and confirmation node keeps its identity');
        await page.setViewportSize({ width: 390, height: 680 });
        await page.screenshot({ path: path.join(output, 'loading-mobile.png') });
        const box = await page.locator('#loading_folio').boundingBox();
        assert(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 680);
        await page.locator('#loading_return').focus();
        const documentsBeforeRecovery = state.documents();
        await Promise.all([page.waitForEvent('domcontentloaded'), page.keyboard.press('Enter')]);
        assert.equal(page.url(), 'https://loading.qa.invalid/webtiles/');
        assert.equal(state.documents(), documentsBeforeRecovery + 1, 'Recovery must reload the network document, even for fragment changes');
        assert.deepEqual(state.engineCommands, [], 'Keyboard recovery never reaches a dungeon key handler');
        assert.deepEqual(errors, []);

        // The most fragile case has no load query: replacing a hash must still
        // cause a real reload rather than leave an inhibited message queue.
        const fragmentPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const fragmentState = await mount(fragmentPage, 'https://loading.qa.invalid/#play-crawl');
        await show(fragmentPage, 'loader', 'table');
        await fragmentPage.locator('#loading_return').waitFor({ state: 'visible' });
        assert.deepEqual(await fragmentPage.evaluate(() => window.qaEngineCommands), []);
        const fragmentBeforeRecovery = fragmentState.documents();
        await Promise.all([fragmentPage.waitForEvent('domcontentloaded'), fragmentPage.locator('#loading_return').click()]);
        assert.equal(fragmentPage.url(), 'https://loading.qa.invalid/');
        assert.equal(fragmentState.documents(), fragmentBeforeRecovery + 1);
        assert.deepEqual(fragmentState.engineCommands, []);
        console.log(JSON.stringify({ success: true, output, recoveryNetworkReloads: 2,
            nativeNodesPreserved: true, promptPrecedence: true, engineCommands: 0 }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
