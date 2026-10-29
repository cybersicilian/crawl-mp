/* Populated native presentation and atlas invariants, using a disposable QA server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const { observeNativePaint } = require('./helpers/native-art-observation.cjs');
const url = process.env.WEBTILES_URL;
assert(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.ART_DIRECTION_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const launchOptions = chromiumLaunchOptions(process.env.ART_DIRECTION_BROWSER_CHANNEL);
    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(20000);
    const errors = [], proof = { viewports: [], atlases: [], launchOptions };
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(png|css|js|svg)(\?|$)/.test(response.url())) errors.push(response.url());
    });
    const key = code => page.evaluate(code => require('comm').send_message('key', { keycode: code }), code);
    const shot = name => page.screenshot({ path: path.join(output, name + '.png') });
    try {
        await page.goto(url);
        await page.route(/\/gamedata\/[^/]+\/game\.js(?:\?|$)/, async route => {
            // Controlled transport latency makes the real native loading state inspectable.
            await new Promise(resolve => setTimeout(resolve, 600)); await route.continue();
        });
        await signInTestAccount(page, 'ArtQA' + Date.now().toString(36), 'crawl');
        await page.waitForFunction(() => document.cookie.includes('login='));
        await page.goto(new URL('/profile', url).href);
        await page.locator("input[value='illustrated']").check();
        await page.waitForFunction(() => document.querySelector('.profile-save-status')?.textContent.startsWith('Saved'));
        await shot('profile-illustrated');
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
        proof.atlases = await page.evaluate(() => {
            const module = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/tile-art-direction'));
            if (!module) throw new Error('Tile art adapter did not load through the real renderer');
            const art = require(module), results = [];
            const spriteModule = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/environment-sprites'));
            if (!spriteModule) throw new Error('Environment sprite adapter did not load');
            const treeRegions = require(spriteModule).feat;
            const sheet = document.getElementById('illustrated_woodland');
            if (!sheet || sheet.naturalWidth !== 1448 || sheet.naturalHeight !== 1086)
                throw new Error('Environment sprite sheet did not load at its declared geometry');
            for (const id of ['floor', 'wall', 'feat', 'main', 'player']) {
                const source = document.getElementById(id), start = performance.now();
                const graded = art.image(id, source);
                let cached = true;
                for (let n = 0; n < 1000; n++) cached = cached && art.image(id, source) === graded;
                const elapsed = performance.now() - start;
                const raw = document.createElement('canvas'); raw.width = source.naturalWidth; raw.height = source.naturalHeight;
                const ctx = raw.getContext('2d'); ctx.drawImage(source, 0, 0);
                const original = ctx.getImageData(0, 0, raw.width, raw.height).data;
                const styled = graded.getContext('2d').getImageData(0, 0, graded.width, graded.height).data;
                const replaced = new Uint8Array(raw.width * raw.height);
                if (id === 'feat') for (const region of treeRegions) for (let y = region.y; y < region.y + region.h; y++)
                    replaced.fill(1, y * raw.width + region.x, y * raw.width + region.x + region.w);
                let alpha = true, changed = 0, samples = 0, spriteAlphaChanges = 0;
                for (let i = 3; i < original.length; i += 4) {
                    samples++;
                    const difference = Math.abs(original[i] - styled[i]);
                    if (replaced[(i - 3) / 4]) { if (difference > 1) spriteAlphaChanges++; }
                    else alpha = alpha && difference <= 1;
                    if (original[i] && (original[i - 1] !== styled[i - 1] || original[i - 2] !== styled[i - 2]
                        || original[i - 3] !== styled[i - 3])) changed++;
                }
                results.push({ id, width: graded.width, height: graded.height, nativeWidth: source.naturalWidth,
                    nativeHeight: source.naturalHeight, cached, elapsed, alpha, changed, samples, spriteAlphaChanges });
            }
            for (const id of ['icons', 'gui']) if (art.image(id, document.getElementById(id)) !== document.getElementById(id))
                throw new Error('Semantic icon atlas must retain original pixels');
            return results;
        });
        for (const atlas of proof.atlases) {
            assert.equal(atlas.width, atlas.nativeWidth); assert.equal(atlas.height, atlas.nativeHeight);
            assert(atlas.cached && atlas.alpha && atlas.changed > 0, JSON.stringify(atlas));
            if (atlas.id === 'feat') assert(atlas.spriteAlphaChanges > 0, 'New tree silhouettes must actually reach the atlas');
        }
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
        const profile = await page.context().newPage();
        await profile.goto(new URL('/profile', url).href);
        await profile.locator("input[value='classic']").check();
        await profile.waitForFunction(() => document.querySelector('.profile-save-status')?.textContent.startsWith('Saved'));
        await page.waitForFunction(() => require('texture-pack').current() === 'classic');
        proof.classicOriginalAtlases = await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(value => value.endsWith('/tile-art-direction'));
            const art = require(name);
            return ['floor', 'wall', 'feat', 'main', 'player', 'icons', 'gui'].every(id =>
                art.image(id, document.getElementById(id)) === document.getElementById(id));
        });
        assert(proof.classicOriginalAtlases); await shot('native-classic-texture-pack');
        await profile.locator("input[value='illustrated']").check();
        await profile.waitForFunction(() => document.querySelector('.profile-save-status')?.textContent.startsWith('Saved'));
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
