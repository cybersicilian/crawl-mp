/* Actual atlas composition in UI portraits; no engine, accounts or saved data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const { fixtureHtml } = require('./render-benchmark.cjs');
const { nativeEquipment } = require('./helpers/native-monster-equipment.cjs');
const root = path.resolve(__dirname, '..'), output = process.env.PORTRAIT_DETAIL_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage({ viewport: { width: 1180, height: 1100 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.route('http://portrait.test/**', route => {
            const name = new URL(route.request().url()).pathname;
            return name === '/' ? route.fulfill({ contentType: 'text/html', body: fixtureHtml() })
                : route.fulfill({ path: path.join(root, name) });
        });
        await page.goto('http://portrait.test/');
        await page.evaluate(async () => {
            window.jQuery(document).trigger('game_init');
            const m = window.benchModules;
            m['texture-pack'].bindUser('PortraitDetail'); m['texture-pack'].select('illustrated');
            for (const symbol of ['MONS_RAT', 'MONS_ORC', 'MONS_GNOLL', 'MONS_GOBLIN', 'HAND1_SHORT_SWORD',
                'HAND2_KITE_SHIELD', 'HAND1_SPEAR', 'HAND1_MACE'])
                m['./tile-art-direction'].tile('player', m['./tileinfo-player'][symbol]);
            await Promise.all(Array.from(document.images).filter(image => image.getAttribute('src')).map(image => image.decode()));
        });
        await page.addStyleTag({ content: 'body{margin:0;background:#101916;color:#e1d8c0;font:16px/1.45 system-ui}'
            + '#game{display:none}main{max-width:1040px;padding:32px;margin:auto}h1{font:34px Georgia;color:#eed8a6}'
            + 'table{border-collapse:collapse;width:100%;background:#1b2823}td,th{padding:20px;border-bottom:1px solid #514d39;text-align:center}'
            + 'thead{color:#eed8a6}tbody th{text-align:left}.native-equipment-art{display:inline-block;width:96px;height:96px}'
            + '.native-equipment-art canvas{width:100%;height:100%}p{color:#abc0b1}' });
        const result = await page.evaluate(offsets => {
            const m = window.benchModules, pack = m['texture-pack'], painter = m['./native-tile-art'];
            const tiles = m['./tileinfo-player'], art = m['./tile-art-direction'];
            const native = new Map(offsets.map(entry => [entry.symbol, entry]));
            function check(value, message) { if (!value) throw new Error(message); }
            function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
            function pixels(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
            function equal(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
            function layer(symbol, offset = { x: 0, y: 0 }, ymax = 32) {
                const info = tiles.get_tile_info(tiles[symbol]);
                return { texture: 'player', sx: info.sx, sy: info.sy, w: info.ex - info.sx, h: info.ey - info.sy,
                    ox: info.ox + offset.x, oy: info.oy + offset.y, ymax };
            }
            const cases = [
                { label: 'Rat', parts: ['MONS_RAT'] }, { label: 'Orc', parts: ['MONS_ORC'] },
                { label: 'Orc with sword and shield', parts: ['MONS_ORC', 'HAND1_SHORT_SWORD', 'HAND2_KITE_SHIELD'] },
                { label: 'Gnoll with spear', parts: ['MONS_GNOLL', 'HAND1_SPEAR'] },
                { label: 'Goblin with mace', parts: ['MONS_GOBLIN', 'HAND1_MACE'] }
            ];
            const main = document.createElement('main'); document.body.prepend(main);
            main.innerHTML = '<h1>Detailed portraits, shared artwork</h1><p>Existing source art · native attachment geometry · controlled UI fixture</p>'
                + '<table><thead><tr><th>Portrait</th><th>Classic</th><th>Previous 32px composition</th><th>Detailed composition</th></tr></thead><tbody></tbody></table>';
            const entries = [];
            for (const entry of cases) {
                const offset = native.get(entry.parts[0]);
                const layers = entry.parts.map((part, index) => layer(part, index === 1 ? offset.weapon : index === 2 ? offset.shield : undefined));
                const metadata = { layers }, row = document.createElement('tr'), label = document.createElement('th');
                label.textContent = entry.label; row.append(label); main.querySelector('tbody').append(row);
                pack.select('classic'); const original = painter.create(metadata, entry.label);
                check(original.querySelector('canvas').width === 32, 'Classic keeps native backing');
                pack.select('illustrated');
                // Reproduce the previous path directly from the composed 32px atlas.
                const legacy = canvas(32), lc = legacy.getContext('2d'); lc.imageSmoothingEnabled = false;
                for (const item of layers) {
                    lc.save(); lc.beginPath(); lc.rect(0, 0, 32, item.ymax); lc.clip();
                    lc.drawImage(art.image('player', document.getElementById('player')), item.sx, item.sy, item.w, item.h,
                        item.ox, item.oy, item.w, item.h); lc.restore();
                }
                const detailed = painter.create(metadata, entry.label), drawn = detailed.querySelector('canvas');
                check(drawn.width === 128 && drawn.height === 128, 'Illustrated uses fourfold backing');
                check(detailed.getAttribute('aria-label') === entry.label && detailed.getAttribute('role') === 'img', 'accessible portrait identity');
                const reference = canvas(128), rc = reference.getContext('2d');
                for (let index = 0; index < layers.length; index++) {
                    const item = layers[index], source = art.tile('player', tiles[entry.parts[index]]);
                    check(source, 'authored reference source'); rc.save(); rc.beginPath(); rc.rect(0, 0, 128, item.ymax * 4); rc.clip();
                    rc.drawImage(source, item.ox * 4, item.oy * 4, item.w * 4, item.h * 4); rc.restore();
                }
                check(equal(pixels(drawn), pixels(reference)), 'portrait matches detailed sources at native offsets');
                const enlarged = canvas(128), ec = enlarged.getContext('2d'); ec.imageSmoothingEnabled = false; ec.drawImage(legacy, 0, 0, 128, 128);
                const old = pixels(enlarged), next = pixels(drawn); let changed = 0;
                for (let p = 0; p < next.length; p += 4) if ([0, 1, 2, 3].some(c => old[p + c] !== next[p + c])) changed++;
                check(changed > 100, 'portrait retains detail beyond a native upscale');
                pack.select('classic'); const classicAgain = painter.create(metadata, entry.label);
                check(equal(pixels(original.querySelector('canvas')), pixels(classicAgain.querySelector('canvas'))), 'Classic restores identical pixels');
                pack.select('illustrated');
                for (const element of [original.querySelector('canvas'), legacy, detailed]) {
                    const cell = document.createElement('td');
                    if (element !== detailed) { element.style.width = element.style.height = '96px'; element.style.imageRendering = 'pixelated'; }
                    cell.append(element); row.append(cell);
                }
                entries.push({ label: entry.label, backing: 128, changedDetailPixels: changed, exactLayerGeometry: true });
            }
            const clipped = { layers: [layer('MONS_ORC', undefined, 18), layer('HAND1_SHORT_SWORD', native.get('MONS_ORC').weapon, 18)] };
            const frame = painter.create(clipped, 'Clipped layers'), data = pixels(frame.querySelector('canvas'));
            check(data.slice(128 * 18 * 4 * 4).every(value => value === 0), 'native vertical clip applies at high resolution');
            const nativeOnly = painter.create({ layers: [layer('BASE_HUMAN')] }, 'Native fallback');
            check(nativeOnly.querySelector('canvas').width === 32, 'unauthored dolls retain native backing');
            const sheet = document.getElementById(m['./environment-art'].creatures.id); sheet.id += '_missing';
            const recoveredArt = { layers: [layer('MONS_RAT')] }, missing = painter.create(recoveredArt, 'Rat fallback');
            check(missing.querySelector('canvas').width === 32, 'missing optional sheet keeps native portrait');
            document.body.append(missing); sheet.id = m['./environment-art'].creatures.id;
            window.jQuery(document).trigger('art_materials_ready');
            check(missing.querySelector('canvas').width === 128, 'mounted portrait gains detail after sheet recovery');
            missing.remove();
            return { passed: true, entries, nativeClip: true, nativeFallback: true, lateSheetRecovery: true, classicIdentical: true };
        }, nativeEquipment(['MONS_ORC', 'MONS_GNOLL', 'MONS_GOBLIN']));
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ ...result, errors }, null, 2));
        await page.screenshot({ path: path.join(output, 'portrait-comparison.png'), fullPage: true });
        console.log(JSON.stringify(result));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
