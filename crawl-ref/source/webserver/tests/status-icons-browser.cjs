/* Real atlas/styles and all three renderers; controlled state, no game server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
let effectCatalog;
require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/effect-icon-catalog.js'), 'utf8'), { define(deps, factory) { effectCatalog = factory(); } });
const catalog = effectCatalog.entries.map(row => ({ id: row[0], icon_key: row[0], text: row[2][0], is_bad: row[0].startsWith('BANE_'), dur: row[0].startsWith('DUR_') ? 7 : 0 }));
const root = path.resolve(__dirname, '..');
const output = process.env.STATUS_PROOF_DIR || '/tmp/dcss-status-icons-proof';
const representative = [
    { id: 1, light: 'Fast', text: 'Hasted', is_bad: false, col: 4, dur: 8 },
    { id: 2, light: 'Pois', text: 'Poisoned', is_bad: true, col: 10, dur: 4 },
    { id: 3, light: 'Slow', text: 'Slowed (expiring)', is_bad: true, col: 4, dur: 1 },
    { id: 4, light: 'Regen', text: 'Regenerating', is_bad: false, col: 10 },
    { id: 5, light: 'New', text: 'Unclassified effect' }
].map(status => ({ ...status, desc: 'Native effect description for ' + status.text }));

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 980, height: 920 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('http://status.test/**', async route => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
            const file = path.resolve(root, '.' + pathname);
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
                return route.fulfill({ status: 404, body: '' });
            const contentType = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png',
                '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
            return route.fulfill({ contentType, path: file });
        });
        await page.goto('http://status.test/');
        await page.setContent('<!doctype html><html><head><link rel="stylesheet" href="/game_data/static/style.css">'
            + '<link rel="stylesheet" href="/game_data/static/styles/party-inspector.css"></head><body>'
            + '<h1>Shared status frames</h1><p class="intro">Terraria-inspired square wells · Native pixel artwork · Visible turn timers · Persistent banes</p>'
            + '<main id="normal"><h2>Party card and Zot pressure</h2><div id="party_hud"><div id="card"></div></div><h2>Player HUD</h2><div id="stats_status_lights"></div>'
            + '<h2>Passive defenses</h2><div id="passives"></div></main>'
            + '<dialog open id="party_inspector_modal"><h2>Character inspector</h2><div id="party_insp_hero_bar" hidden></div>'
            + '<div id="party_insp_tab_bar" hidden></div><div id="party_insp_body" class="party-insp-body"></div></dialog>'
            + '<section id="catalog"><h2>Complete native effect catalogue</h2><div id="catalog_grid"></div></section>'
            + '<section id="reuse"><h2>Independent surface</h2></section><div id="legacy"></div></body></html>');
        await page.addStyleTag({ content: 'body{position:static;margin:0;padding:24px;background:#151c24;color:#e7dfcd;font:12px system-ui;overflow:auto}'
            + 'h1{font:24px Georgia;margin:0 0 8px}h2{font:15px Georgia;margin:16px 0 10px}.intro{color:#b9b5aa;margin:0 0 20px}'
            + '#normal{position:static;display:block;width:auto;height:auto;margin:0 0 20px;padding:16px;border:1px solid #766545;background:#101820}'
            + '#card,#passives{display:flex;flex-wrap:wrap;gap:4px}#normal .party-card-status{display:block}'
            + '#party_hud{min-height:250px;box-sizing:border-box}'
            + '#party_inspector_modal{position:static;display:block;width:100%;max-height:none;margin:0;padding:14px;box-sizing:border-box}'
            + '#party_insp_body{padding:12px;overflow:auto}.party-insp-banner,.party-insp-aut-strip,.party-insp-res-grid{display:none}'
            + '#party_insp_panel_overview>.party-insp-section-title:first-of-type{display:none}'
            + '#catalog_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}'
            + '.catalog-case{display:flex;align-items:center;gap:7px;min-height:32px;padding:5px;border:1px solid #70604455;background:#1e2730}'
            + '.catalog-case>small{font:10px/1.3 system-ui;overflow-wrap:anywhere}#reuse{padding:12px;background:#e3d6b7;color:#372d20}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const $ = window.jQuery, noop = () => {};
            window.mods = { jquery: $,
                './party-faith': {}, './portrait-status': {},
                './options': { get: name => /_colour$/.test(name) ? [] : false },
                './util': { formatted_string_to_html: text => $('<span>').text(text || '').html() },
                './player-stat-tips': { update: noop, set: ($node, title, badge, body, meta, html) =>
                    $node.attr({ 'data-tip-title': title, 'data-tip-badge': badge, 'data-tip-body': body,
                        'data-tip-meta': meta, 'data-tip-html': html || '' }) },
                './folio-equipment': { render: () => $('<div>') }, './party-power-cards': {},
                './party-skill-training': { captureFocus: noop, restoreFocus: noop, render: () => $('<div>') },
                './workflow-actions': { context: () => $('<div>') },
                'character-stat-help': { resistances: [] }, 'spell-cost': {},
                'rich-text': { render: text => $('<span>').text(text || '').html() }
            };
        });
        for (const [id, file] of [
            ['item-properties', 'static/scripts/item-properties.js'],
            ['./effect-icon-catalog', 'game_data/static/effect-icon-catalog.js'], ['./effect-icon-art', 'game_data/static/effect-icon-art.js'], ['./status-icons', 'game_data/static/status-icons.js'],
            ['./party-model', 'game_data/static/party-model.js'],
            ['./party-status-model', 'game_data/static/party-status-model.js'],
            ['./party-doom-model', 'game_data/static/party-doom-model.js'],
            ['./party-doom', 'game_data/static/party-doom.js'],
            ['./party-card-status', 'game_data/static/party-card-status.js'],
            ['./player-hud', 'game_data/static/player-hud.js'],
            ['./party-inspector-render', 'game_data/static/party-inspector-render.js']
        ]) {
            await page.evaluate(id => { window.define = (dependencies, factory) => {
                window.mods[id] = factory(...dependencies.map(key => window.mods[key]));
            }; }, id);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(({ representative, catalog }) => {
            const $ = window.jQuery, icons = window.mods['./status-icons'];
            const hero = { slot: 0, name: 'Aster', species: 'Human', job: 'Fighter', god: '', alive: true,
                hp: 35, hp_max: 40, mp: 10, mp_max: 10, xl: 6, statuses: representative, banes: [{ id: 1, name: 'Bane of Claustrophobia', desc: 'Nearby walls oppress you.', recovery_xl_tenths: 13 }],
                resists: { rPois: 1, rFire: 3, rCold: -2 }, move_aut: 8, abilities: [], spells: [], mutations: [] };
            window.hero = hero;
            window.renderCard = () => $('#card').empty().append(window.mods['./party-card-status'].create(hero));
            window.renderCard();
            window.doomHero = { name: 'Aster', alive: true, place: 'D:5', zot_clock: { active: true, immune: false,
                remaining_aut: 13500, capacity_aut: 27000, warning: 0, short_lifespans: 1, lifespan_divisor: 10 } };
            window.renderDoom = () => window.mods['./party-doom'].update({ members: [window.doomHero] });
            window.renderDoom();
            $('#passives').append(window.mods['./party-card-status'].passives(hero, () => { window.inspected = true; }));
            window.hudPlayer = { ...hero, status: representative, species_display_name: 'Human',
                weapon_index: -1, unarmed_attack: 'Unarmed', quiver_desc: '', has_status: () => false,
                inventory_item_desc: () => $('<span>'), index_to_letter: () => '-' };
            window.renderHud = window.mods['./player-hud'].create(window.hudPlayer);
            window.renderHud();
            window.crawl_party = { state: { members: [hero], active_slot: 0 }, inspector_tab: 'overview' };
            window.mods['./party-inspector-render'].render();
            catalog.forEach(status => {
                const effect = window.mods['./party-status-model'].effects({ statuses: [status] })[0];
                const node = icons.effect(effect);
                $('<div class="catalog-case">').append(node, $('<small>').text(status.text)).appendTo('#catalog_grid');
            });
            $('#reuse').append(icons.effect({ key: 999, name: 'Hasted', tone: 'active', duration: 8 }));
            const hostile = icons.effect({ key: 1000, name: '<img src=x onerror=alert(1)>', tone: 'unknown' });
            document.getElementById('reuse').appendChild(hostile);
            const old = $('<span class="status_light is-bad">Poisoned</span>').appendTo('#legacy')[0];
            icons.decorate(old); icons.decorate(old);
        }, { representative, catalog });
        await page.waitForFunction(() => document.querySelector('.status-icon-frame') &&
            getComputedStyle(document.querySelector('.status-icon-frame')).width === '32px');
        await page.evaluate(() => document.fonts.ready);
        // Wait for the actual cropped SVG atlas image, including the gallery.
        await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => /hud-sprites.*png/.test(entry.name)));
        assert.equal(await page.locator('#catalog_grid .status-icon-frame').count(), catalog.length);
        assert.equal(await page.locator('#catalog_grid .status-icon-frame > .effect-icon-art[data-effect-art]').count(), catalog.length);
        assert.equal(await page.locator('#catalog_grid [data-status-icon="question"]').count(), 0);
        assert(await page.locator('#catalog_grid .effect-icon-art image').evaluateAll(nodes => nodes.every(node => /\/effect-icons\/effects\.[a-f0-9]+\.png$/.test(node.getAttribute('href')))));
        await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => /effects\.[a-f0-9]+\.png/.test(entry.name)));
        assert.equal(await page.locator('#card .status-icon-frame').count(), representative.length);
        assert.equal(await page.locator('#stats_status_lights .status-icon-frame').count(), representative.length);
        assert.equal(await page.locator('#party_insp_panel_overview .status-icon-frame').count(), representative.length);
        assert.equal(await page.locator('#card .party-bane').textContent(), 'Bane of Claustrophobia');
        assert.equal(await page.locator('#card .party-bane').getAttribute('data-tip-meta'), '1.3 XL of experience to recover');
        assert.equal(await page.locator('#party_insp_panel_overview .party-insp-banes tbody tr').count(), 1);
        assert.deepEqual(await page.locator('#card .status-icon-duration').allTextContents(), ['8t', '4t', '1t']);
        const surfaces = ['#card', '#stats_status_lights', '#party_insp_panel_overview', '#reuse'];
        const readings = [];
        for (const surface of surfaces) readings.push(await page.locator(surface + ' [data-status-icon="DUR_HASTE"]').first().evaluate(node => {
            const style = getComputedStyle(node), glyph = node.querySelector('.tt-icon').getBoundingClientRect();
            return { width: style.width, height: style.height, border: style.border, background: style.background,
                shadow: style.boxShadow, tone: node.dataset.statusTone, glyphWidth: glyph.width, glyphHeight: glyph.height };
        }));
        for (const reading of readings) assert.deepEqual(reading, readings[0], 'All surfaces use the identical frame');
        assert.equal(readings[0].glyphWidth, 24); assert.equal(readings[0].glyphHeight, 24);
        const meter = page.locator('#party_doom_meter');
        assert.equal(await meter.getAttribute('aria-valuenow'), '50');
        assert.equal(await page.locator('.party-doom-level').textContent(), '50%');
        const firstHeight = await page.locator('.party-doom-fill').evaluate(node => node.getBoundingClientRect().height);
        await meter.focus();
        await page.keyboard.press('Enter');
        await page.evaluate(() => { window.doomHero.zot_clock.remaining_aut = 2700; window.renderDoom(); });
        await page.waitForFunction(() => {
            const track = document.querySelector('.party-doom-track').getBoundingClientRect().height - 2;
            return document.querySelector('.party-doom-fill').getBoundingClientRect().height > track * .89;
        });
        assert.equal(await meter.getAttribute('aria-valuenow'), '90');
        assert(await page.locator('.party-doom-fill').evaluate(node => node.getBoundingClientRect().height) > firstHeight);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_doom_meter');
        await page.evaluate(() => { window.doomHero.zot_clock.active = false; window.renderDoom(); });
        assert.equal(await meter.getAttribute('data-doom-state'), 'paused');
        await page.evaluate(() => { window.doomHero.zot_clock.immune = true; window.renderDoom(); });
        assert.equal(await meter.getAttribute('data-doom-state'), 'stopped');
        assert.equal(await meter.getAttribute('aria-valuenow'), null);
        await page.evaluate(() => { delete window.doomHero.zot_clock; window.renderDoom(); });
        assert.equal(await meter.getAttribute('data-doom-state'), 'unknown');
        await page.evaluate(() => {
            window.doomHero.zot_clock = { active: true, immune: false, remaining_aut: 13500, capacity_aut: 27000,
                warning: 0, short_lifespans: 1, lifespan_divisor: 10 }; window.renderDoom();
        });
        for (const surface of surfaces.slice(0, 3)) {
            assert.equal(await page.locator(surface + ' [data-status-tone="bad"]').count(), 2);
            assert.equal(await page.locator(surface + ' .status-icon-warning').count(), 2);
            assert.equal(await page.locator(surface + ' [data-status-tone="unknown"]').count(), 1);
            assert.equal(await page.locator(surface + ' [data-status-expiring="true"]').count(), 1);
        }
        assert.equal(await page.locator('#passives .status-icon-frame .resistance-icons .tt-icon').count(), 6);
        assert.equal(await page.locator('#passives .resistance-cross').count(), 2);
        await page.locator('#passives button').first().click();
        assert.equal(await page.evaluate(() => window.inspected), true);
        assert.equal(await page.locator('#reuse img').count(), 0, 'Effect names are text, never HTML');
        assert.equal(await page.locator('#legacy .tt-icon').count(), 1);
        const stability = await page.evaluate(async () => {
            const icons = window.mods['./status-icons'], node = document.querySelector('#card [data-status-icon="DUR_HASTE"]');
            node.focus(); const glyph = node.querySelector('.tt-icon'); let mutations = 0;
            const observer = new MutationObserver(records => { mutations += records.length; });
            observer.observe(document.body, { childList: true, subtree: true });
            icons.frame(node, { glyph: 'DUR_HASTE', tone: 'active' });
            icons.decorate(document.body); icons.decorate(document.body);
            await Promise.resolve(); observer.disconnect();
            return { focus: document.activeElement === node, sameGlyph: node.querySelector('.tt-icon') === glyph, mutations };
        });
        assert.deepEqual(stability, { focus: true, sameGlyph: true, mutations: 0 }, 'Decoration cannot loop observers or steal focus');
        const expiry = await page.locator('#card [data-status-expiring="true"]').evaluate(node =>
            getComputedStyle(node, '::after').borderBottomStyle);
        assert.equal(expiry, 'dotted');
        await page.evaluate(() => document.activeElement.blur());
        await page.mouse.move(975, 5);
        await page.screenshot({ path: path.join(output, 'status-frames-preview.png'), clip: { x: 0, y: 0, width: 980, height: 850 } });
        await page.screenshot({ path: path.join(output, 'status-frames-desktop.png'), fullPage: true });
        await page.locator('#catalog').screenshot({ path: path.join(output, 'all-effects.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.locator('#normal .status-icon-frame').evaluateAll(nodes => nodes.every(node => {
            const frame = node.getBoundingClientRect(), glyph = node.querySelector('.tt-icon').getBoundingClientRect();
            return (node.classList.contains('status-icon-levels') ? glyph.width === 16 : glyph.width === 24) && glyph.left >= frame.left && glyph.right <= frame.right && frame.right <= innerWidth;
        })), 'Narrow HUD and signed resistance glyphs remain unclipped');
        await page.screenshot({ path: path.join(output, 'status-frames-mobile.png'), fullPage: true });
        await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
        assert.equal(await page.locator('#card [data-status-tone="unknown"]').evaluate(node => getComputedStyle(node).borderTopStyle), 'dashed');
        assert.equal(await page.locator('#card [data-status-expiring="true"]').evaluate(node => getComputedStyle(node, '::after').borderBottomStyle), 'dotted');
        await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none' });
        const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        const touchPage = await touch.newPage();
        await touchPage.setContent('<style>' + fs.readFileSync(path.join(root, 'static/tabletop/status-icons.css'), 'utf8')
            + '</style><span class="status-icon-frame" data-status-tone="active"></span>');
        assert.equal(await touchPage.locator('.status-icon-frame').evaluate(node => getComputedStyle(node).width), '36px');
        await touch.close();
        await page.evaluate(() => { window.hudPlayer.status = [{ light: 'Pois', col: 4 }, { light: 'Fast', col: 9 }]; window.renderHud(); });
        assert.deepEqual(await page.locator('#stats_status_lights .status-icon-frame').evaluateAll(nodes =>
            nodes.map(node => node.dataset.statusTone)), ['bad', 'active'], 'Legacy HUD protocol retains native colour semantics');
        await page.evaluate(() => { window.hero.statuses = []; window.renderCard(); window.hudPlayer.status = []; window.renderHud();
            window.mods['./party-inspector-render'].render(); });
        for (const surface of surfaces.slice(0, 3)) assert.equal(await page.locator(surface + ' .status-icon-frame').count(), 0);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ effectIdentities: catalog.length,
            surfaces, readings, stability, safeLabels: true, expiredRemoved: true, narrow: true,
            forcedColors: true, coarsePointerSize: 36, errors,
            scope: 'Controlled real-renderer fixture; no native gameplay or deployment claim.' }, null, 2) + '\n');
        console.log(catalog.length + ' effect frames; identical HUD/card/inspector/reuse styling, signed levels, expiry, focus, narrow and coarse-pointer checks passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
