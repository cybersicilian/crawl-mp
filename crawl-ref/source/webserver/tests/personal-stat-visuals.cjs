/* Native stat rendering and controlled-card layout contracts; no game action runs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.PERSONAL_STATS_PROOF_DIR || '/tmp/dcss-personal-stat-proof';
async function main() {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 620, height: 500 } });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><main id="normal"><div id="hud_sidebar_scroll">'
            + fs.readFileSync(path.join(root, 'game_data/templates/character-sheet.html'), 'utf8')
            + '<div id="party_hud_members"><article class="party-card is-controlled-card" data-party-slot="0">'
            + '<button class="party-member-name">Moss</button><div class="party-faith" data-tip-faith-base="Faith base"></div>'
            + '<div class="party-member-state" role="progressbar" data-tip-body="23% to the next experience level."></div>'
            + '<div class="party-bars"><div class="party-bar-wrap hp-track"></div><div class="party-bar-wrap mp-track"></div></div>'
            + '</article></div></div></main></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/materials.css', 'static/tabletop/properties.css',
            'game_data/static/styles/game-base.css', 'game_data/static/styles/gameplay-shell.css',
            'game_data/static/styles/hud-reflow.css', 'game_data/static/styles/personal-stat-visuals.css'])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.addStyleTag({ content: ':root{--color-7:#d4d5cb;--color-8:#777e85;--color-5:#d695cf;--color-12:#efaaa0;--color-14:#e1c57b;--color-2:#7ac480}body{margin:20px;background:#080b10}#normal{width:300px}.party-card{display:block!important}#party_hud_gold{display:none}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery,
                './options': { get: key => key === 'show_game_time' ? true : key === 'always_show_doom_contam' ? false : [] },
                './util': { formatted_string_to_html: text => text } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep]));
            };
            window.fixturePlayer = {
                name: 'Moss', title: 'the Warrior', species_display_name: 'Human', species: 'Human', god: 'Zin',
                piety_rank: 3, ostracism_pips: 0, hp: 12, hp_max: 20, real_hp_max: 24, poison_survival: 7,
                mp: 3, mp_max: 6, xl: 7, progress: 23, ac: 6, ev: 8, sh: 4, ac_mod: -2, ev_mod: 0, sh_mod: 0,
                str: 14, str_max: 14, int: 8, int_max: 8, dex: 12, dex_max: 12, adjusted_noise: 375,
                time: 150, turn: 12, time_delta: 10, depth: 2, place: 'Dungeon', status: [], doom: 0, contam: 0,
                weapon_index: 0, offhand_index: -1, offhand_weapon: false, weapon_colour: 2,
                inv: { 0: { name: '+1 war axe' } }, quiver_desc: 'Nothing quivered',
                has_status: () => false, index_to_letter: n => n < 0 ? '-' : String.fromCharCode(97 + n),
                inventory_item_desc: () => window.jQuery('<span>+1 war axe</span>')
            };
            window.inspections = [];
            window.crawl_party = { state: { members: [{ slot: 0, name: 'Moss', god: 'Zin' }] },
                open_inspector: (...args) => window.inspections.push(args) };
            window.originalNativeStats = document.getElementById('stats');
            window.originalAC = document.getElementById('stats_ac');
        });
        for (const [name, file] of [['item-properties', 'static/scripts/item-properties.js'],
            ['character-stat-help', 'static/scripts/character-stat-help.js'],
            ['./status-icons', 'game_data/static/status-icons.js'], ['./player-stat-tips', 'game_data/static/player-stat-tips.js'],
            ['./player-hud', 'game_data/static/player-hud.js'], ['./player-card-details', 'game_data/static/player-card-details.js']]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.renderNativeStats = window.modules['./player-hud'].create(window.fixturePlayer);
            window.renderNativeStats(); window.jQuery(document).trigger('player_state_changed');
        });
        assert.equal(await page.locator('.personal-stat-reading').count(), 6);
        assert.equal(await page.locator('#stats_ac').textContent(), '6');
        assert(await page.locator('#stats_ac').evaluate(node => node.classList.contains('degenerated_defense')));
        assert.equal(await page.locator('.personal-stat-reading [role="meter"]').count(), 0, 'Unbounded stats never get invented capacity bars');
        assert.equal(await page.locator('.party-self-details [role="progressbar"]').count(), 0, 'XP belongs in the shared player level bar');
        assert.equal(await page.locator('#stats_time').isVisible(), false);
        assert.match(await page.locator('.party-member-state').getAttribute('data-tip-body'), /23%.*Total turns: 12.*Total elapsed time: 15\.0.*Last action duration: 1\.0/s);
        assert.equal(await page.locator('#stats_quiver_line .tt-icon').getAttribute('data-ui-icon'), 'quiver');
        assert.equal(await page.locator('#stats_noise .tt-icon').getAttribute('data-ui-icon'), 'noise');
        assert.equal(await page.locator('#stats_noise').getAttribute('aria-valuenow'), '37.5');
        assert.match(await page.locator('#stats_noise').getAttribute('aria-label'), /loud/);
        assert.match(await page.locator('.hp-track').getAttribute('data-tip-body'), /Projected HP.*7 HP.*reduced from 24 to 20/s);
        assert.match(await page.locator('.party-faith').getAttribute('data-tip-body'), /Faith base.*3\/6 stars/s);
        for (const id of ['stats_hpline', 'stats_mpline', 'stats_xl', 'stats_place', 'stats_weapon', 'stats_quiver', 'stats_species_god', 'stats_piety'])
            assert.equal(await page.locator('#' + id).isVisible(), false, id + ' is available via its compact source instead of duplicated text');
        assert.equal(await page.locator('.party-self-details .stats_caption:visible').count(), 0);
        assert(await page.locator('.hud-stats-details').evaluate(node => node.getBoundingClientRect().width >= 270), 'Native floated vital bars cannot squeeze the personal stat grid');
        assert(await page.locator('.personal-stat-context').evaluate(row => {
            const noise = row.querySelector('#stats_noise').getBoundingClientRect();
            const actions = [...row.querySelectorAll('.personal-equipment')].filter(node => node.offsetWidth)
                .map(node => node.getBoundingClientRect());
            return noise.width > row.clientWidth * 0.7 && actions.length === 2
                && actions.every(action => Math.abs(action.y + action.height / 2 - noise.y - noise.height / 2) < 1);
        }), 'Noise takes most of the row beside both equipment actions');
        await page.locator('.personal-equipment').first().click();
        await page.locator('#stats_quiver_line').press('Enter');
        assert.deepEqual(await page.evaluate(() => window.inspections), [[0, 'equipment'], [0, 'equipment']]);
        await page.evaluate(() => {
            Object.assign(window.fixturePlayer, { progress: 42, str: 7, adjusted_noise: 1000, doom: 77, contam: 130, time: 300 });
            window.renderNativeStats(); window.jQuery(document).trigger('player_state_changed');
        });
        assert.equal(await page.locator('#stats_str').textContent(), '7 (14)');
        assert(await page.locator('#stats_str .degenerated_stat').count());
        assert.equal(await page.locator('#stats_noise').getAttribute('aria-valuenow'), '100');
        assert.equal(await page.locator('#stats_doom_ui').isVisible(), true);
        assert.match(await page.locator('#stats_contam_ui').getAttribute('aria-label'), /130%/);
        const chronology = await page.locator('.party-member-state').getAttribute('data-tip-body');
        assert.match(chronology, /Total elapsed time: 30\.0/);
        assert.equal((chronology.match(/Total turns:/g) || []).length, 1, 'Live tooltips never accumulate copied chronicle details');
        assert(await page.evaluate(() => document.getElementById('stats') === window.originalNativeStats
            && document.getElementById('stats_ac') === window.originalAC));
        fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify(await page.evaluate(() =>
            ['#stats', '.party-self-details', '.hud-stats-details', '.personal-stat-reading', '.personal-stat-glyph', '#stats_mpline'].map(selector => {
                const node = document.querySelector(selector), style = getComputedStyle(node), bounds = node.getBoundingClientRect();
                return { selector, display: style.display, color: style.color, width: bounds.width, font: style.font, columns: style.gridTemplateColumns,
                    parent: node.parentElement.id || node.parentElement.className, attributes: node.getAttributeNames().map(name => [name, node.getAttribute(name)]) };
            })), null, 2));
        await page.screenshot({ path: path.join(output, 'native-personal-meters.png') });
        await page.evaluate(() => {
            window.modules['./player-card-details'].preserve();
            window.jQuery('#party_hud_members').empty().append('<article class="party-card is-controlled-card" data-party-slot="0"></article>');
            window.modules['./player-card-details'].mount();
        });
        assert(await page.evaluate(() => document.getElementById('stats') === window.originalNativeStats));
        assert.equal(await page.locator('#stats').count(), 1);
        await page.evaluate(() => { window.crawl_party.state.members = []; window.modules['./player-card-details'].mount(); });
        assert(await page.locator('#stats_weapon').evaluate(node => node.closest('.stat-row-interactive').parentNode.classList.contains('hud-stats-details')));
        assert.equal(await page.locator('.personal-stat-context').count(), 0);
        assert.equal(await page.locator('#stats_weapon').isVisible(), true, 'Native sheet returns intact without a party');
        assert.equal(await page.locator('#stats_xl').isVisible(), true);
        assert.equal(await page.locator('#stats_time').isVisible(), true);
        assert(await page.locator('#stats_noise').evaluate(node => node.parentElement.id === 'stats_leftcolumn'), 'Noise returns to its native position');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, nativeNodesPreserved: true, exactStatValues: true,
            nativeNoise: true, compactNoiseActions: true, capacityAndPoisonTips: true, equipmentAccess: true, remountAndFallback: true, output }));
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
