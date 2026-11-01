/* Controlled real-renderer check of native QA probes; no engine, account or live world. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixtureHtml } = require('./render-benchmark.cjs');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const { observeNativeSprites } = require('./helpers/native-sprite-observation.cjs');
const { inspectNativeAtlases } = require('./helpers/native-atlas-inspection.cjs');
const root = path.resolve(__dirname, '..'), output = process.env.ENVIRONMENT_ART_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, deviceScaleFactor: 2 });
    const errors = [], artworkRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/tabletop/assets/')) artworkRequests.push(request.url()); });
    try {
        await page.route('http://art-probes.test/**', route => {
            const name = new URL(route.request().url()).pathname;
            if (name === '/') return route.fulfill({ contentType: 'text/html', body: fixtureHtml().replace(
                /<img id="(illustrated_[^"]+)" (?:data-)?src=/g, '<img data-asset-optional id="$1" data-src=') });
            const file = path.join(root, name);
            if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Unknown asset' });
            return route.fulfill({ contentType: file.endsWith('.png') ? 'image/png' : 'application/json', path: file });
        });
        await page.goto('http://art-probes.test/');
        await page.evaluate(async () => {
            await Promise.all(Array.from(document.images).filter(image => image.getAttribute('src')).map(image => image.decode()));
            const m = window.benchModules, r = m['./dungeon_renderer'], tiles = m['./tileinfo-dngn'], p = m['./tileinfo-player'];
            const registry = Object.fromEntries(Object.entries(m).map(([key, value]) => ['fixture/' + key.replace(/^\.\//, ''), value]));
            window.require = name => registry[name]; window.require.s = { contexts: { _: { defined: registry } } };
            window.jQuery(document).trigger('game_init');
            m['texture-pack'].bindUser('NativeArtProbeFixture'); m['texture-pack'].select('classic');
            r.set_ui_state(0); r.set_view_center(10, 10); r.fit_to(900, 700, 17);
            const cells = [];
            for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) cells.push({ x, y,
                mf: m['./enums'].MF_FLOOR, t: { bg: tiles.FLOOR_GREY_DIRT, flv: { f: tiles.FLOOR_GREY_DIRT, s: 0 } } });
            const at = (x, y) => cells.find(cell => cell.x === x && cell.y === y);
            at(9, 10).t.bg = tiles.DNGN_RUNED_DOOR;
            Object.assign(at(10, 10).t, { fg: p.MONS_ORC,
                doll: [[p.MONS_ORC, 32], [p.HAND1_MACE, 32], [p.HAND2_KITE_SHIELD, 32]] });
            Object.assign(at(11, 10).t, { fg: p.MONS_RAT, doll: [[p.MONS_RAT, 32]] });
            m['./map_knowledge'].merge(cells); r.render_view();
        });
        const classic = await page.evaluate(observeNativeSprites);
        assert.equal(classic.entries.length, 0); assert.deepEqual(artworkRequests, []);
        await page.evaluate(() => window.benchModules['texture-pack'].select('illustrated'));
        await page.evaluate(observeNativeSprites);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('img[data-asset-optional]'))
            .every(sheet => !sheet.getAttribute('src') || sheet.complete), undefined, { polling: 50 });
        const sprites = await page.evaluate(observeNativeSprites), inspected = await page.evaluate(inspectNativeAtlases);
        const used = new Set(sprites.entries.map(entry => entry.sheet));
        for (const sheet of ['illustrated_thresholds', 'illustrated_humanoids', 'illustrated_equipment', 'illustrated_beasts'])
            assert(used.has(sheet), 'Actual renderer did not draw ' + sheet);
        assert.equal(sprites.pendingTileCalls, 0);
        for (const entry of sprites.entries) assert(entry.draws > 0 && entry.sourceWidth === entry.nativeWidth * 4
            && entry.sourceHeight === entry.nativeHeight * 4);
        for (const atlas of inspected.atlases) assert(atlas.alpha && atlas.cached && atlas.nativeSourceImmutable);
        const unused = inspected.optional.filter(sheet => !sheet.requested).map(sheet => sheet.id);
        assert(unused.includes('illustrated_woodland') && unused.includes('illustrated_ranged'));
        // An unloaded family's rectangle must not exempt an unrelated alpha mutation.
        await page.evaluate(() => {
            const m = window.benchModules, art = m['./tile-art-direction'], original = art.image;
            window.restoreProbeArt = () => { art.image = original; };
            art.image = function (id, raw) {
                const source = original.apply(this, arguments); if (id !== 'feat') return source;
                const r = m['./environment-sprites'].feat[0], c = document.createElement('canvas');
                c.width = source.width; c.height = source.height;
                const ctx = c.getContext('2d'); ctx.drawImage(source, 0, 0);
                const pixel = ctx.getImageData(r.x, r.y, 1, 1); pixel.data[3] = 255 - pixel.data[3];
                ctx.putImageData(pixel, r.x, r.y); return c;
            };
        });
        let corrupted;
        try { corrupted = await page.evaluate(inspectNativeAtlases); }
        finally { await page.evaluate(() => window.restoreProbeArt()); }
        assert.equal(corrupted.atlases.find(atlas => atlas.id === 'feat').alpha, false);
        await page.screenshot({ path: path.join(output, 'controlled-renderer.png') });
        assert.deepEqual(errors, []);
        const proof = { passed: true, nativeEngine: false, classicArtworkRequests: [], sprites, inspected,
            unused, rejectsAlphaChangesInUnloadedFamily: true, errors };
        fs.writeFileSync(path.join(output, 'probe-validation.json'), JSON.stringify(proof, null, 2));
        console.log(JSON.stringify(proof));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
