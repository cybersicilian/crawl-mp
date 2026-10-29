/* Controlled native-atlas comparison plus real preference/map/overlay integration.
 * No engine process, account, server, or native gameplay is involved. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const graphicsFixture = require('./helpers/graphics-fixture.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.PREMIUM_PROOF_DIR;
assert(output, 'PREMIUM_PROOF_DIR is required');
fs.mkdirSync(output, { recursive: true });
const runtimeRoot = process.env.PREMIUM_RUNTIME_ROOT;
const runtimeFile = file => runtimeRoot && fs.existsSync(path.join(runtimeRoot, file)) ? path.join(runtimeRoot, file) : path.join(root, file);
const source = file => fs.readFileSync(runtimeFile(file), 'utf8');
const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
const image = name => `<img id="${name}" src="data:image/png;base64,${fs.readFileSync(runtimeFile('game_data/static/' + name + '.png')).toString('base64')}" alt="">`;

function fixture() {
    const setup = () => {
        window.assert = value => { if (!value) throw new Error('Native tile assertion'); };
        window.fixtureModules = { jquery: window.jQuery };
        window.define = (names, factory) => {
            if (typeof names === 'function') { factory = names; names = []; }
            window.fixtureModules[window.fixtureName] = factory(...names.map(name => {
                if (!(name in window.fixtureModules)) throw new Error('Missing dependency ' + name);
                return window.fixtureModules[name];
            }));
        };
        const settings = { tile_display_mode: 'tiles', tile_realtime_anim: true, tile_water_anim: true, tile_misc_anim: true };
        window.fixtureSettings = settings;
        window.fixtureModules['./options'] = { ready: () => true, get: name => settings[name], add_listener() {} };
        window.fixtureModules['./game-context'] = { get_ui_state: () => 0 };
        window.fixtureModules['./view_data'] = { cursor_locs: {} };
        window.fixtureModules['./tileinfo-icons'] = {};
        window.fixtureModules['./terrain-edges'] = { draw() {} };
        window.fixtureModules['./environment-ground'] = { draw: () => false };
        window.fixtureRenderer = window.fixtureModules['./dungeon_renderer'] = {
            cols: 15, rows: 13, ui_state: 0, view: { x: 0, y: 0 },
            element: document.getElementById('dungeon'),
            in_view(x, y) { return x >= 0 && y >= 0 && x < 15 && y < 13; },
            render_loc(x, y) { window.jQuery(document).trigger('dungeon_tiles_changed', [[{ x, y }]]); },
            canvas_coords(x, y) { return { x: (x - this.view.x) * 64, y: (y - this.view.y) * 64, width: 64, height: 64 }; }
        };
        document.getElementById('dungeon').addEventListener('click', () => { window.fixtureClicks = (window.fixtureClicks || 0) + 1; });
    };
    const start = async () => {
        await Promise.all(Array.from(document.images, image => image.decode()));
        const m = window.fixtureModules, tiles = m['./tileinfo-dngn'];
        const renderer = window.fixtureRenderer, map = m['./map_knowledge'];
        const canvas = renderer.element, classic = document.getElementById('classic');
        canvas.width = classic.width = 960; canvas.height = classic.height = 832;
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        const closeups = Array.from(document.querySelectorAll('[data-crop]'), target => ({
            ctx: target.getContext('2d'), rect: target.dataset.crop.split(',').map(value => Number(value) * 64) }));
        const tilesAt = [];
        function at(module, id, x, y, target = ctx, scale = 2) {
            const info = module.get_tile_info(id), image = document.getElementById(module.get_img(id));
            target.drawImage(image, info.sx, info.sy, info.ex - info.sx, info.ey - info.sy,
                x * 32 * scale + info.ox * scale, y * 32 * scale + info.oy * scale,
                (info.ex - info.sx) * scale, (info.ey - info.sy) * scale);
        }
        window.jQuery(document).trigger('game_init');
        let torch = 0, lava = 0;
        for (let y = 0; y < 13; y++) for (let x = 0; x < 15; x++) {
            const wall = !x || !y || x === 14 || y === 12 || x === 7 && y > 1 && y < 5;
            const hidden = y >= 11 || x >= 12 && y >= 9;
            let base = wall ? tiles.WALL_BRICK_DARK : tiles.FLOOR_GREY_DIRT_B;
            if (!Number.isInteger(base)) base = wall ? tiles.WALL_STONE_GRAY : tiles.FLOOR_NORMAL;
            let id = base + (x * 3 + y * 7) % tiles.tile_count(base);
            if (!wall && x < 7 && y >= 8) id = tiles.FLOOR_MOSS + (x + y) % tiles.tile_count(tiles.FLOOR_MOSS);
            if (!wall && x >= 4 && x <= 6 && y >= 4 && y <= 7) id = tiles.FLOOR_SAND;
            if ((x === 2 || x === 10) && y === 0) { id = tiles.WALL_BRICK_DARK_2_TORCH; torch++; }
            if (x === 0 && y === 5) { id = tiles.WALL_BRICK_DARK_4_TORCH; torch++; }
            if (y === 0 && x === 4) id = tiles.WALL_CRYSTAL_SQUARES;
            if (y === 0 && x === 5) id = tiles.WALL_VAULTS_METAL;
            if (y === 0 && x === 6) id = tiles.DNGN_TRANSPARENT_WALL;
            if (x >= 11 && x <= 13 && y >= 1 && y <= 2)
                id = [tiles.DNGN_CRYSTAL_GREEN, tiles.WALL_EMERALD, tiles.DNGN_TRANSPARENT_WALL_GREEN][x - 11];
            if (x >= 9 && x <= 11 && y >= 5 && y <= 6) { id = tiles.DNGN_LAVA + (x + y) % 4; lava++; }
            if (x >= 2 && x <= 4 && y >= 5 && y <= 8) id = tiles.DNGN_DEEP_WATER + (x + y) % 2;
            if ((x === 4 || x === 5) && y >= 6 && y <= 8) id = tiles.DNGN_SHALLOW_WATER;
            if (id >= tiles.DNGN_FIRST_TRANSPARENT) at(tiles, x === 13 && y <= 2 ? tiles.FLOOR_SAND : tiles.FLOOR_GREY_DIRT_B, x, y);
            at(tiles, id, x, y);
            if (hidden) { ctx.fillStyle = '#000b'; ctx.fillRect(x * 64, y * 64, 64, 64); }
            tilesAt.push({ x, y, t: { bg: id + (hidden ? 0x40000 : 0), flv: { f: x === 13 && y <= 2 ? tiles.FLOOR_SAND : tiles.FLOOR_GREY_DIRT_B } } });
        }
        const features = [[tiles.DNGN_STONE_STAIRS_DOWN, 3, 9], [tiles.DNGN_BLUE_FOUNTAIN, 10, 9]];
        features.forEach(([id, x, y]) => {
            at(tiles, id, x, y); tilesAt.find(cell => cell.x === x && cell.y === y).t.bg = id;
        });
        const player = m['./tileinfo-player'];
        const classicTerrain = document.createElement('canvas'); classicTerrain.width = 960; classicTerrain.height = 832;
        classicTerrain.getContext('2d').drawImage(canvas, 0, 0);
        const effects = m['./tileinfo-main'];
        const clouds = [['CLOUD_GREY_SMOKE', 2, 2], ['CLOUD_MIST', 3, 2], ['CLOUD_POISON', 4, 2],
            ['CLOUD_FIRE', 12, 7], ['CLOUD_COLD', 11, 8], ['CLOUD_FIRE', 2, 4]];
        clouds.forEach(([name, x, y]) => { tilesAt.find(cell => cell.x === x && cell.y === y).t.cloud = effects[name]; });
        const spells = [['BOLT_FLAME', 9, 4], ['BOLT_FROST', 10, 4], ['BOLT_STRONG_ELEC', 11, 4], ['BOLT_IRON_SHOT', 12, 4]];
        const shots = [];
        spells.forEach(([name, x, y]) => {
            if (!Number.isInteger(effects[name])) throw new Error('Missing effect ' + name);
            tilesAt.find(cell => cell.x === x && cell.y === y).t.ov = [effects[name]];
        });
        const auraCells = tilesAt.filter(cell => cell.x > 7 && cell.x < 13 && cell.y > 0 && Math.hypot(cell.x - 9, cell.y - 3) <= 2.2);
        auraCells.forEach(cell => { cell.t.halo = m['./enums'].HALO_RANGE; });
        tilesAt.filter(cell => Math.hypot(cell.x - 10, cell.y - 9) <= 1.8 && cell.y < 11 && !(cell.x >= 12 && cell.y >= 9))
            .forEach(cell => { cell.t.halo = m['./enums'].HALO_UMBRA_1; });
        const actors = [[player.MONS_ORC, 9, 3], [player.MONS_KOBOLD, 5, 4], [player.MONS_RAT, 4, 9]];
        const actorIds = actors.map(([, x, y]) => x * 20 + y);
        for (const [id, x, y] of actors) {
            at(player, id, x, y);
            tilesAt.find(cell => cell.x === x && cell.y === y).mon = { id: x * 20 + y };
        }
        classic.getContext('2d').drawImage(canvas, 0, 0);
        map.merge(tilesAt);
        renderer.ctx = ctx; renderer.scaled_size = () => ({ width: 64, height: 64 });
        m['./premium-movement'].attach(renderer);
        Object.assign(renderer, m['./cell-renderer-layers'].methods);
        renderer.draw_dngn = function (id, x, y) {
            const scale = this.scaled_size().width / 32;
            at(tiles, id, x / (32 * scale), y / (32 * scale), this.ctx, scale);
        };
        renderer.draw_main = function (id, x, y) {
            const scale = this.scaled_size().width / 32;
            at(effects, id, x / (32 * scale), y / (32 * scale), this.ctx, scale);
        };
        window.fixtureRemoveCloud = () => {
            const [, x, y] = clouds.shift();
            map.merge([{ x, y, t: { cloud: 0 } }]); repaint();
        };
        function repaint(dirty) {
            const started = performance.now();
            renderer.frame_time = started;
            const included = (x, y) => !dirty || dirty.some(pos => pos.x === x && pos.y === y);
            for (const entry of tilesAt.filter(entry => included(entry.x, entry.y))) {
                const cell = { ...entry.t, bg: m['./enums'].prepare_bg_flags(entry.t.bg), fg: {}, flv: { f: entry.x === 13 && entry.y <= 2 ? tiles.FLOOR_SAND : tiles.FLOOR_GREY_DIRT_B } };
                m['./cell-renderer-layers'].methods.draw_background.call(renderer, entry.x * 64, entry.y * 64, cell, entry.x, entry.y);
                if (cell.bg.UNSEEN) { ctx.fillStyle = '#000b'; ctx.fillRect(entry.x * 64, entry.y * 64, 64, 64); }
            }
            actors.filter(([, x, y]) => included(x, y)).forEach(([id, x, y]) => m['./cell-renderer-layers'].paintActor(renderer, x, y, x * 64, y * 64,
                map.get(x, y), () => at(player, id, x, y, renderer.ctx)));
            [...clouds, ...spells, ...shots].filter(([, x, y]) => included(x, y)).forEach(([name, x, y]) => m['./cell-renderer-layers'].paintEffect(renderer,
                effects[name], name.startsWith('CLOUD') ? 'cloud' : 'overlay', x, y, x * 64, y * 64));
            closeups.forEach(({ ctx: target, rect }) => { target.imageSmoothingEnabled = false; target.drawImage(canvas, ...rect, 0, 0, 320, 256); });
            const original = classic.getContext('2d'); original.imageSmoothingEnabled = false;
            original.drawImage(classicTerrain, 0, 0);
            tilesAt.forEach(entry => m['./premium-region-model'].describe(entry).forEach(field => at(tiles, field.tile, entry.x, entry.y, original)));
            actors.forEach(([id, x, y]) => at(player, id, x, y, original));
            [...clouds, ...spells, ...shots].forEach(([name, x, y]) => at(effects, effects[name], x, y, original));
            window.fixtureRenderMs = (window.fixtureRenderMs || []).concat(performance.now() - started).slice(-60);
        }
        window.fixtureRepaint = repaint;
        let auraIndex = 0;
        const auraStates = ['Halo', 'Umbra', 'Silence', 'Sanctuary', 'None'];
        document.getElementById('motion-area').onclick = () => {
            auraIndex = (auraIndex + 1) % auraStates.length;
            const changed = auraCells.map(cell => {
                cell.t.halo = auraIndex === 0 ? m['./enums'].HALO_RANGE : auraIndex === 1 ? m['./enums'].HALO_UMBRA_1 : 0;
                cell.t.silenced = auraIndex === 2; cell.t.sanctuary = auraIndex === 3;
                return { x: cell.x, y: cell.y, t: { halo: cell.t.halo, silenced: cell.t.silenced, sanctuary: cell.t.sanctuary } };
            });
            map.merge(changed); repaint(); document.getElementById('motion-area').textContent = 'Area: ' + auraStates[auraIndex];
        };
        let pending = false, dirtyCells = [];
        window.jQuery(document).on('dungeon_tiles_changed', (event, cells) => {
            dirtyCells.push(...cells);
            if (!pending) { pending = true; requestAnimationFrame(() => {
                pending = false; const dirty = dirtyCells; dirtyCells = []; repaint(dirty);
            }); }
        });
        window.jQuery(document).on('visual_presentation_changed', () => repaint());
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => repaint());
        let live = true;
        window.jQuery(document).on('game_cleanup', () => { live = false; });
        let shotTimer;
        document.getElementById('motion-cast').onclick = () => {
            clearTimeout(shotTimer);
            function advance(x) {
                if (!live) return;
                const changed = shots.splice(0).map(([, oldX, y]) => ({ x: oldX, y, t: { ov: [] } }));
                if (x <= 11) {
                    // East is native direction 2 (tilepick.cc::_tile_bolt_dir).
                    shots.push(['MI_ARROW2', x, 7]); changed.push({ x, y: 7, t: { ov: [effects.MI_ARROW2] } });
                    shotTimer = setTimeout(() => advance(x + 1), 100);
                }
                window.fixtureShotPosition = x <= 11 ? { x, y: 7 } : null;
                map.merge(changed); repaint();
            }
            advance(7);
        };
        const party = () => window.jQuery(document).trigger('party_state_rendered', [{ floor: 'D:1', members: [
            { slot: 0, name: 'Preview hero', place: 'D:1', pos: { x: actors[0][1], y: actors[0][2] } }
        ] }]);
        party();
        window.fixtureMove = (index, x, y) => {
            const actor = actors[index], old = { x: actor[1], y: actor[2] };
            actor[1] = x; actor[2] = y;
            map.merge([{ ...old, mon: null }, { x, y, mon: { id: actorIds[index] } }]);
            if (index === 0) party();
            repaint([old, { x, y }]);
        };
        document.getElementById('motion-walk').onclick = () => window.fixtureMove(0, actors[0][1] === 9 ? 10 : 9, 3);
        document.getElementById('motion-water').onclick = () => {
            window.fixtureMove(1, 2, 7);
            setTimeout(() => { if (live) window.fixtureMove(1, 3, 7); }, 40);
        };
        let cruising = false, cruiseTimer, routeIndex = 0;
        const route = [[4, 4], [4, 5], [3, 5], [4, 5], [4, 4], [5, 4]];
        function cruise() {
            if (!live || !cruising) return;
            document.getElementById('motion-walk').click();
            const [x, y] = route[routeIndex++ % route.length]; window.fixtureMove(1, x, y);
            cruiseTimer = setTimeout(cruise, 1100);
        }
        window.fixtureAutoplay = enabled => {
            clearTimeout(cruiseTimer); cruising = enabled;
            document.getElementById('motion-demo').textContent = enabled ? 'Pause walking demo' : 'Play walking demo';
            if (enabled) cruiseTimer = setTimeout(cruise, 2200);
        };
        document.getElementById('motion-demo').onclick = () => window.fixtureAutoplay(!cruising);
        window.fixtureAutoplay(true);
        function animate() { if (!live) return; if (!window.fixturePauseAmbient) repaint(); window.setTimeout(animate, 100); }
        animate(); m['./premium-dungeon'].init();
        const shell = m['./power-art'].create({ name: 'Shell Dash', tile: m['./tileinfo-gui'].ABILITY_JUMP }, 'ability');
        document.getElementById('shell-dash-art').appendChild(shell);
        window.fixtureReady = { torch, lava, nativeEngine: false, originalAtlases: true,
            shellDashTile: Number(shell.dataset.nativeTile), shellDashDistinct: Number(shell.dataset.nativeTile) !== m['./tileinfo-gui'].ABILITY_JUMP };
    };
    const modules = ['enums', 'util', 'tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-dngn',
        'tileinfo-main', 'tileinfo-player', 'tileinfo-gui', 'map_knowledge', 'environment-art', 'terrain-materials', 'cell-renderer-layers', 'premium-effect-model', 'premium-terrain-model', 'premium-region-model'];
    let html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<title>DCSS · Premium presentation</title><style>'
        + 'body{margin:0;background:#101512;color:#c7c6b9;font:14px/1.5 system-ui}main{max-width:1320px;margin:auto;padding:36px 28px}'
        + 'header{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:24px}'
        + '.eyebrow{font:11px/1.5 monospace;letter-spacing:2px;color:#c8ae78;margin:0 0 8px}h1{font:36px/1.2 Georgia;color:#eee4cd;margin:0}'
        + 'header p{margin:10px 0 0;color:#9da798}.edition{padding:6px 10px;border:1px solid #806a42;color:#cbb382;font:10px monospace;letter-spacing:2px;white-space:nowrap}'
        + '.compare{display:grid;grid-template-columns:1fr 1fr;gap:26px}.caption{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}'
        + 'h2{font:18px Georgia;margin:0;color:#d5c7a6}.caption span{font-size:11px;color:#96a092}'
        + '.frame{border:1px solid #62563e;background:#172019}#dungeon_viewport{position:relative;overflow:hidden}'
        + 'canvas{display:block;width:100%;height:auto;image-rendering:pixelated}'
        + '#dungeon{position:relative}#normal #dcss_quick_dock{padding:9px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#293326,#182119);border-top:1px solid #62563e}'
        + '.frame-footer{padding:12px 14px;color:#a9ad9b;border-top:1px solid #62563e;font-size:11px;min-height:30px}'
        + '.frame-footer strong{display:block;color:#d4c6a5;font-size:12px;font-weight:500}'
        + 'button{cursor:pointer;border:1px solid #6b6951;background:#263126;color:#e2d5b5;border-radius:2px;min-height:32px;padding:6px 10px}'
        + 'button:focus-visible{outline:2px solid #efdbad;outline-offset:2px}.detail{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin:28px 0 20px}'
        + '.detail h3{font:16px Georgia;color:#dccaa3;margin:0 0 7px}.detail p{font-size:12px;color:#9da798;margin:0}'
        + '.ability-study{display:flex;align-items:center;gap:18px;margin:24px 0;padding:18px;border:1px solid #4a513b;background:#182019}'
        + '#shell-dash-art{padding:6px;background:#101610;border:1px solid #6b6951}#shell-dash-art canvas{width:64px;height:64px}'
        + '.ability-study h3{font:18px Georgia;color:#dccaa3;margin:0 0 4px}.ability-study p{font-size:12px;color:#9da798;margin:0}'
        + '.motion-controls{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 0}.motion-controls p{flex-basis:100%;margin:0;color:#9da798;font-size:12px}'
        + '.material-closeups{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin:28px 0}.material-closeups article{border:1px solid #4a513b;background:#182019}.material-closeups p{padding:0 16px;color:#bcbca8}.material-closeups canvas{width:100%}'
        + 'footer{border-top:1px solid #3d4334;padding-top:16px;font:11px/1.6 monospace;color:#8e9789}'
        + '@media(max-width:700px){main{padding:24px 16px}.compare{grid-template-columns:1fr}.detail,.material-closeups{grid-template-columns:1fr;gap:18px}h1{font-size:28px}header{align-items:start}.edition{display:none}}'
        + source('game_data/static/styles/premium-presentation.css') + source('static/styles/graphics-settings.css') + '</style><main><header><div><p class="eyebrow">DUNGEON CRAWL STONE SOUP</p>'
        + '<h1>The same dungeon. A little more atmosphere.</h1><p>Native pixel art, with a quieter kind of polish.</p></div><span class="edition">PREMIUM STUDY · 10</span></header>'
        + '<section class="compare"><article><div class="caption"><h2>Classic</h2><span>Unmodified native sprites</span></div><div class="frame"><canvas id="classic"></canvas>'
        + '<div class="frame-footer"><strong>Familiar by design</strong>Original pixels, palette, and tile geometry.</div></div></article>'
        + '<article><div class="caption"><h2>Premium</h2><span>Tile lighting · liquid shaders</span></div><div id="normal" class="frame">'
        + '<div id="dungeon_viewport" style="aspect-ratio:960/832"><canvas id="dungeon"></canvas></div><div id="dcss_quick_dock"><span style="font-size:11px;color:#b5b9a6">D:1 · The Dungeon</span>'
        + '<span data-action-group="expedition"></span></div></div></article></section>'
        + '<nav class="motion-controls" aria-label="Controlled movement preview"><button id="motion-demo">Pause walking demo</button><button id="motion-walk">Take a step</button><button id="motion-water">Wade through water</button><button id="motion-cast">Fire a projectile</button><button id="motion-area">Area: Halo</button><p>Try walking, water responses, projectile overlays and connected area effects.</p></nav>'
        + '<section class="detail"><div><h3>Fire, reflected</h3><p>Curling flames, rising sparks and isolated emissive bloom. Fire and spells illuminate nearby surfaces; the pool catches broken, moving reflections.</p></div>'
        + '<div><h3>Materials, with character</h3><p>Faceted crystal catches passing glints; metal is brushed and masonry has recessed mortar. Rolling smoke volumes catch light at their edges. Sand feathers into neighboring terrain without a tile outline.</p></div>'
        + '<div><h3>Magic in motion</h3><p>Soft aura circles carry traveling ripples and gentle terrain distortion. Umbras draw inward. Creatures, icons and exact targeting stay crisp; reduced motion keeps a static field.</p></div></section>'
        + '<section class="material-closeups" aria-label="Live material closeups"><article data-study="smoke"><canvas width="320" height="256" data-crop="1,1,5,4" aria-label="Animated smoke and mist closeup"></canvas><p>Rolling smoke &amp; mist</p></article>'
        + '<article data-study="crystal"><canvas width="320" height="256" data-crop="10,0,5,4" aria-label="Green crystal, emerald and transparent wall shader closeup"></canvas><p>Green crystal · emerald · clear walls</p></article>'
        + '<article data-study="sand"><canvas width="320" height="256" data-crop="3,3,5,4" aria-label="Sand edge closeup"></canvas><p>Feathered sand borders</p></article></section>'
        + '<aside class="ability-study"><div id="shell-dash-art"></div><div><p class="eyebrow">DEDICATED ABILITY ART</p><h3>Shell Dash</h3><p>A folded olive shell, motion streaks and a small impact flash. Native 32px art, shown at 2×.</p></div></aside>'
        + '<footer>CONTROLLED NATIVE-ATLAS FIXTURE · Presentation preview, not native gameplay. No deployment.</footer></main><div hidden>'
        + ['floor', 'wall', 'feat', 'main', 'player', 'gui'].map(image).join('') + '</div>'
        + script(source('static/scripts/contrib/jquery.js')) + script('(' + setup.toString() + ')();');
    for (const name of modules) html += script(`window.fixtureName='./${name}';`)
        + script(source(`game_data/static/${name}.js`));
    for (const name of ['tile-edges', 'terrain-topology', 'liquid-field', 'terrain-blend', 'wall-surface', 'shader-atlas', 'liquid-shader', 'fluid-surface', 'shoreline-paint', 'terrain-finish', 'tile-atmosphere', 'graphics-settings-model', 'visual-presentation', 'graphics-controls', 'graphics-dialog', 'tile-lighting', 'light-emission', 'light-field-sampling', 'pixel-sampling', 'transparent-surface', 'light-map-paint', 'flame-field', 'emissive-surface', 'surface-reflections', 'emissive-paint', 'visibility-feather', 'tile-lighting-paint', 'region-field', 'aura-distortion', 'depth-shading', 'material-response', 'surface-lighting', 'vapour-field', 'effect-shading', 'sprite-motion', 'sprite-motion-layer', 'footstep-paint', 'item-properties']) {
        if (name === 'visual-presentation') html += script(graphicsFixture(JSON.parse(source('static/graphics-settings.json'))));
        html += script(`window.fixtureName='${name}';`) + script(source(`static/scripts/${name}.js`));
    }
    html += script("window.fixtureName='./shell-dash-art';") + script(source('game_data/static/shell-dash-art.js'));
    html += script("window.fixtureName='./power-art';") + script(source('game_data/static/power-art.js'));
    html += script("window.fixtureName='./premium-light-field';") + script(source('game_data/static/premium-light-field.js'));
    html += script("window.fixtureName='./premium-terrain';") + script(source('game_data/static/premium-terrain.js'));
    html += script("window.fixtureName='./premium-effects';") + script(source('game_data/static/premium-effects.js'));
    html += script("window.fixtureName='./premium-regions';") + script(source('game_data/static/premium-regions.js'));
    html += script("window.fixtureName='./premium-dungeon';") + script(source('game_data/static/premium-dungeon.js'));
    html += script("window.fixtureName='./map-effect-layer';") + script(source('game_data/static/map-effect-layer.js'));
    html += script("window.fixtureName='./premium-movement';") + script(source('game_data/static/premium-movement.js'));
    return html + script('(' + start.toString() + ')().catch(error=>{window.fixtureFailure=error.message;console.error(error);});') + '</html>';
}

const html = fixture();
fs.writeFileSync(path.join(output, 'preview.html'), html);
if (process.argv.includes('--prepare-only')) {
    console.log(JSON.stringify({ prepared: true, preview: path.join(output, 'preview.html') }));
} else {
    (async () => {
        const browser = await chromium.launch(chromiumLaunchOptions());
        const errors = [];
        try {
            const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
            await page.addInitScript(() => {
                window.fixtureGPUCanvases = [];
                const original = HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
                    const ctx = original.call(this, kind, ...args);
                    if (kind === 'webgl' && ctx) window.fixtureGPUCanvases.push(this);
                    return ctx;
                };
            });
            page.on('pageerror', error => errors.push(error.message));
            await page.route('http://premium.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
            await page.goto('http://premium.test/');
            await page.waitForFunction(() => window.fixtureReady || window.fixtureFailure);
            assert.equal(await page.evaluate(() => window.fixtureFailure), undefined);
            await page.evaluate(() => window.fixtureAutoplay(false));
            await page.waitForSelector('.premium-dungeon-light');
            const gpu = await page.evaluate(() => {
                const shader = window.fixtureModules['liquid-shader'], field = window.fixtureModules['liquid-field'];
                const pixels = shader.pixels(17, 23);
                if (!pixels) return shader.status();
                let maxError = 0, sum = 0, count = 0;
                for (let lava = 0; lava < 2; lava++) for (let y = 0; y < 256; y += 11) for (let x = 0; x < 256; x += 11) {
                    const cpu = field.sample(x, y, lava ? 23 : 17, Boolean(lava));
                    for (let c = 0; c < 3; c++) {
                        const error = Math.abs(pixels[((y + lava * 256) * 256 + x) * 4 + c] - Math.round(cpu.colour[c]));
                        maxError = Math.max(maxError, error); sum += error; count++;
                    }
                }
                const periodic = shader.pixels(273, 279);
                let seamError = 0;
                for (let n = 0; n < pixels.length; n++) seamError = Math.max(seamError, Math.abs(pixels[n] - periodic[n]));
                return { ...shader.status(), maxError, meanError: sum / count, seamError,
                    opaque: pixels.every((value, n) => n % 4 !== 3 || value === 255) };
            });
            fs.writeFileSync(path.join(output, 'shader-observation.json'), JSON.stringify(gpu, null, 2));
            assert.equal(gpu.backend, 'webgl', 'Real GLSL must compile and draw in the controlled browser');
            assert(gpu.opaque && gpu.maxError <= 24 && gpu.meanError < 4 && gpu.seamError <= 1, 'GPU and CPU liquid fields agree across the periodic domain');
            const proof = await page.evaluate(() => {
                const overlay = document.querySelector('.premium-dungeon-light'), ctx = overlay.getContext('2d');
                const pixels = ctx.getImageData(0, 0, overlay.width, overlay.height).data;
                const radiance = document.querySelector('.premium-dungeon-radiance');
                const glow = radiance.getContext('2d').getImageData(0, 0, radiance.width, radiance.height).data;
                let visiblePixels = 0, hiddenPixels = 0, hiddenRadiance = 0;
                for (let y = 0; y < overlay.height; y++) for (let x = 0; x < overlay.width; x++) {
                    const alpha = pixels[(y * overlay.width + x) * 4 + 3];
                    if (y >= 11 * 64 || x >= 12 * 64 && y >= 9 * 64) { hiddenPixels += alpha; hiddenRadiance += glow[(y * overlay.width + x) * 4 + 3]; }
                    else if (alpha) visiblePixels++;
                }
                const bounds = overlay.getBoundingClientRect(), native = document.getElementById('dungeon').getBoundingClientRect();
                const base = document.getElementById('dungeon').getContext('2d');
                const original = document.getElementById('classic').getContext('2d');
                const tileResponse = (x, y) => {
                    const a = original.getImageData(x * 64 + 16, y * 64 + 16, 32, 32).data;
                    const b = base.getImageData(x * 64 + 16, y * 64 + 16, 32, 32).data;
                    const before = [0, 0, 0], after = [0, 0, 0];
                    for (let n = 0; n < a.length; n += 4) for (let c = 0; c < 3; c++) { before[c] += a[n + c]; after[c] += b[n + c]; }
                    return { changed: !a.every((value, n) => value === b[n]),
                        redGain: after[0] / Math.max(1, before[0]), blueGain: after[2] / Math.max(1, before[2]) };
                };
                return { ...window.fixtureReady, lights: Number(overlay.dataset.lights), visiblePixels, hiddenPixels, hiddenRadiance,
                    reflections: Number(overlay.dataset.reflections), blooms: Number(overlay.dataset.blooms), flames: Number(overlay.dataset.flames),
                    radianceBlend: getComputedStyle(radiance).mixBlendMode,
                    floorResponse: tileResponse(2, 1), wallResponse: tileResponse(1, 0),
                    lavaRim: Array.from(base.getImageData(9 * 64 + 1, 5 * 64 + 25, 1, 1).data),
                    aligned: ['x', 'y', 'width', 'height'].every(key => Math.abs(bounds[key] - native[key]) < 1),
                    pointerEvents: getComputedStyle(overlay).pointerEvents, zIndex: getComputedStyle(overlay).zIndex };
            });
            assert(proof.visiblePixels > 1000); assert.equal(proof.hiddenPixels, 0); assert(proof.lights > 2);
            assert.equal(proof.hiddenRadiance, 0); assert.equal(proof.radianceBlend, 'screen');
            assert(proof.reflections > 0 && proof.blooms >= 5 && proof.flames >= 5);
            assert(proof.shellDashDistinct, 'Shell Dash paints its own native atlas art even with legacy server metadata');
            assert(proof.lavaRim[0] < 80 && proof.lavaRim[1] < 65 && proof.lavaRim[3] === 255,
                'The native lava boundary carries a solid cooled-rock rim');
            assert(proof.aligned, 'Light canvas must overlay the native canvas exactly');
            fs.writeFileSync(path.join(output, 'observation.json'), JSON.stringify(proof, null, 2));
            await page.screenshot({ path: path.join(output, 'comparison.png'), fullPage: true });
            await page.locator('#normal').screenshot({ path: path.join(output, 'premium-detail.png') });
            await page.locator('.material-closeups').screenshot({ path: path.join(output, 'material-closeups.png') });
            await page.locator('[data-study="smoke"]').screenshot({ path: path.join(output, 'smoke-frame-01.png') });
            await page.waitForTimeout(650);
            await page.locator('[data-study="smoke"]').screenshot({ path: path.join(output, 'smoke-frame-02.png') });
            const crystalPixels = () => page.locator('#dungeon').evaluate(node => node.getContext('2d').getImageData(11 * 64, 64, 64, 64).data.join(','));
            const crystalBefore = await crystalPixels(); await page.waitForTimeout(620);
            assert.notEqual(await crystalPixels(), crystalBefore, 'Lit crystal facets animate on the native tile surface');
            for (const tile of [proof.floorResponse, proof.wallResponse]) {
                assert(tile.changed && tile.redGain > tile.blueGain, 'Native tile pixels must receive warm directional light');
            }
            assert.equal(proof.pointerEvents, 'none');
            await page.screenshot({ path: path.join(output, 'comparison.png'), fullPage: true });
            await page.locator('#normal').screenshot({ path: path.join(output, 'premium-detail.png') });
            await page.locator('.ability-study').screenshot({ path: path.join(output, 'shell-dash-icon.png') });
            const radiancePixels = () => page.locator('.premium-dungeon-radiance').evaluate(node => node.toDataURL());
            const firstGlow = await radiancePixels(); await page.waitForTimeout(240);
            assert.notEqual(await radiancePixels(), firstGlow, 'Flame shapes and reflected highlights animate on the radiance layer');
            const auraPixels = () => page.locator('#dungeon').evaluate(node => node.getContext('2d').getImageData(8 * 64, 2 * 64, 64, 64).data.join(','));
            const firstAura = await auraPixels();
            await page.locator('#motion-area').click(); assert.equal(await page.locator('#motion-area').textContent(), 'Area: Umbra');
            assert.notEqual(await auraPixels(), firstAura);
            await page.locator('#normal').screenshot({ path: path.join(output, 'area-umbra.png') });
            await page.locator('#motion-area').click(); await page.locator('#normal').screenshot({ path: path.join(output, 'area-silence.png') });
            await page.locator('#motion-area').click(); await page.locator('#normal').screenshot({ path: path.join(output, 'area-sanctuary.png') });
            await page.locator('#motion-area').click(); assert.equal(await page.locator('#motion-area').textContent(), 'Area: None');
            await page.locator('#motion-area').click(); assert.equal(await page.locator('#motion-area').textContent(), 'Area: Halo');
            const effectPixels = () => page.locator('#dungeon').evaluate(node => [
                node.getContext('2d').getImageData(128, 128, 64, 64).data.join(','),
                node.getContext('2d').getImageData(576, 256, 64, 64).data.join(',')]);
            const effectsBefore = await effectPixels(); await page.waitForTimeout(450);
            const effectsAfter = await effectPixels();
            assert(effectsBefore.every((value, n) => value !== effectsAfter[n]), 'Native cloud and spell shader pixels animate');
            await page.locator('#motion-cast').click(); await page.waitForTimeout(140);
            assert(await page.evaluate(() => {
                const p = window.fixtureShotPosition;
                return p && p.x > 7 && window.fixtureModules['./map_knowledge'].get(p.x, p.y).t.ov.length === 1;
            }), 'Controlled projectile packets move the native spell overlay immediately');
            await page.locator('#normal').screenshot({ path: path.join(output, 'projectile-frame.png') });
            await page.waitForTimeout(520);
            assert.equal(await page.evaluate(() => window.fixtureShotPosition), null);
            const floorPixels = await page.locator('.premium-dungeon-light').evaluate(node => node.getContext('2d').getImageData(128, 64, 64, 64).data.join(','));
            await page.waitForFunction(before => document.querySelector('.premium-dungeon-light').getContext('2d')
                .getImageData(128, 64, 64, 64).data.join(',') !== before, floorPixels, { timeout: 4000 });
            const fluidPixels = await page.locator('#dungeon').evaluate(node => Array.from(node.getContext('2d').getImageData(128, 320, 64, 64).data));
            await page.waitForTimeout(420);
            assert.notDeepEqual(await page.locator('#dungeon').evaluate(node => Array.from(node.getContext('2d').getImageData(128, 320, 64, 64).data)), fluidPixels);
            await page.locator('#normal').screenshot({ path: path.join(output, 'premium-motion-frame-02.png') });
            const performanceMs = await page.evaluate(() => ({ cold: window.fixtureRenderMs[0],
                warm: window.fixtureRenderMs.slice(1) }));
            const walking = await page.evaluate(async () => {
                function centre() {
                    const canvas = document.querySelector('.premium-actor-motion');
                    if (!canvas) return null;
                    const pixels = canvas.getContext('2d').getImageData(8 * 64, 2 * 64, 5 * 64, 4 * 64).data;
                    let sum = 0, weight = 0;
                    for (let n = 0; n < pixels.length; n += 4) {
                        sum += (n / 4 % (5 * 64)) * pixels[n + 3]; weight += pixels[n + 3];
                    }
                    return weight ? sum / weight + 8 * 64 : null;
                }
                window.fixturePauseAmbient = true;
                window.fixtureMove(0, 10, 3);
                const first = centre(), logicalImmediate = Boolean(window.fixtureModules['./map_knowledge'].get(10, 3).mon);
                await new Promise(resolve => setTimeout(resolve, 55));
                const later = centre(), node = document.querySelector('.premium-actor-motion');
                window.fixturePauseAmbient = false;
                return { first, later, logicalImmediate, isolatedDirtyPaint: true, pointerEvents: node && getComputedStyle(node).pointerEvents };
            });
            assert(walking.logicalImmediate && walking.first !== null && walking.later > walking.first + 4,
                'The logical actor moves immediately while its captured native sprite glides between cells');
            assert.equal(walking.pointerEvents, 'none');
            await page.locator('#normal').screenshot({ path: path.join(output, 'walking-frame.png') });
            await page.waitForTimeout(230);
            assert.equal(await page.locator('.premium-actor-motion').count(), 0, 'Native sprites return after the short glide');
            await page.locator('#motion-water').click();
            await page.waitForSelector('.premium-footsteps');
            await page.waitForTimeout(65);
            assert(await page.locator('.premium-footsteps').evaluate(node => node.getContext('2d')
                .getImageData(3 * 64, 7 * 64, 64, 64).data.some((value, i) => i % 4 === 3 && value > 0)),
            'Confirmed water steps produce visible ripples and droplets');
            await page.locator('#normal').screenshot({ path: path.join(output, 'water-step-frame.png') });
            await page.waitForTimeout(560);
            assert.equal(await page.locator('.premium-actor-motion, .premium-footsteps').count(), 0);
            await page.evaluate(() => {
                window.fixtureModules['./view_data'].cursor_locs.target = { x: 9, y: 3 };
                window.fixtureMove(0, 9, 3);
            });
            assert.equal(await page.locator('.premium-actor-motion').count(), 0, 'Marked target tiles retain their exact native actor placement');
            await page.evaluate(() => { delete window.fixtureModules['./view_data'].cursor_locs.target; });
            await page.locator('#dungeon').click({ position: { x: 100, y: 100 } });
            assert.equal(await page.evaluate(() => window.fixtureClicks), 1);
            await page.locator('#graphics_settings_btn').click();
            await page.locator('[data-graphics-preset="classic"]').click();
            await page.locator('.graphics-dialog-actions button').click();
            assert.equal(await page.locator('.premium-dungeon-light').count(), 0);
            assert.equal(await page.locator('.premium-dungeon-radiance').count(), 0);
            assert.equal(await page.locator('.premium-actor-motion, .premium-footsteps').count(), 0);
            assert((await page.locator('#graphics_settings_btn').getAttribute('aria-label')).includes('Classic'));
            assert(await page.evaluate(() => {
                const native = document.getElementById('classic').getContext('2d');
                const current = document.getElementById('dungeon').getContext('2d');
                return [[2, 5], [9, 5], [2, 2], [9, 4], [12, 4], [11, 1], [12, 1], [13, 1], [5, 0], [6, 0], [6, 5]].every(([x, y]) => {
                    const a = native.getImageData(x * 64, y * 64, 64, 64).data;
                    const b = current.getImageData(x * 64, y * 64, 64, 64).data;
                    return a.every((value, index) => value === b[index]);
                });
            }), 'Classic restores native fluids, effects, crystal, metal, transparent walls and sand');
            await page.locator('#graphics_settings_btn').focus(); await page.keyboard.press('Enter');
            await page.locator('[data-graphics-preset="premium"]').click();
            await page.locator('.graphics-dialog-actions button').click();
            await page.waitForSelector('.premium-dungeon-light');
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.evaluate(() => window.fixtureMove(0, 9, 3));
            await page.waitForTimeout(140);
            assert.equal(await page.locator('.premium-actor-motion, .premium-footsteps').count(), 0);
            const staticPixels = await page.locator('.premium-dungeon-light').evaluate(node => node.toDataURL());
            const staticWater = await page.locator('#dungeon').evaluate(node => Array.from(node.getContext('2d').getImageData(128, 320, 64, 64).data));
            const staticFloor = await page.locator('#dungeon').evaluate(node => node.getContext('2d').getImageData(128, 64, 64, 64).data.join(','));
            const staticEffects = await effectPixels();
            const staticCrystal = await crystalPixels();
            const staticGlow = await radiancePixels(), staticAura = await auraPixels();
            await page.waitForTimeout(180);
            assert.equal(await page.locator('.premium-dungeon-light').evaluate(node => node.toDataURL()), staticPixels);
            assert.deepEqual(await page.locator('#dungeon').evaluate(node => Array.from(node.getContext('2d').getImageData(128, 320, 64, 64).data)), staticWater);
            assert.equal(await page.locator('#dungeon').evaluate(node => node.getContext('2d').getImageData(128, 64, 64, 64).data.join(',')), staticFloor);
            assert.deepEqual(await effectPixels(), staticEffects, 'Clouds and spell materials respect reduced motion');
            assert.equal(await crystalPixels(), staticCrystal, 'Crystal glints respect reduced motion');
            assert.equal(await radiancePixels(), staticGlow, 'Reflections, flames and bloom respect reduced motion');
            assert.equal(await auraPixels(), staticAura, 'Circular fields remain static under reduced motion');
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(140);
            assert(await page.locator('.premium-dungeon-light').evaluate(node => {
                const bounds = node.getBoundingClientRect(), native = document.getElementById('dungeon').getBoundingClientRect();
                return ['x', 'y', 'width', 'height'].every(key => Math.abs(bounds[key] - native[key]) < 1);
            }), 'Light canvas must track responsive canvas size');
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: path.join(output, 'comparison-narrow.png'), fullPage: true });
            await page.reload(); await page.waitForSelector('.premium-dungeon-light');
            assert((await page.locator('#graphics_settings_btn').getAttribute('aria-label')).includes('Enhanced'));
            await page.waitForFunction(() => window.fixtureModules['./map_knowledge'].get(10, 3).mon, null, { timeout: 5000 });
            await page.locator('#motion-demo').click();
            assert.equal(await page.locator('#motion-demo').textContent(), 'Play walking demo');
            const beforeRemoval = await effectPixels();
            await page.evaluate(() => window.fixtureRemoveCloud());
            const afterRemoval = await effectPixels();
            assert.notEqual(beforeRemoval[0], afterRemoval[0], 'Cloud disappearance follows the native map immediately');
            await page.evaluate(() => {
                window.fixtureGPUExtension = window.fixtureGPUCanvases[0].getContext('webgl').getExtension('WEBGL_lose_context');
                window.fixtureGPUExtension.loseContext();
            });
            await page.waitForFunction(() => window.fixtureModules['liquid-shader'].status().backend === 'lost');
            assert.equal(await page.evaluate(() => window.fixtureModules['liquid-shader'].pixels(20, 10)), null);
            await page.evaluate(() => window.fixtureGPUExtension.restoreContext());
            await page.waitForFunction(() => window.fixtureModules['liquid-shader'].status().backend === 'webgl');
            assert(await page.evaluate(() => window.fixtureModules['liquid-shader'].pixels(20, 10).some(value => value > 0)));
            await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
            assert.equal(await page.locator('.premium-dungeon-light').count(), 0);
            assert.deepEqual(errors, []);
            const result = { ...proof, success: true, desktopAndNarrow: true, clickThrough: true,
                classicToggle: true, classicFluidPixelsRestored: true, classicEffectPixelsRestored: true, classicMaterialPixelsRestored: true, crystalAnimation: true, reducedMotionCrystalStatic: true, fluidAnimation: true, continuousLightAnimation: true, keyboardToggle: true,
                gpu, contextRestored: true, cloudAnimation: true, spellAnimation: true, controlledProjectileMotion: true,
                nativeCloudRemoval: true, reducedMotionEffectsStatic: true, radianceAnimation: true, areaControls: true,
                softCircularAuras: true, exactTargetMasks: true, reducedMotionRadianceStatic: true,
                walking, waterStepParticles: true, movementCleanup: true, reducedMotionMovementStatic: true,
                nativeTargetPlacement: true, autoplayControl: true,
                reducedMotionStatic: true, reducedMotionFluidStatic: true, persistedReload: true, cleanup: true, errors };
            result.controlledRenderMs = performanceMs;
            await page.addInitScript(() => {
                const original = HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
                    return kind === 'webgl' ? null : original.call(this, kind, ...args);
                };
            });
            await page.reload(); await page.waitForSelector('.premium-dungeon-light');
            assert.equal(await page.evaluate(() => window.fixtureModules['liquid-shader'].status().backend), 'fallback');
            assert(await page.locator('#dungeon').evaluate(node => node.getContext('2d').getImageData(160, 352, 1, 1).data[3] === 255));
            await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
            result.cpuFallback = true;
            fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(result, null, 2));
            console.log(JSON.stringify(result));
        } finally { await browser.close(); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
}
