/* Actual native atlas/texture rendering, controlled comparison; no native game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.TERRAIN_MATERIALS_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const launchOptions = chromiumLaunchOptions(process.env.ART_DIRECTION_BROWSER_CHANNEL);
    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('http://art.test/**', route => {
            const name = new URL(route.request().url()).pathname;
            if (name === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
            const known = /^\/atlas\/(floor|wall|feat|main|player|icons|gui)\.png$/.exec(name);
            const file = known ? path.join(root, 'game_data/static', known[1] + '.png')
                : name === '/static/tabletop/assets/painted-stone.png' ? path.join(root, name.slice(1)) : null;
            if (!file) { errors.push(name); return route.fulfill({ status: 404, body: 'Unknown resource' }); }
            return route.fulfill({ contentType: 'image/png', path: file });
        });
        await page.goto('http://art.test/');
        await page.setContent('<main><h1>The stone below</h1><p>Illustrated dark fantasy · native tile geometry</p>'
            + '<section><article><h2>Native materials</h2><canvas id="before"></canvas></article>'
            + '<article><h2>Painted expedition materials</h2><canvas id="after"></canvas></article></section>'
            + '<p>Stone · moss · masonry · liquids · doors · stairs · altar · creatures · clouds · targeting</p>'
            + '<footer>Controlled renderer comparison using real atlases and texture methods. Not a gameplay capture.</footer></main>'
            + '<div hidden>' + ['floor', 'wall', 'feat', 'main', 'player', 'icons', 'gui'].map(id =>
                `<img id="${id}" src="/atlas/${id}.png">`).join('')
            + '<img id="illustrated_materials" src="/static/tabletop/assets/painted-stone.png"></div>');
        await page.addStyleTag({ content: 'body{margin:0;background:#111615;color:#b2b5a4;font:14px/1.6 system-ui}'
            + 'main{max-width:1152px;margin:0 auto;padding:28px}h1{font:38px Georgia;color:#e2cea1;margin:0}'
            + 'p{margin:8px 0 20px}h2{font:20px Georgia;color:#eee7d6}section{display:grid;grid-template-columns:1fr 1fr;gap:28px}'
            + 'article{min-width:0}canvas{width:100%;height:auto;display:block;background:#080e0b;outline:1px solid #70674e;image-rendering:pixelated}'
            + 'footer{font-size:12px;color:#b2b5a4}@media(max-width:700px){section{grid-template-columns:1fr}main{padding:20px}}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.assert = value => { if (!value) throw new Error('Native tile assertion'); };
            window.artModules = { jquery: window.jQuery, './options': { get: () => false }, comm: { register_handlers() {} } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                const values = deps.map(dep => {
                    if (!(dep in window.artModules)) throw new Error('Missing fixture dependency: ' + dep);
                    return window.artModules[dep];
                });
                window.artModules[window.artName] = factory(...values);
            };
        });
        for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player',
            'tileinfo-gui', 'tileinfo-icons', 'tileinfo-dngn', 'tileinfos', 'status-icon-sizes', 'native-tile-art', 'terrain-materials',
            'enums', 'util', 'map_knowledge', 'tile-edges', 'image-grade', 'atlas-materials', 'weighted-cache', 'atlas-sprites', 'deferred-images',
            'environment-art', 'environment-materials', 'environment-sprites', 'texture-pack', 'tile-art-direction', 'terrain-surface',
            'cell-renderer-textures', 'terrain-edges', 'environment-ground', 'cell-renderer-layers']) {
            const shared = ['tile-edges', 'image-grade', 'atlas-materials', 'atlas-sprites', 'deferred-images', 'weighted-cache', 'terrain-surface', 'texture-pack'].includes(name);
            await page.evaluate(({ name, shared }) => { window.artName = (shared ? '' : './') + name; }, { name, shared });
            await page.addScriptTag({ path: path.join(root, shared ? 'static/scripts' : 'game_data/static', name + '.js') });
        }
        await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode())));
        const proof = await page.evaluate(() => {
            const modules = window.artModules, dngn = modules['./tileinfo-dngn'], player = modules['./tileinfo-player'];
            modules['texture-pack'].bindUser('ArtFixture'); modules['texture-pack'].select('illustrated');
            const main = modules['./tileinfo-main'], icons = modules['./tileinfo-icons'];
            window.jQuery(document).trigger('game_init');
            const art = modules['./tile-art-direction'], regions = modules['./terrain-materials'];
            const grade = modules['image-grade'], materials = modules['atlas-materials'];
            const results = [];
            function pixels(image) {
                const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
                return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            }
            for (const id of ['floor', 'wall', 'feat', 'main', 'player']) {
                const source = document.getElementById(id), start = performance.now(), styled = art.image(id, source);
                const coldMs = performance.now() - start, first = performance.now();
                let cached = true; for (let n = 0; n < 1000; n++) cached = cached && art.image(id, source) === styled;
                const warm1000Ms = performance.now() - first, original = pixels(source), painted = pixels(styled);
                let alpha = true, changed = 0;
                for (let i = 0; i < original.length; i += 4) {
                    alpha = alpha && Math.abs(original[i + 3] - painted[i + 3]) <= 1;
                    if (original[i + 3] && (original[i] !== painted[i] || original[i + 1] !== painted[i + 1]
                        || original[i + 2] !== painted[i + 2])) changed++;
                }
                results.push({ id, coldMs, warm1000Ms, cached, alpha, changed, width: styled.width,
                    height: styled.height, nativeWidth: source.naturalWidth, nativeHeight: source.naturalHeight });
            }
            // Compare the material compositor with its input grade: every unconfigured pixel is invariant.
            const exclusions = [];
            for (const id of ['floor', 'wall']) {
                const source = document.getElementById(id), base = grade.create().image(source,
                    { saturation: .72, contrast: 1.08, brightness: 1.07, tint: [169, 175, 141], tintAmount: .065 });
                const composed = materials.create().image(base, document.getElementById('illustrated_materials'), regions[id]);
                const before = pixels(base), after = pixels(composed), allowed = new Uint8Array(base.width * base.height);
                for (const region of regions[id]) for (let y = region.y; y < region.y + region.h; y++)
                    allowed.fill(1, y * base.width + region.x, y * base.width + region.x + region.w);
                let unchanged = true;
                for (let n = 0; n < allowed.length; n++) if (!allowed[n]) for (let c = 0; c < 4; c++)
                    unchanged = unchanged && before[n * 4 + c] === after[n * 4 + c];
                exclusions.push({ id, unchanged, replacedRegions: regions[id].length });
            }
            const floorSource = document.getElementById('floor'), floorPixels = pixels(floorSource);
            const styledFloor = pixels(art.image('floor', floorSource));
            let unseenUnchanged = true;
            for (const idx of [dngn.DNGN_UNSEEN, dngn.DNGN_ERROR]) {
                const info = dngn.get_tile_info(idx);
                for (let y = info.sy; y < info.ey; y++) for (let x = info.sx; x < info.ex; x++)
                    for (let c = 0; c < 4; c++) {
                        const n = (y * floorSource.naturalWidth + x) * 4 + c;
                        unseenUnchanged = unseenUnchanged && floorPixels[n] === styledFloor[n];
                    }
            }
            const texture = modules['./cell-renderer-textures'];
            function draw(canvas, painted) {
                canvas.width = 1056; canvas.height = 1056;
                const renderer = Object.assign({ ctx: canvas.getContext('2d'), x_scale: 1.5, y_scale: 1.5,
                    scaled_size: () => ({ width: 96, height: 96 }),
                    current_left_overlap: 0, current_sy: 0 }, texture, modules['./cell-renderer-layers'].methods);
                const drawAt = (mod, idx, x, y) => {
                    if (typeof idx !== 'number') throw new Error('Unknown native tile');
                    if (painted) renderer.draw_tile(idx, x * 96, y * 96, mod);
                    else {
                        const info = mod.get_tile_info(idx), source = document.getElementById(mod.get_img(idx));
                        renderer.ctx.drawImage(source, info.sx, info.sy, info.ex - info.sx, info.ey - info.sy,
                            x * 96 + info.ox * 3, y * 96 + info.oy * 3, (info.ex - info.sx) * 3, (info.ey - info.sy) * 3);
                    }
                };
                const cells = [];
                for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
                    const wall = x === 0 || y === 0 || x === 10 || y === 10;
                    const base = wall ? (y < 5 ? dngn.WALL_STONE_GRAY : dngn.WALL_VINES)
                        : y < 5 ? dngn.FLOOR_GREY_DIRT_B : dngn.FLOOR_MOSS;
                    const tile = base + (x * 3 + y) % dngn.tile_count(base);
                    if (!painted) drawAt(dngn, tile, x, y);
                    cells.push({ x, y, t: { bg: tile } });
                }
                modules['./map_knowledge'].merge(cells);
                if (painted) for (const entry of cells) renderer.draw_background(entry.x * 96, entry.y * 96,
                    { bg: modules['./enums'].prepare_bg_flags(entry.t.bg), fg: {}, flv: { f: dngn.FLOOR_GREY_DIRT, s: 0 } },
                    entry.x, entry.y);
                for (let x = 2; x <= 4; x++) drawAt(dngn, dngn.DNGN_DEEP_WATER + x % 2, x, 3);
                drawAt(dngn, dngn.DNGN_SHALLOW_WATER, 4, 4);
                for (let x = 6; x <= 8; x++) drawAt(dngn, dngn.DNGN_LAVA + x % 3, x, 3);
                drawAt(dngn, dngn.DNGN_CLOSED_DOOR, 5, 0);
                drawAt(dngn, dngn.DNGN_STONE_STAIRS_DOWN, 2, 8);
                drawAt(dngn, dngn.DNGN_ALTAR_ZIN, 8, 8);
                drawAt(player, player.MONS_ORC, 7, 5); drawAt(player, player.MONS_KOBOLD, 5, 7);
                drawAt(player, player.MONS_RAT, 3, 6); drawAt(main, main.CLOUD_FIRE, 7, 6);
                drawAt(main, main.CLOUD_POISON, 8, 6); drawAt(icons, icons.CURSOR, 7, 5);
                // A remembered region retains the renderer's ordinary black veil.
                renderer.ctx.fillStyle = '#0009'; renderer.ctx.fillRect(0, 864, 1056, 192);
            }
            draw(document.getElementById('before'), false); draw(document.getElementById('after'), true);
            for (const id of ['icons', 'gui']) if (art.image(id, document.getElementById(id)) !== document.getElementById(id))
                throw new Error('Semantic UI atlas changed');
            return { atlases: results, exclusions, unseenUnchanged, semanticIconsUnchanged: true,
                nativeBackgroundLayer: true, nativeEngine: false };
        });
        for (const atlas of proof.atlases) {
            assert(atlas.alpha && atlas.cached && atlas.changed > 0, JSON.stringify(atlas));
            assert.equal(atlas.width, atlas.nativeWidth); assert.equal(atlas.height, atlas.nativeHeight);
        }
        for (const exclusion of proof.exclusions) assert(exclusion.unchanged);
        assert(proof.unseenUnchanged);
        await page.screenshot({ path: path.join(output, 'material-comparison.png') });
        await page.setViewportSize({ width: 390, height: 800 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, 'material-comparison-narrow.png'), fullPage: true });
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ ...proof, launchOptions, success: true, errors }, null, 2));
        console.log(JSON.stringify({ success: true, ...proof, launchOptions, errors }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
