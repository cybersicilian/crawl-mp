/* Exercise the real snapshot/control/progress/mission renderers in one browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const web = path.resolve(__dirname, '..');
const output = process.env.NAV_PROOF_DIR || '/tmp/dcss-top-nav-proof';
fs.mkdirSync(output, { recursive: true });

async function exercise(browser, source, name) {
    const page = await browser.newPage({ viewport: { width: 1800, height: 300 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        // Keep the genuine mission-bar markup; omit unrelated dungeon/sidebar content.
        const template = fs.readFileSync(path.join(source, 'game_data/templates/game.html'), 'utf8');
        const banner = template.slice(template.indexOf('<div id="party_turn_banner"'), template.indexOf('<div id="dungeon_viewport"'));
        await page.setContent('<!doctype html><body><main id="normal"><div id="left_column">' + banner
            + '<div id="party_hud"><div id="party_hud_members"><div class="party-member-card"></div></div></div>'
            + '<div id="dcss_quick_dock"></div><button id="workflow_compact_btn"></button>'
            + '<span id="workflow_camera_context"></span></div></main></body>');
        for (const file of ['static/tabletop/tokens.css', 'game_data/static/styles/game-coop.css',
            'game_data/static/styles/party-progress.css', 'game_data/static/styles/tactics-shell.css'])
            await page.addStyleTag({ content: fs.readFileSync(path.join(source, file), 'utf8') });
        await page.addScriptTag({ path: path.join(source, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const noop = () => {};
            window.modules = { jquery: window.jQuery,
                comm: { send_message: noop }, client: { is_watching: () => false, is_party_member: () => false },
                './player': { turn: 1669, time: 16690 }, 'character-catalog': { species: {} },
                './dungeon_renderer': {}, './display': { invalidate_positions: noop, display: noop },
                './minimap': { update_overlay: noop, fit_to: noop },
                './party-inspector': {}, './party-controls': { bind: noop, toggle_drawer: noop },
                './status-icons': { icon: () => { const node = document.createElement('i'); node.className = 'tt-icon'; return node; } },
                './chat-context': { update: noop }, 'item-properties': {}, './native-tile-art': { create: () => document.createElement('i') },
                './party-initiative': { update: noop, updateMonster: noop, createMonster: () => window.jQuery('<span hidden></span>') },
                './party-navigation': { update: noop }, './party-card-status': {},
                './player-card-details': { mount: noop }, './party-doom': { update: noop }, './party-trade': {},
                'hero-roles': {}, './turn-order-rail': { update: noop }, 'heat-help': {},
                './enemy-initiative': { init: noop }, './tileinfo-main': {},
                './workflow-actions': { controlledSlot: () => window.modules['./party-model'].controlledSlot(window.crawl_party.state), reason: () => '' },
                './power-picker': {}, './inspection-dialog': {}, './game-context': { get_ui_state: () => 0, get_view_zoom: () => ({ factor: 1.5 }), set_view_zoom: () => true },
                './enums': { ui: { NORMAL: 0 } }
            };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
        });
        // Load the shared helper from the candidate even when comparing the original renderer.
        await page.evaluate(() => { window.moduleName = 'dom-update'; });
        await page.addScriptTag({ path: path.join(web, 'static/scripts/dom-update.js') });
        for (const name of ['party-model', 'party-progress-model', 'frame-update', 'party', 'party-progress', 'gameplay-controls', 'mission-bar', 'viewport-zoom']) {
            await page.evaluate(name => { window.moduleName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(source, 'game_data/static', name + '.js') });
        }
        const result = await page.evaluate(async () => {
            const $ = window.jQuery, modules = window.modules;
            const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
            // Sidebar rebuilding is a separate contract; retain a matching card while moving.
            modules['./party-model'].cardSignature = () => '';
            const member = { slot: 0, name: 'Tav', species: 'Human', job: 'Fighter', alive: true,
                place: 'D:2', pos: { x: 1, y: 1 }, runes: [], hp: 20, hp_max: 20 };
            const state = { controlled_slot: 0, active_slot: 0, combat_locked: false, simultaneous_turns: false,
                gold: 1000056, floor: 'D:2', world_aut_clock: 16690, members: [member] };
            window.render = () => modules['./party'].state(structuredClone(state));
            window.render();
            modules['./party-progress'].init(); modules['./viewport-zoom'].init(); modules['./mission-bar'].init();
            await frame(); await frame();
            const ids = ['party_banner_who', 'party_banner_mode', 'party_hud_gold', 'party_progress_floor',
                'party_progress_runes', 'hud_zoom_value', 'hud_zoom_status', 'mission_clock_value'];
            const roots = ids.map(id => document.getElementById(id));
            const initialNodes = roots.map(root => root.firstChild);
            const watched = [];
            const observer = new MutationObserver(records => watched.push(...records));
            roots.forEach(root => observer.observe(root, { subtree: true, childList: true, characterData: true }));
            const modeSamples = [];
            for (let i = 0; i < 40; i++) {
                member.pos.x++;
                window.render(); $(document).trigger('game_actions_changed');
                await frame();
                modeSamples.push(document.getElementById('party_banner_mode').textContent);
            }
            await frame(); watched.push(...observer.takeRecords()); observer.disconnect();
            const movement = { mutations: watched.length, retained: roots.every((root, i) => root.firstChild === initialNodes[i]),
                modeSamples: [...new Set(modeSamples)] };
            modules['./player'].turn++;
            state.gold = 1000100; member.place = state.floor = 'D:3'; state.combat_locked = true;
            window.render(); await frame(); await frame();
            const changed = { gold: document.getElementById('party_hud_gold').textContent,
                floor: document.querySelector('#party_progress_floor .party-context-value').textContent,
                mode: document.getElementById('party_banner_mode').textContent,
                turn: document.getElementById('mission_clock_value').textContent };
            state.active_slot = 1; window.render(); await frame(); await frame();
            const waiting = document.getElementById('party_banner_mode').textContent;
            state.multiplayer = true; state.shared_fate = true;
            member.region_id = 1; member.region_combat = true; member.can_act = false;
            window.render(); await frame(); await frame();
            const recovering = document.getElementById('party_banner_mode').textContent;
            member.region_combat = false; member.activity = 'explore';
            window.render(); await frame(); await frame();
            const activity = document.getElementById('party_banner_mode').textContent;
            const before = document.getElementById('party_banner_mode').firstChild;
            for (let i = 0; i < 10; i++) { window.render(); await frame(); }
            const activityRetained = before === document.getElementById('party_banner_mode').firstChild;
            return { movement, changed, waiting, recovering, activity, activityRetained };
        });
        assert.deepEqual(errors, [], name + ' has no browser errors');
        await page.locator('#party_turn_banner').screenshot({ path: path.join(output, name + '.png') });
        return result;
    } finally { await page.close(); }
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const baseline = process.env.NAV_COMPARE_ROOT ? await exercise(browser, process.env.NAV_COMPARE_ROOT, 'baseline') : null;
        const candidate = await exercise(browser, web, 'candidate');
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ baseline, candidate }, null, 2) + '\n');
        assert.equal(candidate.movement.mutations, 0, 'Movement must leave unchanged header text untouched');
        assert(candidate.movement.retained, 'Header text, icons and rune nodes survive movement');
        assert.deepEqual(candidate.movement.modeSamples, ['Free Explore']);
        assert.deepEqual(candidate.changed, { gold: '1000100', floor: 'D:3', mode: 'Tactical Combat', turn: '1670' });
        assert.equal(candidate.waiting, 'Tactical Combat · Waiting for P2');
        assert.equal(candidate.recovering, 'D:3 · R2 · Recovering · Shared Fate');
        assert.equal(candidate.activity, 'Free Explore · R2 · Exploring · Shared Fate');
        assert(candidate.activityRetained, 'Unchanged activity text stays intact');
        if (baseline) assert(baseline.movement.mutations > 0 && !baseline.movement.retained, 'The fixture reproduces the original churn');
        console.log(JSON.stringify({ baseline: baseline && baseline.movement, candidate: candidate.movement }));
        console.log('Top-nav movement stability and genuine state transitions passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
