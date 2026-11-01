/* Real atlas modules and sprite compositors in a browser; controlled art, no native world. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.ENVIRONMENT_ART_PROOF_DIR;
assert(output); fs.mkdirSync(output, { recursive: true });
(async () => {
    const launchOptions = chromiumLaunchOptions(process.env.ART_DIRECTION_BROWSER_CHANNEL);
    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1560, height: 1100 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('http://environment.test/**', route => {
            const name = new URL(route.request().url()).pathname;
            if (name === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
            const atlas = /^\/atlas\/(floor|wall|feat|icons|gui)\.png$/.exec(name);
            const asset = /^\/assets\/(painted-stone|painted-wilds-v1|woodland-sprites-v1|dungeon-features-v1|dungeon-thresholds-v1)\.png$/.exec(name);
            const file = atlas ? path.join(root, 'game_data/static', atlas[1] + '.png')
                : asset ? path.join(root, 'static/tabletop/assets', asset[1] + '.png') : null;
            if (!file) { errors.push(name); return route.fulfill({ status: 404, body: 'Unknown resource' }); }
            return route.fulfill({ contentType: 'image/png', path: file });
        });
        await page.goto('http://environment.test/');
        await page.setContent('<main><header><p class="eyebrow">ILLUSTRATED DARK FANTASY · ENVIRONMENT COLLECTION 01</p>'
            + '<h1>Where the dungeon meets the wild</h1><p>Painted earth, weathered roots, and ancient woodland silhouettes.</p></header>'
            + '<section id="comparison"><article><h2>Original native terrain</h2><canvas id="before"></canvas></article>'
            + '<article><h2>Illustrated environment</h2><canvas id="after"></canvas></article></section>'
            + '<p class="note">Controlled native renderer comparison · 32-pixel tile geometry · no gameplay capture or deployment</p>'
            + '<h2>Six ground families</h2><section id="grounds" class="grounds"></section>'
            + '<h2>Environmental sprites</h2><p>Native-size silhouettes enlarged 3×. Boulders, stump, and fungi are prepared props.</p>'
            + '<section id="sprites" class="sprites"></section></main>'
            + '<div hidden>' + ['floor', 'wall', 'feat', 'icons', 'gui'].map(id => `<img id="${id}" src="/atlas/${id}.png">`).join('')
            + '<img id="illustrated_materials" src="/assets/painted-stone.png">'
            + '<img id="illustrated_wilds" src="/assets/painted-wilds-v1.png">'
            + '<img id="illustrated_woodland" src="/assets/woodland-sprites-v1.png">'
            + '<img id="illustrated_dungeon" data-src="/assets/dungeon-features-v1.png">'
            + '<img id="illustrated_thresholds" data-src="/assets/dungeon-thresholds-v1.png"></div>');
        await page.addStyleTag({ content: 'body{margin:0;background:#111615;color:#b2b5a4;font:15px/1.5 system-ui}'
            + 'main{max-width:1472px;margin:auto;padding:28px 32px}h1{font:42px Georgia;color:#eee7d6;margin:8px 0}'
            + 'h2{font:23px Georgia;color:#e2cea1;margin:24px 0 14px}p{margin:8px 0 18px}'
            + '.eyebrow,.note{font-size:12px;letter-spacing:1px;color:#86b9ad}#comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px}'
            + '#comparison canvas{width:100%;height:auto;display:block;outline:1px solid #70674e}'
            + 'canvas{image-rendering:pixelated}.grounds,.sprites{display:grid;gap:14px;grid-template-columns:repeat(6,1fr)}'
            + '.card{border:1px solid #70674e;background:#1a211f;padding:12px;text-align:center}'
            + '.card p{margin:8px 0 0;font-size:13px;color:#eee7d6}.card canvas{display:block;margin:auto}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.assert = value => { if (!value) throw new Error('Native assertion'); };
            window.artModules = { jquery: window.jQuery, './options': { get: () => false }, comm: { register_handlers() {} } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.artModules[window.artName] = factory(...deps.map(dep => {
                    if (!(dep in window.artModules)) throw new Error('Missing dependency ' + dep);
                    return window.artModules[dep];
                }));
            };
        });
        for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player',
            'tileinfo-gui', 'tileinfo-icons', 'tileinfo-dngn', 'tileinfos', 'status-icon-sizes', 'native-tile-art',
            'terrain-materials', 'environment-art', 'environment-materials', 'environment-sprites', 'tile-edges',
            'image-grade', 'atlas-materials', 'weighted-cache', 'atlas-sprites', 'deferred-images', 'texture-pack', 'tile-art-direction', 'cell-renderer-textures',
            'terrain-surface', 'enums', 'util', 'map_knowledge', 'terrain-edges', 'environment-ground', 'cell-renderer-layers']) {
            const shared = ['tile-edges', 'image-grade', 'atlas-materials', 'atlas-sprites', 'deferred-images', 'weighted-cache', 'terrain-surface', 'texture-pack'].includes(name);
            await page.evaluate(({ name, shared }) => { window.artName = (shared ? '' : './') + name; }, { name, shared });
            await page.addScriptTag({ path: path.join(root, shared ? 'static/scripts' : 'game_data/static', name + '.js') });
        }
        await page.evaluate(() => {
            const pack = window.artModules['texture-pack'];
            window.jQuery(document).trigger('game_init');
            const sheets = ['illustrated_dungeon', 'illustrated_thresholds'];
            if (sheets.some(id => document.getElementById(id).getAttribute('src'))) throw new Error('Classic fetched optional dungeon art');
            pack.bindUser('EnvironmentFixture'); pack.select('illustrated');
            if (sheets.some(id => document.getElementById(id).getAttribute('src'))) throw new Error('Mode selection fetched unused art');
            window.artModules['./tile-art-direction'].tile('feat', window.artModules['./tileinfo-dngn'].DNGN_CLOSED_DOOR);
            window.artModules['./tile-art-direction'].tile('feat', window.artModules['./tileinfo-dngn'].DNGN_RUNED_DOOR);
            if (sheets.some(id => !document.getElementById(id).getAttribute('src'))) throw new Error('Illustrated did not load its art');
        });
        await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode())));
        const proof = await page.evaluate(async () => {
            const modules = window.artModules, tiles = modules['./tileinfo-dngn'], art = modules['./tile-art-direction'];
            const pack = modules['texture-pack']; pack.bindUser('EnvironmentFixture'); pack.select('illustrated');
            const catalog = modules['./environment-art'], ground = modules['./environment-materials'].floor;
            const trees = modules['./environment-sprites'].feat, sprites = modules['atlas-sprites'];
            const images = {};
            for (const sheet of [catalog.ground, catalog.sprites]) {
                const image = document.getElementById(sheet.id);
                if (image.naturalWidth !== sheet.width || image.naturalHeight !== sheet.height) throw new Error('Sheet geometry');
                images[sheet.id] = image;
            }
            // Observe the exact pre-expansion rendering, then restore both new sheets.
            for (const [id, image] of Object.entries(images)) image.id = id + '_held';
            const before = { floor: art.image('floor', document.getElementById('floor')),
                feat: art.image('feat', document.getElementById('feat')) };
            for (const [id, image] of Object.entries(images)) image.id = id;
            const started = performance.now(), after = { floor: art.image('floor', document.getElementById('floor')),
                feat: art.image('feat', document.getElementById('feat')) }, coldMs = performance.now() - started;
            const warm = performance.now(); let cached = true;
            for (let n = 0; n < 1000; n++) for (const id of ['floor', 'feat'])
                cached = cached && art.image(id, document.getElementById(id)) === after[id];
            const warm1000Ms = performance.now() - warm;
            function pixels(image) {
                const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height; const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0); return context.getImageData(0, 0, canvas.width, canvas.height).data;
            }
            const invariants = [];
            for (const [id, regions] of [['floor', ground], ['feat', trees]]) {
                const first = pixels(before[id]), last = pixels(after[id]), width = after[id].width;
                const allowed = new Uint8Array(width * after[id].height); let changed = 0, alphaChanged = 0, outsideChanges = 0;
                if (first.length !== last.length) throw new Error('Atlas dimensions changed');
                for (const region of regions) for (let y = region.y; y < region.y + region.h; y++)
                    allowed.fill(1, y * width + region.x, y * width + region.x + region.w);
                for (let n = 0; n < allowed.length; n++) {
                    const difference = [0, 1, 2, 3].some(c => first[n * 4 + c] !== last[n * 4 + c]);
                    if (difference) { if (allowed[n]) changed++; else outsideChanges++; }
                    if (first[n * 4 + 3] !== last[n * 4 + 3]) alphaChanged++;
                }
                invariants.push({ id, replacedRegions: regions.length, changed, alphaChanged, outsideChanges,
                    width, height: after[id].height });
            }
            const sheetPixels = pixels(images[catalog.sprites.id]); let transparent = 0, nearOpaque = 0;
            for (let n = 3; n < sheetPixels.length; n += 4) {
                if (sheetPixels[n] === 0) transparent++; if (sheetPixels[n] >= 240) nearOpaque++;
            }
            const compositor = sprites.create(), nativeFeat = document.getElementById('feat');
            const missingFallback = compositor.image(nativeFeat, null, trees) === nativeFeat;
            const invalid = trees.concat([{ x: 0, y: 0, w: 32, h: 32, sprite: { x: 9999, y: 0, w: 362, h: 362 } }]);
            const invalidFallback = compositor.image(nativeFeat, images[catalog.sprites.id], invalid) === nativeFeat;
            const templateImagesRestored = Object.keys(images).every(id => document.getElementById(id) === images[id]);
            async function flatMaterial(key, color) {
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
                const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 32, 32);
                const image = new Image(); image.src = canvas.toDataURL(); await image.decode();
                return { key, image, rect: { x: 0, y: 0, w: 32, h: 32 }, shade: 0 };
            }
            const blend = modules['terrain-surface'].create({ cacheSize: 3 });
            const a = await flatMaterial('a', '#304820'), b = await flatMaterial('b', '#b0a080');
            const right = Array(9).fill(a); right[5] = b;
            const left = Array(9).fill(b); left[3] = a;
            const firstTile = blend.tile(a, right, 0, 0), secondTile = blend.tile(b, left, 1, 0);
            const firstPixels = pixels(firstTile), secondPixels = pixels(secondTile);
            let sharedEdgeDifference = 0, centrePreserved = true;
            for (let y = 10; y < 22; y++) for (let c = 0; c < 3; c++)
                sharedEdgeDifference = Math.max(sharedEdgeDifference,
                    Math.abs(firstPixels[(y * 32 + 31) * 4 + c] - secondPixels[y * 32 * 4 + c]));
            const plain = pixels(blend.tile(a, [], 0, 0));
            for (let y = 10; y < 22; y++) for (let x = 10; x < 22; x++) for (let c = 0; c < 4; c++)
                centrePreserved = centrePreserved && firstPixels[(y * 32 + x) * 4 + c] === plain[(y * 32 + x) * 4 + c];
            const periodic = blend.tile(a, [], 0, 0) === blend.tile(a, [], -4, 4);
            for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) blend.tile(a, right, x, y);
            const boundedCache = blend.cacheSize() <= 3;
            const groundAdapter = modules['./environment-ground'], map = modules['./map_knowledge'];
            window.jQuery(document).trigger('game_init');
            map.merge([{ x: 10, y: 10, t: { bg: tiles.FLOOR_GRASS } },
                { x: 11, y: 10, t: { bg: { value: tiles.FLOOR_SAND, UNSEEN: true } } }]);
            function groundPixels() {
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
                const view = { ctx: canvas.getContext('2d'), scaled_size: () => ({ width: 32, height: 32 }) };
                const drawn = groundAdapter.draw(view, tiles.FLOOR_GRASS, 0, 0, 10, 10);
                return { drawn, pixels: pixels(canvas) };
            }
            const hiddenA = groundPixels();
            map.merge([{ x: 11, y: 10, t: { bg: { value: tiles.FLOOR_ICE, UNSEEN: true } } }]);
            const hiddenB = groundPixels();
            const unknownInvariant = hiddenA.drawn && hiddenA.pixels.every((value, index) => value === hiddenB.pixels[index]);
            map.merge([{ x: 10, y: 10, t: { bg: { value: tiles.FLOOR_GRASS, UNSEEN: true } } }]);
            const unseenSkipped = !groundPixels().drawn;
            const transitionChecks = { sharedEdgeDifference, centrePreserved, periodic, boundedCache, unknownInvariant, unseenSkipped };
            function renderer(canvas) {
                return Object.assign({ ctx: canvas.getContext('2d'), x_scale: 2, y_scale: 2,
                    scaled_size: () => ({ width: 64, height: 64 }), current_left_overlap: 0, current_sy: 0 },
                    modules['./cell-renderer-textures'], modules['./cell-renderer-layers'].methods);
            }
            function drawAt(view, index, x, y, painted) {
                if (painted) {
                    const mapCell = map.get(x, y), old = modules['./enums'].prepare_bg_flags(mapCell.t.bg).value;
                    const floor = mapCell.t.flv ? mapCell.t.flv.f : old;
                    if (index >= tiles.DNGN_FIRST_TRANSPARENT)
                        map.merge([{ x, y, t: { bg: index, flv: { f: floor, s: 0 } } }]);
                    view.draw_background(x * 64, y * 64, {
                        bg: modules['./enums'].prepare_bg_flags(index), fg: {}, flv: { f: floor, s: 0 }
                    }, x, y);
                }
                else {
                    const info = tiles.get_tile_info(index), source = document.getElementById(tiles.get_img(index));
                    view.ctx.drawImage(source, info.sx, info.sy, info.ex - info.sx, info.ey - info.sy,
                        x * 64 + info.ox * 2, y * 64 + info.oy * 2, (info.ex - info.sx) * 2, (info.ey - info.sy) * 2);
                }
            }
            for (const painted of [false, true]) {
                const canvas = document.getElementById(painted ? 'after' : 'before'); canvas.width = 768; canvas.height = 512;
                const view = renderer(canvas); view.ctx.imageSmoothingEnabled = false;
                const names = ['FLOOR_GRASS', 'FLOOR_GRASS_DARK', 'FLOOR_LAIR', 'FLOOR_MUD', 'FLOOR_SAND', 'FLOOR_ICE'];
                const cells = [];
                for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
                    const cell = x < 4 ? (y < 4 ? 0 : 1) : x < 8 ? (y < 4 ? 2 : 3) : y < 4 ? 4 : 5;
                    const base = tiles[names[cell]], index = base + (x + y * 3) % tiles.tile_count(base);
                    cells.push({ x, y, t: { bg: index } });
                }
                window.jQuery(document).trigger('game_init'); modules['./map_knowledge'].merge(cells);
                for (const cell of cells) drawAt(view, cell.t.bg, cell.x, cell.y, painted);
                for (const [name, x, y] of [['DNGN_TREE', 0, 1], ['DNGN_TREE', 2, 2], ['DNGN_TREE_YELLOW', 1, 5],
                    ['DNGN_TREE_RED', 3, 6], ['DNGN_TREE_DEAD', 4, 1], ['DNGN_PETRIFIED_TREE', 6, 2],
                    ['DNGN_MANGROVE', 5, 5], ['DNGN_MANGROVE', 7, 6], ['DNGN_TREE_OF_WOE', 9, 5],
                    ['DNGN_DEAD_TREE_OF_WOE', 11, 6]]) drawAt(view, tiles[name], x, y, painted);
                for (const [name, x, y] of [['DNGN_SHALLOW_WATER', 4, 6], ['DNGN_DEEP_WATER', 4, 7],
                    ['DNGN_LAVA', 11, 0], ['DNGN_STONE_STAIRS_DOWN', 10, 2]]) {
                    if (painted) view.draw_tile(tiles[name], x * 64, y * 64, tiles);
                    else drawAt(view, tiles[name], x, y, painted);
                }
            }
            function card(parent, label, width, height) {
                const element = document.createElement('article'); element.className = 'card';
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                element.appendChild(canvas); const text = document.createElement('p'); text.textContent = label;
                element.appendChild(text); document.getElementById(parent).appendChild(element); return canvas;
            }
            catalog.ground.entries.forEach((entry, cell) => {
                const canvas = card('grounds', entry.label, 160, 96), view = renderer(canvas);
                view.scaled_size = () => ({ width: 32, height: 32 });
                const index = tiles[entry.names[0]], cells = [];
                for (let x = 0; x < 5; x++) for (let y = 0; y < 3; y++) cells.push({ x, y, t: { bg: index } });
                modules['./map_knowledge'].clear(); modules['./map_knowledge'].merge(cells);
                for (const cell of cells) modules['./environment-ground'].draw(view, index, cell.x * 32, cell.y * 32, cell.x, cell.y);
            });
            catalog.sprites.entries.forEach((entry, cell) => {
                const canvas = card('sprites', entry.label, 96, 96), context = canvas.getContext('2d');
                const region = Object.assign({}, catalog.sprites.style, { x: 0, y: 0, w: 32, h: 32,
                    sprite: { x: cell % 4 * 362, y: Math.floor(cell / 4) * 362, w: 362, h: 362 } });
                const base = document.createElement('canvas'); base.width = base.height = 32;
                context.imageSmoothingEnabled = false;
                context.drawImage(sprites.create().image(base, images[catalog.sprites.id], [region]), 0, 0, 96, 96);
            });
            map.clear(); map.merge([{ x: 10, y: 10, t: { bg: tiles.FLOOR_GRASS } }]);
            const enabledGroundBefore = groundPixels().drawn;
            pack.select('classic');
            const classicExact = ['floor', 'wall', 'feat', 'icons', 'gui'].every(id => art.image(id, document.getElementById(id)) === document.getElementById(id));
            const disabledGround = !groundPixels().drawn;
            pack.select('illustrated');
            const illustratedRestored = art.image('floor', document.getElementById('floor')) === after.floor
                && art.image('feat', document.getElementById('feat')) === after.feat;
            return { nativeEngine: false, launch: 'controlled actual atlas modules', groundVariants: ground.length,
                packChecks: { classicExact, enabledGroundBefore, disabledGround, illustratedRestored },
                treeVariants: trees.length, invariants, cached, coldMs, warm1000Ms, transparent, nearOpaque, transitionChecks,
                missingFallback, invalidFallback, templateImagesRestored };
        });
        proof.detailedSprites = await page.evaluate(require('./helpers/detailed-sprite-checks.cjs'));
        await page.locator('#detailed-feature-comparison').screenshot({ path: path.join(output, 'feature-states-comparison.png') });
        proof.thresholds = await page.evaluate(require('./helpers/threshold-art-checks.cjs'));
        if (process.env.TERRAIN_SURFACE_BASELINE) {
            await page.evaluate(() => { window.artName = 'terrain-surface-before'; });
            await page.addScriptTag({ path: process.env.TERRAIN_SURFACE_BASELINE });
            proof.groundResolution = await page.evaluate(require('./helpers/ground-resolution-checks.cjs'));
            await page.addStyleTag({ content: '#ground-resolution table{border-collapse:collapse}#ground-resolution th,#ground-resolution td{padding:12px 20px;border:1px solid #70674e}#ground-resolution canvas{width:128px;height:128px}' });
            await page.locator('#ground-resolution').screenshot({ path: path.join(output, 'ground-resolution-comparison.png') });
        }
        if (process.env.PREMIUM_DETAIL_BASELINE) {
            await page.evaluate(() => {
                const m = window.artModules;
                Object.assign(m['./options'], { ready: () => true, get: name => name === 'tile_display_mode' ? 'tiles' : false, add_listener() {} });
                m['./game-context'] = { get_ui_state: () => 0 };
                window.detailPremium = true; window.detailFlags = new Set(['lighting', 'materials', 'borders', 'reflections']);
                m['visual-presentation'] = { premium: () => window.detailPremium, animated: () => false, enabled: key => window.detailFlags.has(key) };
                window.detailLightsAt = (x, y) => [{ x: x - .7, y: y - .5, radius: 4, strength: .15, colour: [255, 170, 90] }];
                m['./premium-light-field'] = { forView: () => ({ at: (x, y) => window.detailLightsAt(x, y) }) };
                m['idle-work'] = { add() {} };
            });
            for (const name of ['terrain-topology', 'liquid-field', 'terrain-blend', 'wall-surface', 'shader-atlas', 'liquid-shader',
                'fluid-surface', 'shoreline-paint', 'terrain-finish', 'light-field-sampling', 'light-emission', 'material-response',
                'surface-lighting', 'sampled-lighting', 'pixel-sampling', 'transparent-surface', 'depth-shading',
                'premium-effect-model', 'premium-terrain-model', 'premium-terrain']) {
                const shared = !name.startsWith('premium-');
                await page.evaluate(({ name, shared }) => { window.artName = (shared ? '' : './') + name; }, { name, shared });
                await page.addScriptTag({ path: path.join(root, shared ? 'static/scripts' : 'game_data/static', name + '.js') });
            }
            await page.evaluate(() => {
                const m = window.artModules; window.detailLayers = m['./cell-renderer-layers'];
                m['./cell-renderer-layers'] = { ...window.detailLayers, addTerrainPainter() {}, addSurfacePainter() {} };
                window.artName = './premium-terrain-before';
            });
            await page.addScriptTag({ path: process.env.PREMIUM_DETAIL_BASELINE });
            await page.evaluate(() => { window.artModules['./cell-renderer-layers'] = window.detailLayers; });
            proof.premiumDetail = await page.evaluate(require('./helpers/premium-detail-checks.cjs'));
            await page.locator('#premium-detail').screenshot({ path: path.join(output, 'premium-detail-comparison.png') });
        }
        if (process.env.DISTORTION_DETAIL_BASELINE) {
            for (const name of ['region-field', 'aura-distortion', 'premium-region-model']) {
                const shared = !name.startsWith('premium-');
                await page.evaluate(({ name, shared }) => { window.artName = (shared ? '' : './') + name; }, { name, shared });
                await page.addScriptTag({ path: path.join(root, shared ? 'static/scripts' : 'game_data/static', name + '.js') });
            }
            await page.evaluate(() => {
                const m = window.artModules; window.regionLayers = m['./cell-renderer-layers'];
                m['./cell-renderer-layers'] = { ...window.regionLayers, addTerrainPainter(fn) { window.currentRegionPainter = fn; }, addRegionPainter() {} };
                window.artName = './premium-regions';
            });
            await page.addScriptTag({ path: path.join(root, 'game_data/static/premium-regions.js') });
            await page.evaluate(() => { window.artName = 'pixel-sampling-before'; });
            await page.addScriptTag({ path: process.env.PIXEL_SAMPLING_BASELINE });
            await page.evaluate(() => {
                const m = window.artModules; window.currentSampling = m['pixel-sampling']; m['pixel-sampling'] = m['pixel-sampling-before'];
                m['./cell-renderer-layers'] = { ...window.regionLayers, addTerrainPainter(fn) { window.previousRegionPainter = fn; }, addRegionPainter() {} };
                window.artName = './premium-regions-before';
            });
            await page.addScriptTag({ path: process.env.DISTORTION_DETAIL_BASELINE });
            await page.evaluate(() => {
                window.artModules['./cell-renderer-layers'] = window.regionLayers;
                window.artModules['pixel-sampling'] = window.currentSampling;
            });
            proof.distortionDetail = await page.evaluate(require('./helpers/distortion-detail-checks.cjs'));
            await page.locator('#distortion-detail').screenshot({ path: path.join(output, 'distortion-detail-comparison.png') });
        }
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ ...proof, errors }, null, 2));
        await page.screenshot({ path: path.join(output, 'environment-preview.png'), fullPage: true });
        await page.locator('#comparison').screenshot({ path: path.join(output, 'environment-comparison.png') });
        for (const invariant of proof.invariants) {
            assert(invariant.changed > 0); assert.equal(invariant.outsideChanges, 0);
            if (invariant.id === 'floor') assert.equal(invariant.alphaChanged, 0);
        }
        assert(proof.cached && proof.missingFallback && proof.invalidFallback && proof.templateImagesRestored);
        assert(Object.values(proof.packChecks).every(Boolean), JSON.stringify(proof.packChecks));
        assert(proof.transitionChecks.sharedEdgeDifference <= 2, JSON.stringify(proof.transitionChecks));
        for (const [name, value] of Object.entries(proof.transitionChecks)) if (name !== 'sharedEdgeDifference') assert(value, name);
        assert(proof.transparent > 100000 && proof.nearOpaque > 100000); assert.equal(errors.length, 0);
        console.log(JSON.stringify({ passed: true, ...proof }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
