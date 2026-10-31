/* Controlled canvas/HUD fixture using the real sizing, focus styles and zoom controls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const root = path.join(__dirname, '..');
const output = process.env.VIEWPORT_PROOF || '/tmp/dcss-viewport-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    const errors = [], evidence = [];
    try {
        for (const ratio of [1, 1.25, 2]) {
            const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: ratio });
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent('<!doctype html><main id="normal"><section id="left_column" style="position:relative">'
                + '<div id="party_turn_banner"></div><div id="dungeon_viewport"><canvas id="dungeon"></canvas></div>'
                + '<div id="dcss_quick_dock"><button class="dcss-dock-btn">Explore O</button></div>'
                + '<div id="hud_bottom_row"><div id="hud_bottom_map"><div id="hud_map_tools"></div></div>'
                + '<div id="message_pane">Viewport layout check · controlled renderer fixture</div></div></section>'
                + '<aside id="right_column"><div id="party_hud">Viewport layout check</div></aside></main>');
            for (const file of ['static/tabletop/tokens.css', 'static/tabletop/materials.css',
                ...['game-base', 'game-coop', 'tabletop-hud', 'gameplay-shell', 'hud-workspace', 'hud-polish', 'hud-reflow']
                    .map(name => 'game_data/static/styles/' + name + '.css')])
                await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
            await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
            await page.evaluate(() => {
                const $ = window.jQuery, noop = () => {};
                const settings = { tile_cell_pixels: 32, tile_viewport_scale: 100, tile_display_mode: 'tiles', tile_web_mouse_control: true };
                const game = { get_ui_state: () => 0, can_target: () => false,
                    set_view_zoom(value) { window.zoom = value; if (window.fitViewport) window.fitViewport(); return true; } };
                function Base() { this.set_cell_size(32, 32); }
                Base.prototype = {
                    set_cell_size(w, h) { this.cell_width = Math.floor(w); this.cell_height = Math.floor(h); },
                    scaled_size(w = this.cell_width, h = this.cell_height) {
                        return { width: Math.floor(w * devicePixelRatio), height: Math.floor(h * devicePixelRatio) };
                    },
                    init(element) { this.element = element; this.ctx = element.getContext('2d'); },
                    clear() { this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.element.width, this.element.height); },
                    render_cell(cx, cy, x, y) {
                        const cell = this.scaled_size();
                        this.ctx.fillStyle = (cx + cy) % 2 ? '#526d75' : '#3b5057';
                        this.ctx.fillRect(x, y, cell.width, cell.height);
                    }
                };
                window.modules = { jquery: $, comm: {}, './cell_renderer': { DungeonCellRenderer: Base },
                    './options': { get: key => settings[key], add_listener: noop },
                    './enums': { ui: { NORMAL: 0, VIEW_MAP: 2 }, CURSOR_MOUSE: 1 },
                    './view_data': { place_cursor(type, point) { window.cursor = point; }, remove_cursor: noop },
                    'tooltip-policy': { hover_ms: 450 },
                    './game-context': game, './map_knowledge': { get: () => ({ t: {} }) },
                    './sprite-reach': () => 1, './party-hover': { attach: noop, draw: noop, point: noop, leave: noop },
                    './traversal-effects': { attach: noop }, './shell-animation': { attach: noop },
                    './planned-route': { attach: noop }, './hero-feedback': { attach: noop }, './encounter-feedback': { attach: noop },
                    './status-icons': { icon: () => document.createTextNode('↔') } };
                window.define = (deps, factory) => { modules[window.moduleName] = factory(...deps.map(key => modules[key])); };
            });
            for (const name of ['util', 'dungeon_renderer', 'hud-layout', 'viewport-zoom']) {
                await page.evaluate(name => { window.moduleName = './' + name; }, name);
                await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
            }
            await page.evaluate(() => {
                const renderer = modules['./dungeon_renderer'], hud = modules['./hud-layout'];
                $(document).trigger('game_init'); renderer.ui_state = 0;
                window.fitViewport = () => {
                    const width = innerWidth - hud.sidebarWidth();
                    document.getElementById('left_column').style.width = width + 'px';
                    renderer.viewport_zoom = window.zoom || 1;
                    renderer.fit_to(width, innerHeight - hud.height() - hud.messageHeight(112), 17);
                    renderer.render_view();
                };
                modules['./viewport-zoom'].init();
                $('#hud_zoom_controls').appendTo('#hud_map_tools');
                fitViewport();
                window.viewportSnapshot = () => {
                    const rect = id => {
                        const r = document.getElementById(id).getBoundingClientRect();
                        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
                    };
                    const frame = rect('dungeon_viewport'), canvas = rect('dungeon');
                    const pixel = renderer.ctx.getImageData(renderer.element.width - 1, renderer.element.height - 1, 1, 1).data;
                    return { frame, canvas, dock: rect('dcss_quick_dock'), sidebar: rect('right_column'),
                        log: rect('hud_bottom_row'), lastPixel: Array.from(pixel),
                        overflow: document.documentElement.scrollWidth > innerWidth };
                };
            });
            for (const [width, height] of [[1280, 800], [1024, 768], [800, 600]]) {
                await page.setViewportSize({ width, height });
                await page.evaluate(() => fitViewport());
                const baseline = await page.evaluate(() => viewportSnapshot());
                for (const zoom of [.5, .75, 1, 1.25, 1.5, 2, 2.5, 3, 4]) {
                    const state = await page.evaluate(zoom => {
                        modules['./game-context'].set_view_zoom(zoom); return viewportSnapshot();
                    }, zoom);
                    assert.deepEqual(state.frame, baseline.frame, 'Zoom keeps fixed gameplay bounds');
                    assert.deepEqual(state.dock, baseline.dock, 'Zoom cannot move actions');
                    assert.deepEqual(state.log, baseline.log, 'Zoom cannot move the map/log panels');
                    assert(Math.abs(state.frame.right - state.sidebar.x) < 1);
                    assert(Math.abs(state.frame.bottom - state.dock.y) < 1);
                    assert(state.canvas.x <= state.frame.x - 11.9 && state.canvas.y <= state.frame.y - 11.9);
                    assert(state.canvas.right >= state.frame.right + 11.9 && state.canvas.bottom >= state.frame.bottom + 11.9);
                    assert.equal(state.overflow, false);
                    assert(state.lastPixel[0] > 0 && state.lastPixel[3] === 255, 'Full canvas is painted even at fractional DPR');
                    evidence.push({ ratio, width, height, zoom, ...state });
                }
            }
            await page.locator('#dungeon').focus();
            await page.keyboard.press('o');
            assert.equal(await page.locator('#dungeon').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
            await page.locator('#dcss_quick_dock button').focus();
            assert.equal(await page.locator('#dcss_quick_dock button').evaluate(el => getComputedStyle(el).outlineStyle), 'solid',
                'HUD controls retain visible keyboard focus');
            await page.locator('#hud_zoom_in').click();
            assert.equal(await page.evaluate(() => zoom), 1.25, 'Actual zoom button updates renderer');
            // A full notch clears accumulation even when CDP scales wheel
            // deltas by the device pixel ratio on Retina displays.
            await page.mouse.move(100, 100); await page.mouse.wheel(0, -120);
            try { await page.waitForFunction(() => zoom === 1.5, null, { timeout: 2000 }); }
            catch (error) {
                console.error(await page.evaluate(() => ({ zoom, target: document.elementFromPoint(100, 100)?.outerHTML,
                    frame: viewportSnapshot() })));
                await page.screenshot({ path: path.join(output, 'wheel-failure.png') });
                throw error;
            }
            const hit = await page.evaluate(() => {
                const frame = document.getElementById('dungeon_viewport').getBoundingClientRect();
                return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
            });
            await page.mouse.click(hit.x, hit.y);
            assert(await page.evaluate(() => Number.isFinite(cursor.x) && Number.isFinite(cursor.y)));
            if (ratio === 1) await page.screenshot({ path: path.join(output, 'viewport-zoom.png') });
            await page.close();
        }
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, cases: evidence.length, evidence }, null, 2));
        console.log(`Viewport browser passed: ${evidence.length} zoom/size/DPR cases, focus, controls and wheel.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
