/* Native actor composition, real images, no engine or saved-game mutation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const { fixtureHtml } = require('./render-benchmark.cjs');
const root = path.resolve(__dirname, '..'), output = process.env.CREATURE_ART_PROOF_DIR;
const catalogKey = process.env.CREATURE_ART_CATALOG || 'creatures';
const checks = { creatures: './helpers/creature-art-checks.cjs', denizens: './helpers/creature-art-checks.cjs', lair: './helpers/creature-art-checks.cjs', hydras: './helpers/creature-art-checks.cjs', humanoids: './helpers/humanoid-art-checks.cjs', eliteHumanoids: './helpers/humanoid-art-checks.cjs',
    humanBases: './helpers/human-base-checks.cjs', hair: './helpers/hair-art-checks.cjs', armour: './helpers/armour-art-checks.cjs', equipment: './helpers/equipment-art-checks.cjs', shields: './helpers/equipment-art-checks.cjs',
    melee: './helpers/equipment-art-checks.cjs', weaponForms: './helpers/equipment-art-checks.cjs', ranged: './helpers/equipment-art-checks.cjs' };
const scenario = process.env.CREATURE_ART_SCENARIO || 'catalog';
assert(['catalog', 'large-detail'].includes(scenario));
const density = Number(process.env.CREATURE_ART_DPR || 1);
assert([1, 2, 3].includes(density));
assert(checks[catalogKey]);
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    let page;
    try {
        page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: density });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.route('http://creature.test/**', route => {
            const name = new URL(route.request().url()).pathname;
            if (name === '/') return route.fulfill({ contentType: 'text/html', body: fixtureHtml() });
            const file = path.join(root, name);
            if (!fs.existsSync(file)) { errors.push('Missing resource: ' + name); return route.fulfill({ status: 404, body: 'missing' }); }
            return route.fulfill({ path: file, contentType: name.endsWith('.png') ? 'image/png' : 'application/json' });
        });
        await page.goto('http://creature.test/');
        await page.evaluate(async key => {
            const m = window.benchModules, catalog = m['./environment-art'][key], sheet = document.getElementById(catalog.id);
            window.jQuery(document).trigger('game_init');
            if (sheet.getAttribute('src')) throw new Error('Classic downloaded creature artwork');
            const renderer = m['./dungeon_renderer'];
            renderer.set_ui_state(0); renderer.set_view_center(40, 30); renderer.fit_to(1100, 800, 17);
            await Promise.all(Array.from(document.images).filter(image => image.getAttribute('src')).map(image => image.decode()));
            const tiles = m['./tileinfo-player'], info = tiles.get_tile_info(tiles[catalog.entries[0].names[0]]);
            const rat = { layers: [{ texture: 'player', sx: info.sx, sy: info.sy, w: info.ex - info.sx,
                h: info.ey - info.sy, ox: info.ox, oy: info.oy, ymax: 32 }] };
            const frame = m['./native-tile-art'].create(rat, catalog.entries[0].label);
            document.getElementById('game').append(frame);
            window.creaturePortraitFixture = { frame, art: rat };
            m['texture-pack'].bindUser('CreatureFixture'); m['texture-pack'].select('illustrated');
            window.creaturePortraitFixture.before = Array.from(frame.querySelector('canvas').getContext('2d').getImageData(0, 0, 32, 32).data);
            m['visual-presentation'].select('classic');
            if (!sheet.getAttribute('src')) throw new Error('Illustrated did not activate creature artwork');
            // This comparison exercises every configured actor family. Request
            // those explicit sources; pack selection itself does not prefetch.
            m['./environment-sprites'].player.forEach(region => m['./tile-art-direction'].tile('player', region.tile));
            m['./tile-art-direction'].tile('floor', m['./tileinfo-dngn'].FLOOR_GREY_DIRT);
            await Promise.all(Array.from(document.images).filter(image => image.getAttribute('src')).map(image => image.decode()));
        }, catalogKey);
        await page.evaluate(key => { window.creatureCatalogKey = key; }, catalogKey);
        await page.addStyleTag({ content: 'body{background:#111615;color:#ded7c3;font:15px/1.5 system-ui;margin:0}'
            + '#game{display:none}main{padding:28px;max-width:1420px;margin:auto}h1{font:38px Georgia;color:#e5cf9d}'
            + 'table{width:100%;border-collapse:collapse;background:#1a211f}td,th{border-bottom:1px solid #70674e;padding:12px;text-align:center}'
            + 'thead{color:#e5cf9d}canvas{vertical-align:middle;image-rendering:auto}p{color:#a4baad}' });
        if (catalogKey === 'armour') {
            const source = fs.readFileSync(path.resolve(root, '../tileweb.cc'), 'utf8');
            const clip = /flags\[p\] == TILEP_FLAG_CUT_BOTTOM \? (\d+) : TILE_Y/.exec(source);
            assert(clip, 'Native doll clipping rule is required');
            await page.evaluate(value => { window.nativeArmourClip = value; }, Number(clip[1]));
        }
        if (['humanoids', 'eliteHumanoids', 'equipment', 'shields', 'melee', 'weaponForms', 'ranged'].includes(catalogKey)) {
            const bodyCatalog = checks[catalogKey] === './helpers/humanoid-art-checks.cjs' ? catalogKey : 'humanoids';
            const names = await page.evaluate(key => window.benchModules['./environment-art'][key].entries.map(entry => entry.names[0]), bodyCatalog);
            const nativeTables = require('./helpers/native-monster-equipment.cjs');
            const native = nativeTables.nativeEquipment(names), twoHanded = nativeTables.nativeForcedTwoHanded();
            await page.evaluate(offsets => { window.nativeEquipmentOffsets = offsets; }, native);
            await page.evaluate(symbols => { window.nativeTwoHandedSymbols = symbols; }, twoHanded);
        }
        const proof = await page.evaluate(require(scenario === 'large-detail' ? './helpers/sprite-resolution-checks.cjs' : checks[catalogKey]));
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ ...proof, errors }, null, 2));
        const name = catalogKey === 'creatures' ? 'creature' : catalogKey === 'humanoids' ? 'humanoid' : catalogKey;
        await page.screenshot({ path: path.join(output, name + '-comparison.png'), fullPage: true });
        console.log(JSON.stringify(proof));
    } catch (error) {
        const failure = { passed: false, error: error.stack || String(error) };
        if (page) {
            try { failure.humanBaseDiagnostics = await page.evaluate(() => window.humanBaseDiagnostics || null); }
            catch (diagnosticError) { failure.diagnosticError = String(diagnosticError); }
            try { failure.artDiagnostics = await page.evaluate(() => window.hairDiagnostics || null); }
            catch (diagnosticError) { failure.artDiagnosticError = String(diagnosticError); }
            try { await page.screenshot({ path: path.join(output, catalogKey + '-failed.png'), fullPage: true }); }
            catch (captureError) { failure.captureError = String(captureError); }
        }
        fs.writeFileSync(path.join(output, 'failed-validation.json'), JSON.stringify(failure, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
