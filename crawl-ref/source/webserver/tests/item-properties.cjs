/* Browser contract checks for shared, safe item property rendering. No server needed. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><main id="items"></main></body></html>');
        await page.evaluate(() => {
            window.modules = {};
            window.moduleName = 'item-properties';
            window.define = (dependencies, factory) => {
                window.modules[window.moduleName] = factory(...dependencies.map(name => window.modules[name]));
            };
        });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/item-properties.js') });
        await page.evaluate(() => { window.moduleName = 'status-icons'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/status-icons.js') });
        const cases = await page.evaluate(() => {
            const properties = window.modules['item-properties'];
            const arga = 'the +9 broad axe "Arga" {speed, MR+}';
            const native = 'the +3 robe {rF++ rC- rPois rElec rN+++ Will+ Str+3 Int-2 Dex+1 SInv Fly Stlth--}';
            const unknown = 'a ring {rF+,  gift from Bob  !k, Mystery+7, rC-}';
            const parse = text => properties.parse(text);
            const status = window.modules['status-icons'];
            return {
                arga: parse(arga), native: parse(native), unknown: parse(unknown),
                phrase: parse('a sword {holy wrath rF+ foul flame}'),
                untouched: ['plain sword', 'sword {}', 'sword { }', 'sword {{rF+}}', 'sword {rF+} (weapon)',
                    'the sword "A {fire} name"'].map(text => ({ text, parsed: parse(text) })),
                nullInput: parse(null),
                status: ['rF+', 'rC--', 'MR+', 'Will++', 'rCorr', 'rN+', 'SInv', 'See invisible',
                    'flight', 'Str+3', 'Int-2', 'Dex+4'].map(text => status.resolve(text))
            };
        });
        assert.equal(cases.arga.name, 'the +9 broad axe "Arga"');
        assert.deepEqual(cases.arga.properties.map(property => [property.key, property.value, property.raw]),
            [['brand-speed', '', 'speed'], ['will', '+', 'MR+']]);
        assert.equal(cases.arga.original, 'the +9 broad axe "Arga" {speed, MR+}');
        assert.deepEqual(cases.native.properties.map(property => property.value),
            ['++', '-', '', '', '+++', '+', '+3', '-2', '+1', '', '', '--']);
        assert.deepEqual(cases.native.properties.map(property => property.key),
            ['fire', 'cold', 'poison', 'electricity', 'life', 'will', 'strength', 'intelligence',
                'dexterity', 'see-invisible', 'flight', 'stealth']);
        assert.deepEqual(cases.unknown.properties.map(property => property.raw),
            ['rF+', 'gift from Bob  !k', 'Mystery+7', 'rC-']);
        assert.equal(cases.unknown.properties[1].kind, 'unknown');
        assert.equal(cases.unknown.properties[2].label, 'Mystery+7');
        assert.deepEqual(cases.phrase.properties.map(property => property.raw), ['holy wrath', 'rF+', 'foul flame']);
        for (const entry of cases.untouched) {
            assert.equal(entry.parsed.name, entry.text);
            assert.equal(entry.parsed.properties.length, 0);
        }
        assert.equal(cases.nullInput.name, '');
        assert.deepEqual(cases.status, ['flame', 'frost', 'shield', 'shield', 'corrosion', 'skull',
            'eye', 'eye', 'wing', 'strength', 'intelligence', 'dexterity']);

        await page.evaluate(() => {
            const properties = window.modules['item-properties'];
            const target = document.getElementById('items');
            properties.append(target, '<img src=x onerror=alert(1)> {rF++, <script>bad()</script>, MR+}');
            target.appendChild(properties.badge({ ...properties.describe('rC'), value: '-',
                description: 'Vulnerable to cold.' }));
            target.appendChild(properties.render('a tagged axe {speed Will+}', { focusable: false }));
            target.appendChild(properties.render('a ring {rF+}', { labels: true }));
            const zero = { ...properties.describe('rElec'), value: 0 };
            delete zero.raw;
            target.appendChild(properties.badge(zero));
            window.aliasArtwork = ['fire', 'cold', 'electricity', 'life', 'will', 'corrosion', 'stealth',
                'see-invisible', 'flight', 'strength', 'intelligence', 'dexterity'].map(name =>
                properties.icon(name).getAttribute('data-ui-sprite'));
            window.fallbackArtwork = properties.icon('unknown-icon').getAttribute('data-ui-sprite');
        });
        assert.equal(await page.locator('#items img, #items script').count(), 0, 'Item strings never create HTML');
        assert.equal(await page.locator('.item-base-name').first().textContent(), '<img src=x onerror=alert(1)>');
        assert.equal(await page.locator('.item-property-unknown .item-property-label').textContent(), '<script>bad()</script>');
        assert.equal(await page.locator('.item-property-value').first().textContent(), '++');
        const fire = page.locator('.item-property[data-property="fire"]').first();
        assert.equal(await fire.getAttribute('tabindex'), '0');
        assert((await fire.getAttribute('aria-label')).includes('Fire resistance ++'));
        assert.equal(await fire.locator('svg').getAttribute('aria-hidden'), 'true');
        assert.equal(await page.locator('.item-property-name').nth(1).locator('[tabindex]').count(), 0,
            'Chat chip children can avoid extra tab stops');
        assert.equal(await page.locator('.item-property-name').last().locator('.item-property-label').textContent(), 'Fire resistance');
        const cold = page.locator('.item-property[data-property="cold"]');
        assert.equal(await cold.getAttribute('data-tip-body'), 'Vulnerable to cold.');
        assert.equal(await cold.locator('.item-property-value').textContent(), '-');
        assert.equal(await page.locator('.item-property[data-property="electricity"] .item-property-value').textContent(), '0',
            'Explicit native zero values remain visible');
        assert(await page.evaluate(() => window.aliasArtwork.every(path => path && path !== window.fallbackArtwork)),
            'Every canonical resistance and attribute has distinct artwork from the fallback rune');

        await page.evaluate(() => {
            const node = document.createElement('span');
            node.className = 'status_light';
            node.textContent = 'See invisible';
            document.body.appendChild(node);
            window.modules['status-icons'].decorate(document.body);
            window.modules['status-icons'].decorate(document.body);
        });
        assert.equal(await page.locator('.status_light .tt-icon').count(), 1, 'Repeated status decoration stays idempotent');
        assert.equal(await page.locator('.status_light').getAttribute('data-status-icon'), 'eye');

        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules.jquery = window.jQuery;
            window.moduleName = 'item-display';
            const chronicle = document.createElement('section');
            chronicle.id = 'coop_chronicle_panel';
            const title = document.createElement('strong');
            title.className = 'chronicle-entry-title';
            title.textContent = 'the broad axe "Arga" {speed, MR+}';
            chronicle.appendChild(title);
            document.body.appendChild(chronicle);
            const game = document.createElement('div');
            game.id = 'game';
            game.innerHTML = '<section id="stats"><span id="stats_weapon"><span class="fg14">axe {speed Will+}</span></span>'
                + '<span id="stats_offhand_weapon">dagger {venom Dex+2}</span></section>';
            document.body.appendChild(game);
        });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/item-display.js') });
        await page.locator('#stats_weapon .item-properties').waitFor({ state: 'attached' });
        assert.equal(await page.locator('.chronicle-entry-title .item-property').count(), 2);
        assert.equal(await page.locator('#stats_weapon .fg14 .item-property').count(), 2, 'Native colour wrapper is preserved');
        assert.equal(await page.locator('#stats_offhand_weapon .item-property').count(), 2);
        assert.equal(await page.locator('#stats [tabindex]').count(), 0, 'HUD badges avoid extra keyboard stops');
        await page.evaluate(() => {
            window.jQuery('#stats_weapon').html(window.jQuery('<span class="fg12"></span>').text('axe {rF- rN++}'));
        });
        await page.locator('#stats_weapon .item-property[data-property="life"]').waitFor({ state: 'attached' });
        assert.equal(await page.locator('#stats_weapon .fg12 .item-property-value').first().textContent(), '-');
        assert(!(await page.locator('#stats_weapon').textContent()).includes('{'));
        await page.evaluate(() => {
            // The real client clears document listeners and replaces game HTML on reconnect.
            window.jQuery(document).off();
            document.getElementById('game').innerHTML = '<section id="stats"><span id="stats_weapon">sword {flame rC+}</span>'
                + '<span id="stats_offhand_weapon">knife {speed Int+2}</span></section>';
        });
        await page.locator('#stats_weapon .item-property[data-property="cold"]').waitFor({ state: 'attached' });
        await page.locator('#stats_offhand_weapon .item-property[data-property="intelligence"]').waitFor({ state: 'attached' });
        await page.evaluate(() => { document.getElementById('stats_weapon').textContent = 'sword {rCorr}'; });
        await page.locator('#stats_weapon .item-property[data-property="corrosion"]').waitFor({ state: 'attached' });
        assert.equal(await page.locator('#stats_weapon .item-property-name').count(), 1, 'Reconnected HUD observes subsequent updates once');

        await page.evaluate(() => { window.moduleName = 'tooltip-layout'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/tooltip-layout.js') });
        await page.evaluate(() => { window.moduleName = './tip-placement'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/tip-placement.js') });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        await page.evaluate(() => { window.moduleName = 'tooltip-content'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/tooltip-content.js') });
        await page.evaluate(() => { window.moduleName = 'hover-cards'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/hover-cards.js') });
        await page.evaluate(() => {
            const tip = document.createElement('aside');
            tip.id = 'test_hover';
            document.body.appendChild(tip);
            window.modules['hover-cards'].show(tip, { title: '<img src=x> axe {speed MR+}', badge: 'Item',
                body: 'An item description.' }, 100, 100);
        });
        assert.equal(await page.locator('#test_hover .item-property').count(), 2);
        assert.equal(await page.locator('#test_hover img').count(), 0);
        assert.equal(await page.locator('#test_hover [tabindex]').count(), 0);
        assert.equal(await page.locator('#test_hover .dcss-tip-badge').textContent(), 'Item');
        assert.equal(await page.locator('#test_hover .dcss-tip-body').textContent(), 'An item description.');

        await page.evaluate(() => { window.moduleName = './party-model'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/party-model.js') });
        await page.evaluate(() => {
            const noop = () => {};
            Object.assign(window.modules, { comm: { send_message: noop }, client: { is_party_member: () => false }, './dungeon_renderer': {},
                './display': { invalidate: noop, display: noop }, './minimap': { update_overlay: noop, fit_to: noop },
                './party-inspector': { open: noop, render: noop }, './party-controls': { bind: noop, toggle_drawer: noop },
                './status-icons': window.modules['status-icons'], './chat-context': { update: noop },
                './workflow-actions': { reason: () => '' }, './tileinfo-dngn': {} });
            const members = document.createElement('div');
            members.id = 'party_hud_members';
            document.body.appendChild(members);
        });
        for (const [name, file] of [['./party-status-model', 'party-status-model.js'], ['./party-faith', 'party-faith.js'], ['./portrait-status', 'portrait-status.js'], ['./party-card-status', 'party-card-status.js'],
            ['./player-card-details', 'player-card-details.js'], ['./party-initiative', 'party-initiative.js'], ['./party-navigation', 'party-navigation.js']]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', file) });
        }
        await page.evaluate(() => { window.moduleName = 'party'; });
        await page.evaluate(() => { window.modules['./party-doom'] = { update() {} }; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/party.js') });
        await page.evaluate(() => {
            window.modules.party.state({ members: [{ name: 'Aldric', slot: 0, active: true, alive: true,
                species: 'Minotaur', job: 'Fighter', hp: 20, hp_max: 20, mp: 2, mp_max: 2,
                weapon: 'the +9 broad axe "Arga" {speed, MR+}', move_aut: 10, atk_aut: 7 }] });
        });
        assert.equal(await page.locator('.party-weapon-text .item-property').count(), 2);
        assert((await page.locator('.party-weapon-text').textContent()).endsWith(' · Spd:1.0t/mv'), 'Party speed text survives icon rendering');
        assert((await page.locator('.party-weapon-text').getAttribute('data-tip-body')).includes('Atk: 0.7t (7 aut)'));
        assert(!(await page.locator('.party-weapon-text').textContent()).includes('{'));
        assert.deepEqual(errors, []);
        console.log('Item properties: parsing, exact values, safe DOM, accessibility, shared icons, reconnecting HUD, native hover, and party weapons passed.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
