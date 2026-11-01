/* Populated native presentation and atlas invariants, using a disposable QA server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const { observeNativePaint } = require('./helpers/native-art-observation.cjs');
const { observeNativeSprites } = require('./helpers/native-sprite-observation.cjs');
const { inspectNativeAtlases } = require('./helpers/native-atlas-inspection.cjs');
const url = process.env.WEBTILES_URL;
assert(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.ART_DIRECTION_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const launchOptions = chromiumLaunchOptions(process.env.ART_DIRECTION_BROWSER_CHANNEL);
    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(20000);
    const errors = [], requests = [], proof = { viewports: [], atlases: [], launchOptions };
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(png|css|js|svg)(\?|$)/.test(response.url())) errors.push(response.url());
    });
    const key = code => page.evaluate(code => require('comm').send_message('key', { keycode: code }), code);
    const shot = name => page.screenshot({ path: path.join(output, name + '.png') });
    async function selectPack(target, value) {
        const input = target.locator(`input[value='${value}']`);
        if (await input.isChecked()) return;
        await input.check();
        await target.waitForFunction(() => document.querySelector('.profile-save-status')?.textContent.startsWith('Saved'));
    }
    try {
        await page.goto(url);
        await page.route(/\/gamedata\/[^/]+\/game\.js(?:\?|$)/, async route => {
            // Controlled transport latency makes the real native loading state inspectable.
            await new Promise(resolve => setTimeout(resolve, 600)); await route.continue();
        });
        await signInTestAccount(page, 'ArtQA' + Date.now().toString(36), 'crawl');
        await page.waitForFunction(() => document.cookie.includes('login='));
        await page.goto(new URL('/profile', url).href);
        await selectPack(page, 'classic');
        await shot('profile-classic');
        await page.goto(url);
        await page.waitForFunction(() => document.querySelector('.welcome-entry')?.classList.contains('signed-in'));
        await page.locator('#lobby_home [data-lobby-create]').click();
        const names = ['Aster', 'Rowan', 'Kestrel', 'Morrow'];
        for (let index = 0; index < 4; index++) {
            const slot = page.locator(`.party-slot-box[data-slot='${index}']`);
            if (index) await slot.locator('[data-mode="companion"]').click();
            await slot.locator('.party-slot-species').selectOption(index === 1 ? 'Deep Elf' : 'Human');
            await slot.locator('.party-slot-job').selectOption(index === 1 ? 'Conjurer' : 'Fighter');
            await slot.locator('.party-slot-name').fill(names[index]);
            await slot.locator('.party-slot-name').press('Tab');
        }
        await page.locator('#btn_launch_party_room').click();
        await page.locator('#loader').waitFor({ state: 'visible' }); await shot('native-loading-with-controlled-latency');
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await page.locator('#loader').waitFor({ state: 'hidden' });
        await page.evaluate(() => document.fonts.ready);
        const clock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        proof.classicDeferred = await page.evaluate(() => Array.from(document.querySelectorAll('img[data-asset-optional]'))
            .map(sheet => ({ id: sheet.id, requested: Boolean(sheet.getAttribute('src')),
                url: new URL(sheet.dataset.src, location.href).href })));
        assert(proof.classicDeferred.length >= 13 && proof.classicDeferred.every(sheet => !sheet.requested),
            'Classic must not request any optional Illustrated sheets');
        proof.classicArtworkRequests = requests.filter(url => proof.classicDeferred.some(sheet => sheet.url === url));
        assert.deepEqual(proof.classicArtworkRequests, []);
        const profile = await page.context().newPage();
        await profile.goto(new URL('/profile', url).href);
        await selectPack(profile, 'illustrated');
        await page.waitForFunction(() => require('texture-pack').current() === 'illustrated');
        // Repaint the native scene to request its used families, then wait only for those requests.
        await page.evaluate(observeNativeSprites);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('img[data-asset-optional]'))
            .every(sheet => !sheet.getAttribute('src') || sheet.complete));
        proof.nativeSprites = await page.evaluate(observeNativeSprites);
        assert(proof.nativeSprites.entries.length > 0, 'The live game must draw authored sprite sources');
        assert.equal(proof.nativeSprites.pendingTileCalls, 0, 'Used sprite families must finish loading');
        for (const entry of proof.nativeSprites.entries) {
            assert(entry.draws > 0 && entry.sourceWidth === entry.nativeWidth * 4
                && entry.sourceHeight === entry.nativeHeight * 4, JSON.stringify(entry));
        }
        const inspected = await page.evaluate(inspectNativeAtlases);
        proof.atlases = inspected.atlases; proof.optionalArtwork = inspected.optional;
        for (const atlas of proof.atlases) {
            assert.equal(atlas.width, atlas.nativeWidth); assert.equal(atlas.height, atlas.nativeHeight);
            assert(atlas.cached && atlas.alpha && atlas.changed > 0 && atlas.nativeSourceImmutable, JSON.stringify(atlas));
        }
        const unused = proof.optionalArtwork.filter(sheet => !sheet.requested);
        assert(unused.length > 0, 'Native acceptance must preserve on-demand loading for unused families');
        proof.nativePaint = await page.evaluate(observeNativePaint);
        fs.writeFileSync(path.join(output, 'native-paint.json'), JSON.stringify(proof.nativePaint, null, 2));
        assert(proof.nativePaint.visibleMaterialCells.floor + proof.nativePaint.visibleMaterialCells.wall > 0,
            'Capture a native scene containing configured painted terrain');
        assert(proof.nativePaint.materialDraws.floor + proof.nativePaint.materialDraws.wall > 0,
            'The live dungeon must draw the painted atlas, not only load the adapter');
        assert(proof.nativePaint.borderCallsWithNativeCoordinates > 0,
            'Native background painting must pass world coordinates to the connected border adapter');
        assert(proof.nativePaint.connectedBorderRectangles > 0,
            'Capture a representative visible wall/floor boundary before accepting the connected tileset');
        assert(proof.nativePaint.observerRestored);
        assert(proof.nativePaint.worldSurfaceDraws > 0 && proof.nativePaint.surfaceCallsWithNativeCoordinates > 0,
            'The real dungeon must draw world-anchored ground using native coordinates');
        for (const [width, height] of [[1440, 1000], [1280, 800], [390, 800], [320, 800], [768, 360]]) {
            await page.setViewportSize({ width, height });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const geometry = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth,
                transform: getComputedStyle(document.getElementById('dungeon')).transform,
                cards: document.querySelectorAll('.party-member-card').length,
                material: getComputedStyle(document.getElementById('normal')).getPropertyValue('--hud-surface').trim(),
                renderTimes: window.render_times || [] }));
            assert(geometry.document <= width + 1); assert.equal(geometry.transform, 'none'); assert.equal(geometry.cards, 4);
            proof.viewports.push({ width, height, ...geometry }); await shot(`dungeon-${width}-${height}`);
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator(".party-member-card[data-party-slot='1'] .party-control-btn").click();
        await page.waitForFunction(() => window.crawl_party.state.controlled_slot === 1);
        await shot('controlled-mage');
        await key(105); await page.locator('.menu_inventory').waitFor(); await shot('native-gear');
        await key(27); await page.waitForFunction(() => !document.querySelector('#ui-stack > *'));
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock, 'Reading and control changes remain zero-turn');
        await selectPack(profile, 'classic');
        await page.waitForFunction(() => require('texture-pack').current() === 'classic');
        proof.classicOriginalAtlases = await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(value => value.endsWith('/tile-art-direction'));
            const art = require(name);
            return ['floor', 'wall', 'feat', 'main', 'player', 'icons', 'gui'].every(id =>
                art.image(id, document.getElementById(id)) === document.getElementById(id));
        });
        assert(proof.classicOriginalAtlases); await shot('native-classic-texture-pack');
        await selectPack(profile, 'illustrated');
        await page.waitForFunction(() => require('texture-pack').current() === 'illustrated');
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock, 'Texture packs are zero-turn profile changes');
        await shot('native-illustrated-texture-pack'); await profile.close();
        await page.emulateMedia({ reducedMotion: 'reduce' }); await shot('reduced-motion');
        await page.evaluate(() => window.socket.close(1000, 'Disposable visual QA'));
        await page.locator('#connection_status').waitFor({ state: 'visible' }); await shot('connection-interrupted');
        assert.deepEqual(errors, []); proof.errors = errors; proof.success = true;
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(proof, null, 2));
        console.log(JSON.stringify({ success: true, atlases: proof.atlases.length, viewports: proof.viewports.length,
            nativeHeroes: 4, nativeControlAndInventory: true, nativePaint: proof.nativePaint, errors }));
    } catch (error) {
        await shot('failure'); fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText()); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
