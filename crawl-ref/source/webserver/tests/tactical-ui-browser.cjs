/* Controlled native-shaped snapshots through the real queue, rail and renderer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'), output = process.env.TACTICAL_PROOF || '/tmp/dcss-tactical-work/browser';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-accelerated-2d-canvas'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><main id="normal"><section id="left_column"><canvas id="dungeon"></canvas></section>'
            + '<aside id="party_hud"><h2>Expedition</h2><div id="party_hud_members"><article class="is-controlled-card"><strong>Rook</strong><p>Fighter · D:1 · Region 1</p>'
            + '<div style="height:12px;background:#528769">HP 24 / 24</div><p>Native turn order</p></article></div>'
            + '<div id="monster_list"><span class="group"><span class="name hostile">Old hostile row</span></span>'
            + '<span class="group is-unseen-warning"><span class="name hostile">Unseen threat warning</span></span></div></aside></main></body></html>');
        await page.addStyleTag({ content: 'body{margin:0;background:#0d1318;color:#e9d5af;font:14px Georgia}#normal{display:flex;gap:12px;padding:20px}'
            + '#left_column{position:relative;flex:1;min-width:0}#dungeon{width:100%;height:auto;background:#111}'
            + '#party_hud{width:300px;flex:0 0 300px;background:#222a30;padding:10px;box-sizing:border-box}h2{font-size:18px}'
            + '.is-controlled-card{padding:12px;border:1px solid #ac965f;min-height:140px}.plan-tools button{font-size:12px}'
            + '@media(max-width:700px){#normal{flex-direction:column;padding:6px}#party_hud{width:100%;flex-basis:auto}}' });
        for (const name of ['party-initiative', 'enemy-initiative', 'tactical-planner'])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'game_data/static/styles', name + '.css'), 'utf8') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const $ = window.jQuery, noop = () => {};
            window.sent = []; window.inputMode = 1; window.watching = false;
            window.modules = { jquery: $, 'contrib/jquery.json': {}, client: { is_watching: () => window.watching },
                key_conversion: { codes: {} }, './game-context': { get_ui_state: () => 0, get_input_mode: () => window.inputMode },
                './enums': { ui: { NORMAL: 0 }, mouse_mode: { COMMAND: 1 }, prepare_bg_flags: value => typeof value === 'object' ? value : { value } },
                './util': { make_key: (x, y) => x + 128 + (y + 128) * 256 },
                './options': { get: () => false, add_listener: noop }, './tileinfo-dngn': { basetile: value => value },
                './view_data': {}, './mouse_control': {}, 'tooltip-policy': {}, './party-hover': { attach: noop, draw: noop },
                './traversal-effects': { attach: noop }, './shell-animation': { attach: noop }, './sprite-reach': () => 3,
                './portrait-status': {}, './status-icons': { icon: () => { const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.classList.add('tt-icon'); return icon; } },
                './workflow-actions': { reason: hero => hero.can_act === false ? 'Recovery' : '', setPlanning: noop } };
            function Base() { this.set_cell_size(20, 20); }
            Base.prototype = { set_cell_size(w, h) { this.cell_width = w; this.cell_height = h; },
                init(element) { this.element = element; this.ctx = element.getContext('2d'); },
                scaled_size(w, h) { return { width: (w === undefined ? this.cell_width : w) * devicePixelRatio,
                    height: (h === undefined ? this.cell_height : h) * devicePixelRatio }; },
                clear() { this.ctx.fillStyle = '#11171b'; this.ctx.fillRect(0, 0, this.element.width, this.element.height); },
                render_cell(cx, cy, x, y, cell) {
                    const unit = this.scaled_size().width;
                    this.ctx.fillStyle = (cx + cy) % 2 ? '#273139' : '#2b363e'; this.ctx.fillRect(x, y, unit, unit);
                    if (cell.t && cell.t.actor) {
                        this.ctx.fillStyle = '#d4a56a88'; this.ctx.fillRect(x - unit, y - unit * 1.5, unit * 2, unit * 2.5);
                    }
                } };
            window.modules['./cell_renderer'] = { DungeonCellRenderer: Base };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
        });
        for (const [name, file] of [['comm', 'static/scripts/comm.js'], ...['frame-update', 'party-model', 'map_knowledge', 'route-plan',
            'tactical-planner', 'party-initiative', 'enemy-initiative', 'planned-route', 'chunked-view', 'dungeon_renderer'].map(name => ['./' + name, 'game_data/static/' + name + '.js'])]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            const $ = window.jQuery, map = modules['./map_knowledge'];
            window.socket = { readyState: 1, send: text => window.sent.push(JSON.parse(text)) };
            window.crawl_party = { state: { enabled: true, multiplayer: true, controlled_slot: 0, world_aut_clock: 10,
                combat_locked: true, plan_acknowledgements: true, floor: 'D:1', members: [{ slot: 0, name: 'Rook', alive: true, hp: 24, hp_max: 24,
                    turns: 0, place: 'D:1', pos: { x: 5, y: 8 }, aut_clock: 10, can_act: false, on_same_level: true }],
                enemy_initiative: [{ id: 1, name: 'Orc warrior', x: 14, y: 8, energy_deficit: 3, speed: 10, ready: false },
                    { id: 2, name: 'Adder', x: 15, y: 9, energy_deficit: 0, speed: 15, ready: true }] } };
            const initialState = window.crawl_party.state;
            window.crawl_party.state = null;
            $(document).trigger('game_init');
            window.crawl_party.state = initialState;
            $(document).trigger('party_state_rendered', [initialState]);
            const cells = [];
            for (let y = -4; y < 38; y++) for (let x = -4; x < 48; x++) cells.push({ x, y, route_safe: true, t: { bg: 0 } });
            map.merge(cells); map.dirty().forEach(point => { map.get(point.x, point.y).dirty = false; }); map.reset_dirty();
            const renderer = modules['./dungeon_renderer'], canvas = document.getElementById('dungeon');
            canvas.width = 1600; canvas.height = 1200; renderer.cols = 40; renderer.rows = 30;
            renderer.render_view();
            $('#party_hud').append(modules['./party-initiative'].createMonster());
            modules['./enemy-initiative'].init();
            modules['./tactical-planner'].click({ which: 1, shiftKey: true, cell: { x: 10, y: 8 }, preventDefault() {} });
        });
        await page.waitForTimeout(50);
        assert.equal(await page.locator('.plan-actions button').count(), 5);
        assert.equal(await page.locator('.planned-route').count(), 1);
        assert.equal(await page.locator('.enemy-timing').count(), 2);
        assert.equal(await page.getByText('Old hostile row', { exact: true }).isVisible(), false);
        assert(await page.getByText('Unseen threat warning', { exact: true }).isVisible());
        assert.equal(await page.locator('#party_progress_monsters').evaluate(el => el.closest('#enemy_initiative_rail') !== null), true);
        assert(await page.locator('#enemy_initiative_rail').evaluate(el => el.getBoundingClientRect().right
            <= document.querySelector('.is-controlled-card').getBoundingClientRect().left));
        await page.locator('[data-plan=run]').click();
        assert.equal(await page.evaluate(() => sent.length), 0, 'Go waits on native recovery');
        await page.evaluate(() => { crawl_party.state.members[0].can_act = true; jQuery(document).trigger('party_state_rendered', [crawl_party.state]); });
        assert.equal(await page.evaluate(() => sent.length), 1);
        await page.evaluate(() => {
            const hero = crawl_party.state.members[0]; hero.turns++; hero.pos.x++;
            jQuery(document).trigger('party_state_rendered', [crawl_party.state]);
            jQuery(document).trigger('game_command_boundary', [sent.at(-1).plan_id, hero.turns]);
        });
        assert.equal(await page.evaluate(() => sent.length), 2, 'Next acknowledged step advances once');
        await page.screenshot({ path: path.join(output, 'desktop-plan-and-enemies.png') });
        await page.locator('[data-plan=clear]').click();
        const pixelProof = await page.evaluate(() => {
            const renderer = modules['./dungeon_renderer'], map = modules['./map_knowledge'];
            const resetDirty = () => { map.dirty().forEach(point => { map.get(point.x, point.y).dirty = false; }); map.reset_dirty(); };
            const compare = () => {
                const ctx = renderer.ctx, actual = ctx.getImageData(0, 0, renderer.element.width, renderer.element.height).data;
                const paint = renderer.last_paint; renderer.render_view();
                const expected = ctx.getImageData(0, 0, renderer.element.width, renderer.element.height).data;
                let differences = 0; for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) differences++;
                return { differences, paint };
            };
            map.merge([{ x: 7, y: 7, t: { actor: true } }]); renderer.render_view(map.dirty()); resetDirty();
            const first = compare();
            map.merge([{ x: 7, y: 7, t: { actor: false } }, { x: 8, y: 8, t: { actor: true } }]);
            renderer.render_view(map.dirty()); resetDirty(); const seam = compare();
            renderer.set_view_center(24, 17); renderer.render_view([]); const camera = compare();
            return { first, seam, camera };
        });
        for (const sample of Object.values(pixelProof)) assert.equal(sample.differences, 0, 'Chunk pixels match a complete repaint');
        assert(pixelProof.seam.paint.cells < 1200, 'Localized repaint skips unrelated cells');
        assert(pixelProof.camera.paint.full, 'Camera changes invalidate the entire viewport');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(50);
        assert(await page.locator('#enemy_initiative_rail').evaluate(el => el.classList.contains('is-compact')));
        assert(await page.locator('#enemy_initiative_rail').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
        await page.screenshot({ path: path.join(output, 'narrow-plan-and-enemies.png') });
        await page.evaluate(() => {
            crawl_party.state.enemy_initiative = []; jQuery(document).trigger('party_state_rendered', [crawl_party.state]);
        });
        assert.equal(await page.locator('.enemy-timing').count(), 0, 'Unseen enemies leave no stale live readings');
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ passed: true, controlledSnapshots: true,
            errors, pixelProof, narrowLayout: true, dpr: 2 }, null, 2));
        console.log(JSON.stringify({ passed: true, output, pixelProof }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
