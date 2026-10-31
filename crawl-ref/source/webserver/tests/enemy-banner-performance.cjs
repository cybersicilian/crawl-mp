/* Controlled browser proof of the real banner UI with a large native-shaped roster. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const verifyGroups = require('./helpers/creature-roster-browser.cjs');
const root = process.env.BANNER_STATIC_ROOT || path.resolve(__dirname, '../game_data/static');
const output = process.env.BANNER_PERFORMANCE_PROOF_DIR || '/tmp/dcss-banner-performance';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });
    const errors = [], evidence = { controlledPresentation: true, rosterSize: 500 };
    page.on('pageerror', error => errors.push(error.message));
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    try {
        await page.route('http://banner.test/**', route => {
            if (new URL(route.request().url()).pathname.endsWith('enemy-banner-stitches.svg'))
                return route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'styles/enemy-banner-stitches.svg')) });
            return route.fulfill({ contentType: 'text/html', body: '<main id="normal"><aside id="party_hud" style="position:fixed;right:0;top:60px;width:260px">'
                + '<div class="is-controlled-card" style="height:150px">Player</div></aside>'
                + '<div id="party_doom_meter" style="position:fixed;right:270px;top:60px;width:30px;height:500px">Zot</div></main>' });
        });
        await page.goto('http://banner.test/');
        await page.addStyleTag({ content: 'body { background:#171c17; color:#e3d1b1; --tt-font-ui:system-ui,sans-serif; --tt-font-title:Georgia,serif; --tt-font-mono:monospace; }' });
        for (const name of ['enemy-initiative', 'party-card-status'])
            await page.addStyleTag({ path: path.join(root, 'styles', name + '.css') });
        const statusStyle = ['status-icons.css', 'properties.css']
            .map(name => path.resolve(root, '../../static/tabletop', name)).find(file => fs.existsSync(file));
        assert(statusStyle, 'A shared status-icon stylesheet is present');
        await page.addStyleTag({ path: statusStyle });
        await page.addScriptTag({ path: path.resolve(root, '../../static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPaints = []; window.qaAllocations = 0; window.qaQueries = 0; window.qaMutations = [];
            const original = Element.prototype.querySelectorAll;
            Element.prototype.querySelectorAll = function (selector) {
                if (selector === '.enemy-timing') ++window.qaQueries;
                return original.call(this, selector);
            };
            const cursor_locs = {};
            window.qaContacts = [];
            window.modules = { jquery: window.jQuery,
                './monster_list': { contacts: () => window.qaContacts },
                './party-initiative': { createMonster: () => window.jQuery('<span id="party_progress_monsters" hidden></span>'), updateMonster() {} },
                './party-model': { controlledSlot: () => 0 },
                './view_data': { cursor_locs, place_cursor: (key, value) => { cursor_locs[key] = value; }, remove_cursor: key => { delete cursor_locs[key]; } },
                './enums': { CURSOR_MOUSE: 'mouse' }, './map_knowledge': { get: () => ({ t: {} }) },
                './tileinfo-main': { UNSEEN_INVISIBLE: 1 },
                './util': { init_canvas(canvas, width, height) { canvas.width = width; canvas.height = height; } },
                './dungeon-context-menu': { open(event, options) { window.qaMenu = { cell: event.cell, options }; } },
                'item-properties': { describe: () => ({ kind: 'unknown' }), icon(name) {
                    const icon = document.createElement('span'); icon.className = 'tt-icon'; icon.dataset.uiIcon = name; return icon;
                } },
                './cell_renderer': { DungeonCellRenderer: class {
                    constructor() { ++window.qaAllocations; }
                    init(canvas) { this.canvas = canvas; }
                    clear() { this.canvas.getContext('2d').clearRect(0, 0, 32, 32); }
                    render_cell(x, y) {
                        window.qaPaints.push({ x, y });
                        const ctx = this.canvas.getContext('2d'); ctx.fillStyle = '#c9a56b'; ctx.fillRect(4, 4, 24, 24);
                    }
                    draw_main() { window.qaPaints.push({ remembered: true }); }
                } }
            };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name])); };
        });
        for (const name of ['frame-update', 'indexed-paint', 'party-status-model', 'enemy-banner-model', 'creature-roster-model', 'collapsible-roster', 'status-icons', 'enemy-initiative']) {
            await page.evaluate(name => { window.moduleName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, name + '.js') });
        }
        await page.evaluate(() => {
            window.qaState = { floor: 'D:1', members: [{ slot: 0, name: 'Player' }], enemy_initiative:
                Array.from({ length: 500 }, (_, index) => ({ id: index + 1, name: 'Orc ' + index, x: index, y: 0,
                    perception: 'visible', energy_deficit: 4, speed: 10, damage_level: 2,
                    health: 'moderately wounded', statuses_known: true, statuses: [] })) };
            window.crawl_party = { state: window.qaState };
            window.modules['./enemy-initiative'].init();
        });
        await page.waitForFunction(() => window.qaPaints.length > 0);
        await settle();
        evidence.initial = await page.evaluate(() => ({ paints: window.qaPaints.length, allocations: window.qaAllocations, queries: window.qaQueries }));
        assert(evidence.initial.allocations < 24, 'Renderer allocation follows the visible rail, not all500 enemies');
        const banners = page.locator('.enemy-timing');assert.equal(await banners.count(), 500);
        assert.equal(await banners.first().locator('small').textContent(), 'Recovering');
        await page.evaluate(() => {
            new MutationObserver(records => window.qaMutations.push(...records)).observe(document.querySelector('.enemy-timing-list'),
                { attributes: true, childList: true, characterData: true, subtree: true });
            window.qaPaints = []; window.qaQueries = 0;
        });
        evidence.unchanged = await page.evaluate(() => {
            const durations = [];
            for (let index = 0; index < 30; ++index) {
                const start = performance.now(); window.modules['./enemy-initiative'].update(structuredClone(window.qaState));
                durations.push(performance.now() - start);
            }
            return { durationsMs: durations };
        });
        await settle();
        Object.assign(evidence.unchanged, await page.evaluate(() => ({ paints: window.qaPaints.length, queries: window.qaQueries, mutations: window.qaMutations.length })));
        assert.equal(evidence.unchanged.queries, 0, 'Stable-ID lookup never scans all banner nodes');
        assert.equal(evidence.unchanged.paints, 0);assert.equal(evidence.unchanged.mutations, 0);
        await page.evaluate(() => {
            window.qaState.enemy_initiative[0].energy_deficit = 5;
            window.modules['./enemy-initiative'].update(window.qaState);
        });
        await settle();
        assert.equal(await banners.first().locator('.enemy-timing-track i').evaluate(node => node.style.width), '50%');
        assert.equal(await page.evaluate(() => window.qaPaints.length), 0, 'Energy changes do not redraw an unchanged portrait');
        await page.evaluate(() => window.jQuery(document).trigger('dungeon_tiles_changed', [[{ x: 0, y: 0 }, { x: 900, y: 0 }]]));
        await settle();assert.equal(await page.evaluate(() => window.qaPaints.length), 1);
        await banners.first().hover();
        assert.deepEqual(await page.evaluate(() => window.modules['./view_data'].cursor_locs.mouse), { x: 0, y: 0 });
        await banners.first().click({ button: 'right' });
        assert(await page.evaluate(() => window.qaMenu.options.valid()));
        await page.evaluate(() => {
            window.qaState.enemy_initiative[0].x = 700; window.modules['./enemy-initiative'].update(window.qaState);
        });
        assert.equal(await page.evaluate(() => window.qaMenu.options.valid()), false, 'An old menu cannot target a moved monster');
        await banners.first().focus();
        await page.evaluate(() => {
            Object.assign(window.qaState.enemy_initiative[0], { statuses: [
                { text: 'fast', is_bad: false }, { text: 'confused', is_bad: true }] });
            window.modules['./enemy-initiative'].update(window.qaState);
        });
        assert.equal(await banners.first().locator('.party-effect').count(), 2);
        assert.equal(await banners.first().locator('.party-effect[tabindex]').count(), 0);
        assert.equal(await banners.first().evaluate(node => node === document.activeElement), true,
            'Regrouping after an effect change preserves keyboard focus');
        await page.screenshot({ path: path.join(output, 'soft-banners-large-roster.png') });
        await page.evaluate(() => { window.qaPaints = []; const rail = document.querySelector('#enemy_initiative_rail'); rail.scrollTop = rail.scrollHeight; });
        await page.waitForFunction(() => window.qaPaints.some(point => point.x === 499));
        evidence.scrollPaints = await page.evaluate(() => window.qaPaints.length);
        assert(evidence.scrollPaints < 24, 'Scrolling lazily paints the newly visible slice');
        evidence.groups = await verifyGroups(page, settle, output);
        await page.evaluate(() => { window.jQuery(document).trigger('game_cleanup'); });
        await settle();assert.equal(await page.locator('.enemy-timing').count(), 0);
        assert.deepEqual(errors, []);evidence.passed = true;
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png') });throw error; }
    finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
