/* Headless frame-cost benchmark for the WebTiles dungeon renderer.
 * Loads the real client modules (cell renderer, layers, art direction, premium
 * pipeline, dungeon_renderer, display) with the real atlases, builds a 37x27
 * Retina view, and times synthetic frames per texture pack and presentation.
 * No engine process, server or account is involved. Not part of the default
 * test run; use it before and after renderer changes.
 *
 *   node tests/render-benchmark.cjs [webserver root] [iterations]
 *   BENCH_PROFILE=1 node tests/render-benchmark.cjs      # per-stage attribution
 *   BENCH_MODES=premium node tests/render-benchmark.cjs  # one presentation only
 *   RENDER_BENCH_OUT=/path/results.json                   # also write results
 *
 * Needs the generated tileinfo-*.js, status-icon-sizes.js and atlas PNGs in
 * game_data/static (a normal build produces them) and Playwright with Chrome.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const iterations = Number(process.argv[3] || 40);
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';

function fixtureHtml() {
    const setup = () => {
        window.assert = value => { if (!value) throw new Error('assertion'); };
        window.benchModules = { jquery: window.jQuery };
        const frames = []; let serial = 0;
        window.benchFrames = frames;
        window.requestAnimationFrame = callback => { frames.push({ id: ++serial, callback }); return serial; };
        window.cancelAnimationFrame = id => { const i = frames.findIndex(f => f.id === id); if (i >= 0) frames.splice(i, 1); };
        window.flushFrames = () => {
            let runs = 0;
            while (frames.length && runs < 8) {
                const pending = frames.splice(0, frames.length);
                pending.forEach(f => f.callback(performance.now()));
                runs++;
            }
            return runs;
        };
        window.define = (names, factory) => {
            if (typeof names === 'function') { factory = names; names = []; }
            window.benchModules[window.benchName] = factory(...names.map(name => {
                if (!(name in window.benchModules)) throw new Error('Missing dependency ' + name + ' for ' + window.benchName);
                return window.benchModules[name];
            }));
        };
        const $ = window.jQuery;
        $.toJSON = JSON.stringify;
        const settings = window.benchSettings = { tile_display_mode: 'tiles', tile_realtime_anim: true, tile_water_anim: true,
            tile_misc_anim: true, tile_filter_scaling: false, tile_show_demon_tier: false, tile_web_mouse_control: true,
            tile_cell_pixels: 32, tile_viewport_scale: 100, tile_map_scale: 60, tile_show_minihealthbar: true,
            tile_show_minimagicbar: true, tile_font_lbl_size: 0, tile_font_lbl_family: 'monospace', tile_window_col: { r: 255, g: 255, b: 255 },
            tile_map_pixels: 0 };
        const m = window.benchModules;
        m['./options'] = { ready: () => true, get: name => settings[name], set() {}, add_listener() {} };
        m.comm = { register_handlers() {}, send_message() {} };
        m.client = { is_watching: () => false, is_party_member: () => false, set_layer() {} };
        m.require = { toUrl: value => '/game_data/static/' + value.replace(/^\.\//, '') }; m['contrib/jquery.json'] = {};
        m['./game-context'] = { get_ui_state: () => 0, can_target: () => false, get_input_mode: () => 1 };
        m['./mouse_control'] = {};
        m['./encounter-banner'] = { attach() {} };
        m['./planned-route'] = { attach() {} };
        m['./player'] = { pos: { x: 40, y: 30 }, hp: 20, hp_max: 20, mp: 5, mp_max: 5, poison_survival: 20 };
        m['./monster_list'] = { update_loc() {}, update() {}, clear() {}, contacts: () => [] };
        m['./minimap'] = { center() {}, clear() {}, update() {}, update_overlay() {},
            do_view_center_update(x, y) { m['./dungeon_renderer'].set_view_center(x, y); } };
    };
    const modules = [];
    const scripts = ['idle-work', 'tooltip-policy', 'game-loading', 'tile-edges', 'terrain-topology', 'liquid-field', 'terrain-blend', 'wall-surface', 'shader-atlas',
        'liquid-shader', 'fluid-surface', 'shoreline-paint', 'terrain-finish', 'tile-atmosphere', 'graphics-settings-model', 'visual-presentation',
        'graphics-controls', 'graphics-dialog', 'tile-lighting', 'light-emission', 'light-field-sampling', 'pixel-sampling', 'transparent-surface',
        'light-map-paint', 'flame-field', 'emissive-surface', 'surface-reflections', 'emissive-paint', 'visibility-feather', 'tile-lighting-paint',
        'region-field', 'aura-distortion', 'depth-shading', 'material-response', 'sampled-lighting', 'surface-lighting', 'vapour-field', 'effect-shading', 'sprite-motion',
        'sprite-motion-layer', 'footstep-paint', 'image-grade', 'atlas-materials', 'weighted-cache', 'atlas-sprites', 'deferred-images', 'texture-pack', 'terrain-surface'];
    const game = ['enums', 'util', 'tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-dngn', 'tileinfo-main', 'tileinfo-player',
        'tileinfo-gui', 'tileinfo-icons', 'tileinfos', 'map_knowledge', 'view_data', 'environment-art', 'environment-materials', 'environment-sprites',
        'terrain-materials', 'native-tile-art', 'tile-art-direction', 'terrain-edges', 'environment-ground', 'status-icon-sizes', 'cell-renderer-glyphs',
        'cell-renderer-overlays', 'cell-renderer-layers', 'cell-renderer-textures', 'shell-animation', 'cell_renderer', 'chunked-view', 'sprite-reach',
        'party-model', 'encounter-banner', 'party-hover', 'traversal-effects', 'frame-update', 'chain-painter', 'chain-view', 'party-status-model', 'hero-feedback-model',
        'map-effect-layer', 'hero-feedback', 'encounter-feedback-model', 'encounter-feedback-paint', 'encounter-feedback', 'premium-effect-model',
        'premium-terrain-model', 'premium-region-model', 'premium-light-field', 'premium-terrain', 'premium-effects', 'premium-regions',
        'premium-movement', 'dungeon_renderer', 'premium-dungeon', 'display'];
    const graphicsFixture = require(path.join(root, 'tests/helpers/graphics-fixture.cjs'));
    let html = '<!doctype html><html><meta charset="utf-8"><title>bench</title><style>body{margin:0;background:#000}'
        + '#dungeon_viewport{position:relative;overflow:hidden}#right_column{position:fixed;right:0;top:0;width:300px}</style>'
        + '<div id="game"><div id="left_column"><div id="normal"><div id="dungeon_viewport"><canvas id="dungeon"></canvas></div></div></div>'
        + '<div id="right_column"></div></div><div hidden>'
        + '<img id="illustrated_materials" data-src="/static/tabletop/assets/painted-stone.png" alt="">'
        + '<img id="illustrated_wilds" data-src="/static/tabletop/assets/painted-wilds-v1.png" alt="">'
        + '<img id="illustrated_woodland" data-src="/static/tabletop/assets/woodland-sprites-v1.png" alt="">'
        + '<img id="illustrated_dungeon" src="/static/tabletop/assets/dungeon-features-v1.png" alt="">'
        + '<img id="illustrated_thresholds" data-src="/static/tabletop/assets/dungeon-thresholds-v1.png" alt="">'
        + '<img id="illustrated_beasts" data-src="/static/tabletop/assets/dungeon-beasts-v2.png" alt="">'
        + '<img id="illustrated_denizens" data-src="/static/tabletop/assets/dungeon-denizens-v1.png" alt="">'
        + '<img id="illustrated_lair" data-src="/static/tabletop/assets/lair-beasts-v1.png" alt="">'
        + '<img id="illustrated_hydras" data-src="/static/tabletop/assets/hydra-forms-v1.png" alt="">'
        + '<img id="illustrated_armour" data-src="/static/tabletop/assets/player-armour-v1.png" alt="">'
        + '<img id="illustrated_humans" data-src="/static/tabletop/assets/human-bases-v2.png" alt="">'
        + '<img id="illustrated_headwear" data-src="/static/tabletop/assets/headwear-v1.png" alt="">'
        + '<img id="illustrated_hair" data-src="/static/tabletop/assets/hair-overlays-v1.png" alt="">'
        + '<img id="illustrated_humanoids" data-src="/static/tabletop/assets/dungeon-humanoids-v1.png" alt="">'
        + '<img id="illustrated_elites" data-src="/static/tabletop/assets/dungeon-elites-v1.png" alt="">'
        + '<img id="illustrated_equipment" data-src="/static/tabletop/assets/held-equipment-v2.png" alt="">'
        + '<img id="illustrated_shields" data-src="/static/tabletop/assets/shield-variants-v1.png" alt="">'
        + '<img id="illustrated_melee" data-src="/static/tabletop/assets/held-melee-v1.png" alt="">'
        + '<img id="illustrated_weapon_forms" data-src="/static/tabletop/assets/held-weapon-forms-v1.png" alt="">'
        + '<img id="illustrated_ranged" data-src="/static/tabletop/assets/held-ranged-v2.png" alt="">'
        + ['floor', 'wall', 'feat', 'main', 'player', 'icons', 'gui'].map(n => `<img id="${n}" src="/game_data/static/${n}.png" alt="">`).join('')
        + '</div>' + script(source('static/scripts/contrib/jquery.js')) + script('(' + setup.toString() + ')();');
    for (const name of scripts) {
        if (name === 'visual-presentation') html += script(graphicsFixture(JSON.parse(source('static/graphics-settings.json'))).replace(/fixtureModules/g, 'benchModules'));
        html += script(`window.benchName='${name}';`) + script(source(`static/scripts/${name}.js`));
    }
    for (const name of game) html += script(`window.benchName='./${name}';`) + script(source(`game_data/static/${name}.js`));
    return html + '</html>';
}

const scenario = async (page, label, prepare, sampleCount = iterations) => {
    const result = await page.evaluate(async ([label, prepareSource, iterations]) => {
        const m = window.benchModules, renderer = m['./dungeon_renderer'], display = m['./display'], map = m['./map_knowledge'];
        const prepare = eval('(' + prepareSource + ')');
        const times = [], measured = {};
        let worst = null;
        const snapshot = () => { const out = {}; Object.keys(window.benchProf || {}).forEach(k => { out[k] = { ms: window.benchProf[k].ms, n: window.benchProf[k].n }; }); return out; };
        for (let i = 0; i < iterations + 5; i++) {
            const run = prepare(m, renderer, display, map, i);
            if (i === 5) window.benchProf = {};
            const before = snapshot();
            const started = performance.now();
            run();
            window.flushFrames();
            const elapsed = performance.now() - started;
            // Capture the same interval as elapsed, before idle warming or the next prepare().
            const after = snapshot();
            if (i >= 5) {
                const top = {};
                Object.keys(after).forEach(k => {
                    const previous = before[k] || { ms: 0, n: 0 };
                    const ms = after[k].ms - previous.ms, calls = after[k].n - previous.n;
                    if (ms || calls) {
                        const entry = measured[k] || (measured[k] = { ms: 0, n: 0 });
                        entry.ms += ms; entry.n += calls;
                    }
                    if (ms > 0.3) top[k] = Number(ms.toFixed(2)) + 'ms/' + calls;
                });
                times.push(elapsed);
                if (!worst || elapsed > worst.elapsed) worst = { elapsed: Number(elapsed.toFixed(2)), top };
            }
            // Yield between frames so idle-time cache warming can run as in a real session.
            if (window.benchYield) await new Promise(resolve => setTimeout(resolve, window.benchYield));
        }
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)], p90 = times[Math.floor(times.length * 0.9)];
        const prof = {};
        Object.keys(measured).forEach(k => { const e = measured[k]; prof[k] = Number((e.ms / iterations).toFixed(2)) + 'ms/' + Math.round(e.n / iterations); });
        return { label, median: Number(median.toFixed(3)), p90: Number(p90.toFixed(3)), min: Number(times[0].toFixed(3)),
            paint: renderer.last_paint, draws: window.benchDraws, prof, worst };
    }, [label, prepare.toString(), sampleCount]);
    return result;
};

const profileSetup = () => {
    const m = window.benchModules, renderer = m['./dungeon_renderer'];
    window.benchProf = {};
    function wrap(obj, name, label) {
        const original = obj[name];
        if (typeof original !== 'function') return;
        obj[name] = function () {
            const started = performance.now();
            try { return original.apply(this, arguments); }
            finally { const e = window.benchProf[label] || (window.benchProf[label] = { ms: 0, n: 0 }); e.ms += performance.now() - started; e.n++; }
        };
    }
    const proto = Object.getPrototypeOf(renderer);
    ['render_cell', 'draw_background', 'draw_foreground', 'draw_tile', 'render_party_overlays', 'render_cursors'].forEach(n => wrap(proto, n, n));
    wrap(m['./premium-terrain-model'], 'describe', 'terrain-model.describe');
    wrap(m['./premium-light-field'], 'forView', 'light-field.forView');
    wrap(m['./terrain-edges'], 'draw', 'terrain-edges.draw');
    wrap(m['./environment-ground'], 'draw', 'environment-ground.draw');
    wrap(m['./tile-art-direction'], 'image', 'art-direction.image');
    wrap(m['./cell-renderer-layers'], 'paintEffect', 'layers.paintEffect');
    wrap(m['./cell-renderer-layers'], 'paintRegion', 'layers.paintRegion');
    wrap(m['./cell-renderer-layers'], 'paintActor', 'layers.paintActor');
    wrap(m['./premium-effects'], 'animated', 'effects.animated');
    wrap(m['./premium-regions'], 'animated', 'regions.animated');
    wrap(m['./party-hover'], 'draw', 'party-hover.draw');
    wrap(m['./shell-animation'], 'draw', 'shells.draw');
    wrap(m['./chunked-view'], 'plan', 'chunks.plan');
    wrap(renderer, 'render_view', 'render_view');
    wrap(renderer, 'animate', 'animate');
    [['region-field', 'sample'], ['region-field', 'circle'], ['region-field', 'prepareCircle'], ['region-field', 'circlePixels'], ['region-field', 'create'], ['aura-distortion', 'displacement'], ['pixel-sampling', 'warpHalo'],
        ['effect-shading', 'shade'], ['effect-shading', 'prepare'], ['sampled-lighting', 'create'], ['sampled-lighting', 'apply'], ['surface-lighting', 'shade'], ['surface-lighting', 'prepare'], ['liquid-field', 'normals'],
        ['wall-surface', 'prepare'], ['terrain-blend', 'pixels'], ['depth-shading', 'paint'], ['transparent-surface', 'compose'], ['terrain-topology', 'describe'],
        ['tile-lighting', 'create'], ['emissive-paint', 'paint'], ['tile-atmosphere', 'paint'], ['light-map-paint', 'paint'], ['visibility-feather', 'paint'],
        ['tile-lighting-paint', 'paint'], ['tile-lighting-paint', 'paintRadiance'], ['emissive-surface', 'bloom'], ['flame-field', 'sample'], ['liquid-shader', 'pixels'], ['shoreline-paint', 'paint'], ['tile-edges', 'paint'], ['terrain-finish', 'create'], ['fluid-surface', 'create'], ['vapour-field', 'sample'], ['material-response', 'respond'], ['liquid-field', 'sample'], ['surface-reflections', 'sample'], ['texture-pack', 'illustrated'], ['visual-presentation', 'enabled']]
        .forEach(([mod, fn]) => wrap(m[mod], fn, mod + '.' + fn));
    const atlas = m['shader-atlas'], originalCreate = atlas.create;
    atlas.create = function () {
        const engine = originalCreate.apply(this, arguments);
        ['render', 'status'].forEach(n => wrap(engine, n, 'shader-atlas.engine.' + n));
        return engine;
    };
    ['getImageData', 'putImageData', 'drawImage', 'createImageData', 'clip', 'fillRect', 'fillText', 'measureText', 'createLinearGradient']
        .forEach(n => wrap(CanvasRenderingContext2D.prototype, n, 'ctx.' + n));
    wrap(HTMLCanvasElement.prototype, 'getContext', 'canvas.getContext');
    wrap(Element.prototype, 'getBoundingClientRect', 'dom.getBoundingClientRect');
    const frames = window.benchFrames;
    window.flushFrames = () => {
        let runs = 0;
        while (frames.length && runs < 8) {
            const pending = frames.splice(0, frames.length);
            pending.forEach(f => {
                const label = 'raf:' + (f.callback.name || f.callback.toString().replace(/\s+/g, ' ').slice(0, 50));
                const started = performance.now();
                f.callback(performance.now());
                const e = window.benchProf[label] || (window.benchProf[label] = { ms: 0, n: 0 }); e.ms += performance.now() - started; e.n++;
            });
            runs++;
        }
        return runs;
    };
};

module.exports = { fixtureHtml, runScenario: scenario };
if (require.main === module) (async () => {
    const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
    const browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
    try {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
    await page.route('http://bench.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: fixtureHtml() });
        const file = path.join(root, url.pathname);
        if (!fs.existsSync(file)) { console.log('404', url.pathname); return route.fulfill({ status: 404, body: 'missing' }); }
        const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });
    await page.goto('http://bench.test/');
    const missing = await page.evaluate(() => Object.keys(window.benchModules).filter(k => window.benchModules[k] === undefined));
    if (errors.length || missing.length) { console.log('load errors:', errors, 'undefined modules:', missing); }
    await page.evaluate(async () => {
        await Promise.all(Array.from(document.images).filter(image => image.getAttribute('src')).map(image => image.decode()));
        const m = window.benchModules, $ = window.jQuery;
        const tiles = m['./tileinfo-dngn'], main = m['./tileinfo-main'], player = m['./tileinfo-player'], enums = m['./enums'];
        $(document).trigger('game_init');
        const renderer = m['./dungeon_renderer'], map = m['./map_knowledge'];
        renderer.set_ui_state(0); window.benchYield = 4;
        renderer.set_view_center(40, 30);
        renderer.fit_to(1100, 800, 17);
        const cells = [];
        const items = ['SCROLL', 'POTION_RUBY', 'GOLD', 'DAGGER', 'ROBE', 'BOOK_ANIMAL_SKIN'].map(n => main[n]).filter(Number.isInteger);
        const monsters = ['MONS_ORC', 'MONS_KOBOLD', 'MONS_RAT', 'MONS_JACKAL', 'MONS_GOBLIN', 'MONS_OGRE', 'MONS_YAK', 'MONS_ADDER', 'MONS_BAT', 'MONS_HOBGOBLIN'].map(n => player[n]);
        let monsterId = 1;
        const count = (base) => tiles.tile_count(base);
        for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) {
            const wall = x % 12 === 0 || y % 9 === 0;
            const seen = Math.hypot(x - 40, y - 30) < 11;
            const remembered = !seen && Math.hypot(x - 40, y - 30) < 20;
            if (!seen && !remembered) continue;
            let bg;
            if (wall) bg = tiles.WALL_BRICK_DARK + (x * 3 + y * 7) % count(tiles.WALL_BRICK_DARK);
            else bg = tiles.FLOOR_GREY_DIRT + (x + y * 5) % count(tiles.FLOOR_GREY_DIRT);
            if (!wall && x >= 30 && x <= 34 && y >= 24 && y <= 27) bg = tiles.DNGN_DEEP_WATER + (x + y) % 2;
            if (!wall && x >= 45 && x <= 47 && y >= 32 && y <= 34) bg = tiles.DNGN_LAVA + (x + y) % 4;
            if (!wall && x >= 35 && x <= 36 && y >= 24 && y <= 27) bg = tiles.DNGN_SHALLOW_WATER;
            if (wall && (x + y) % 17 === 0) bg = tiles.WALL_BRICK_DARK_2_TORCH;
            if (wall && (x + y) % 23 === 0) bg = tiles.DNGN_CLOSED_DOOR;
            if (!wall && x === 44 && y === 26) bg = tiles.DNGN_STONE_STAIRS_DOWN;
            if (!wall && x === 36 && y === 34) bg = tiles.DNGN_BLUE_FOUNTAIN;
            const t = { bg: bg + (remembered ? 0x40000 : 0), flv: { f: tiles.FLOOR_GREY_DIRT + (x * 7 + y) % count(tiles.FLOOR_GREY_DIRT), s: (x * 31 + y * 17) % 256 } };
            const cell = { x, y, t, mf: wall ? enums.MF_WALL : enums.MF_FLOOR };
            if (seen && !wall && (x * 7 + y * 3) % 29 === 0 && items.length) t.fg = items[(x + y) % items.length];
            if (seen && !wall && (x * 5 + y * 11) % 37 === 0) {
                const mons = monsters[(x + y) % monsters.length];
                t.fg = mons; t.doll = [[mons, 32]];
                cell.mon = { id: monsterId++, name: 'monster', type: 1, att: 0, threat: 1 };
            }
            if (seen && !wall && x >= 42 && x <= 44 && y >= 31 && y <= 32) t.cloud = main.CLOUD_GREY_SMOKE;
            if (seen && !wall && x === 38 && y === 28) t.cloud = main.CLOUD_FIRE;
            if (seen && !wall && Math.hypot(x - 40, y - 30) <= 2.5) t.halo = enums.HALO_RANGE;
            if (x === 40 && y === 30) {
                t.fg = player.BASE_HUMAN;
                t.doll = [[player.BASE_HUMAN, 32], [player.LEG_PANTS_BLUE, 32], [player.BODY_LEATHER_ARMOUR, 32],
                    [player.HAIR_SHORT_BLACK, 32], [player.HAND1_SHORT_SWORD_SLANT, 32], [player.HAND2_BUCKLER, 32]];
            }
            cells.push(cell);
        }
        map.merge(cells);
        window.benchDraws = 0;
        const original = renderer.draw_tile;
        renderer.draw_tile = function () { window.benchDraws++; return original.apply(this, arguments); };
        const proto = Object.getPrototypeOf(renderer);
        const protoDraw = proto.draw_tile;
        proto.draw_tile = function () { window.benchDraws++; return protoDraw.apply(this, arguments); };
        m['./display'].display();
        window.flushFrames();
        window.benchDraws = 0;
        window.benchInfo = { cols: renderer.cols, rows: renderer.rows, cell: renderer.cell_width, canvas: [renderer.element.width, renderer.element.height], cells: cells.length };
    });
    if (process.env.BENCH_PROFILE) await page.evaluate(profileSetup);
    const info = await page.evaluate(() => window.benchInfo);
    console.log('view', JSON.stringify(info), 'errors', errors);
    const results = [];
    const run = async (label, prepare) => { const r = await scenario(page, label, prepare); results.push(r); console.log(JSON.stringify(r)); };
    const modes = [
        ['classic/classic', 'classic', 'classic'],
        ['illustrated/classic', 'illustrated', 'classic'],
        ['illustrated/premium', 'illustrated', 'premium'],
    ];
    for (const [name, pack, presentation] of modes) {
        if (process.env.BENCH_MODES && !name.includes(process.env.BENCH_MODES)) continue;
        await page.evaluate(async ([pack, presentation]) => {
            const m = window.benchModules;
            m['texture-pack'].bindUser('bench'); m['texture-pack'].select(pack);
            if (pack === 'illustrated') document.querySelectorAll('img[data-src]').forEach(image =>
                m['./tile-art-direction'].requestSheet(image.id));
            await Promise.all(Array.from(document.images).filter(image => image.getAttribute('src')).map(image => image.decode()));
            m['visual-presentation'].select(presentation);
            m['./premium-dungeon'].init();
            m['./display'].invalidate(true); m['./display'].display(); window.flushFrames(); window.flushFrames();
        }, [pack, presentation]);
        await run(name + ' full repaint', (m, renderer, display) => () => { display.invalidate(false); display.display(); });
        await run(name + ' hover 1 cell', (m, renderer, display, map, i) => () => { renderer.render_loc(35 + (i % 9), 26 + (i % 7)); });
        await run(name + ' animate tick', (m, renderer) => () => { renderer.animate(); });
        await run(name + ' packet 12 cells', (m, renderer, display, map, i) => () => {
            const changed = [];
            for (let n = 0; n < 12; n++) changed.push({ x: 33 + ((i + n * 3) % 14), y: 25 + ((i * 2 + n) % 10), t: { fg: 0 } });
            map.merge(changed); display.display();
        });
        await run(name + ' camera step', (m, renderer, display, map, i) => () => { renderer.set_view_center(40 + (i % 2), 30); display.display(); });
        await run(name + ' idle frame (no change)', (m, renderer, display) => () => { display.display(); });
    }
    const errorsNow = errors.slice();
    if (process.env.RENDER_BENCH_OUT) fs.writeFileSync(process.env.RENDER_BENCH_OUT, JSON.stringify({ info, results, errors: errorsNow }, null, 2));
    console.log('errors:', errorsNow.length ? errorsNow : 'none');
    if (errorsNow.length) throw new Error('Renderer reported browser errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
