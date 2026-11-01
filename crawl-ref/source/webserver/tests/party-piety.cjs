/* The plinth's favor meter and the Attack reading that took the old Faith row's slot. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let model;
vm.runInNewContext(fs.readFileSync(path.join(root, 'game_data/static/party-status-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
const worshipper = (fields = {}) => ({ god: 'Trog', piety: 85, piety_rank: 3, penance: 0, ...fields });
assert.equal(model.faith(worshipper()).progress, 40, 'Halfway through a star uses native thresholds, not sixths');
assert.equal(model.faith(worshipper({ piety: 0, piety_rank: 0 })).progress, 0);
assert.equal(model.faith(worshipper({ piety: 159, piety_rank: 5 })).progress, 97);
assert.equal(model.faith(worshipper({ piety: 200, piety_rank: 6 })).progress, null, 'Six stars has no next star');
assert.equal(model.faith(worshipper({ piety: undefined })).progress, null, 'Missing piety never fabricates progress');
assert.equal(model.faith(worshipper({ piety: 900 })).progress, 99, 'Progress stays inside the rank the server reported');
assert.match(model.faith(worshipper()).summary, /Favor: 3 of 6 stars\. 40% toward the next star\./);
for (const god of ['Xom', 'Gozag'])
    assert.equal(model.faith(worshipper({ god, piety: 120 })).progress, null, god + ' keeps no inferred favor');
assert.equal(model.faith({ god: '', piety: 0, piety_rank: 0 }).progress, null);

const hit = (rating, name = 'hand axe') => ({ name, rating });
const attackHero = (fields = {}) => ({ atk_aut: 11, attack_info: { damage: [hit('9 (Base 7 x 120% (Str) x 100% (Skill)).')] }, ...fields });
assert.deepEqual({ ...model.attack(attackHero()), weapons: undefined },
    { weapons: undefined, damage: 9, turns: '1.1', perTurn: 8 });
assert.equal(model.attack(attackHero({ attack_info: { damage: [hit('your enemies will bleed and die for Makhleb.')] } })).damage, null,
    'A rating without a number stays unknown');
assert.equal(model.attack({}).turns, null);
assert.equal(model.attack(attackHero({ atk_aut: 0 })).perTurn, null, 'An unusable delay cannot divide damage');

async function browserProof() {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const output = process.env.PIETY_PROOF_DIR || '/tmp/dcss-piety-proof';
    fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        const sheet = fs.readFileSync(path.join(root, 'game_data/templates/character-sheet.html'), 'utf8');
        await page.setContent('<!doctype html><html><body><main id="normal">'
            + '<div id="right_column" style="width:360px"><div id="hud_sidebar_scroll">' + sheet
            + '<div id="party_hud"><div id="party_hud_members"></div></div></div></div></main></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/materials.css', 'static/tabletop/properties.css',
            ...['game-coop', 'tabletop-party', 'gameplay-shell', 'hud-workspace', 'hud-polish', 'party-initiative',
                'party-card-status', 'hud-reflow', 'personal-stat-visuals', 'player-card-sections', 'party-faith',
                'portrait-status', 'health-effects', 'party-card-readings', 'play-guidance'].map(name => 'game_data/static/styles/' + name + '.css')])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.addStyleTag({ content: 'body{margin:0;background:#11161b;color:#e2dac7}button{font:inherit;color:inherit}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const noop = () => {};
            window.sent = []; window.inspected = [];
            window.modules = { jquery: window.jQuery,
                comm: { register_handlers: noop, send_message: (...args) => window.sent.push(args) },
                client: { is_party_member: () => true, is_watching: () => false },
                './dungeon_renderer': { set_view_center: noop }, './display': { invalidate: noop, display: noop },
                './minimap': { update_overlay: noop, fit_to: noop },
                './party-inspector': { open: (...args) => window.inspected.push(args), render: noop },
                './party-controls': { toggle_drawer: noop, bind: noop }, './tileinfo-dngn': {},
                './party-doom': { update: noop }, './party-trade': { button: () => window.jQuery('<button>Trade</button>') },
                './turn-order-rail': { update: noop, render: noop },
                './workflow-actions': { reason: () => '' }, './chat-context': { update: noop } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(dep => {
                    if (!(dep in window.modules)) throw new Error('Missing fixture dependency: ' + dep);
                    return window.modules[dep];
                }));
            };
            window.define.amd = true;
        });
        for (const [name, file] of [['item-properties', 'static/scripts/item-properties.js'],
            ['character-stat-help', 'static/scripts/character-stat-help.js'], ['spell-cost', 'static/scripts/spell-cost.js'],
            ['heat-help', 'static/scripts/heat-help.js'], ['hero-roles', 'static/scripts/hero-roles.js'],
            ['dom-update', 'static/scripts/dom-update.js'],
            ...['effect-icon-catalog', 'effect-icon-art', 'status-icons', 'party-model', 'party-status-model', 'party-faith', 'portrait-status',
                'party-card-status', 'player-card-details', 'party-initiative', 'party-navigation', 'party', 'native-tile-art', 'frame-update', 'party-card-readings']
                .map(name => [name === 'party' ? name : './' + name, 'game_data/static/' + name + '.js'])]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
            assert(await page.evaluate(name => Boolean(window.modules[name]), name), 'Module loaded: ' + name + ' ' + errors.join('; '));
        }
        const member = (slot, name, fields) => ({ slot, name, species: 'Human', job: 'Fighter', alive: true, hp: 30, hp_max: 37,
            mp: 3, mp_max: 13, xl: 4, xl_cap: 27, xl_next: 30, place: 'D:3', ac: 10, ev: 8, sh: 5, str: 22, intel: 13, dex: 13,
            weapon: 'hand axe', resists: { Stlth: 3 }, statuses: [], statuses_known: true, spells: [], mutations: [],
            move_aut: 10, move_delay_aut: 10, atk_aut: 11, adjusted_noise: 200, penance: 0, ...fields });
        const state = { controlled_slot: 0, active_slot: 0, controllable_slots: [0, 1, 2, 3], members: [
            member(0, 'Tav', { god: 'Trog', piety: 85, piety_rank: 3,
                attack_info: { damage: [hit('9 (Base 7 x 120% (Str) x 100% (Skill)).'), hit('5 (Base 4).', 'dagger')] } }),
            member(1, 'Lyra', { god: 'Xom', piety: 120, piety_rank: 4 }),
            member(2, 'Orin', { god: 'Gozag', piety: 0, piety_rank: 0 }),
            member(3, 'Nessa', { god: 'the Shining One', piety: 170, piety_rank: 6 })] };
        const render = () => page.evaluate(data => {
            window.modules.party.state(JSON.parse(JSON.stringify(data)));
            window.crawl_party = window.crawl_party || {};
            window.modules['./party-card-readings'].mount();
        }, state);
        const fills = slot => page.locator('#party_piety_' + slot + ' .party-piety-star i').evaluateAll(nodes => nodes.map(node => node.style.width));
        const label = slot => page.locator('#party_piety_' + slot + ' .party-bar-label').textContent();
        await render();
        assert.equal(await page.locator('.party-faith-row').count(), 0, 'The meter replaces the text row');
        assert.deepEqual(await fills(0), ['100%', '100%', '100%', '40%', '0%', '0%']);
        assert.equal(await label(0), 'Piety 3/6');
        assert.doesNotMatch(await page.locator('.is-controlled-card').innerText(), /Trog/, 'The shrine art names the deity');
        assert.match(await page.locator('#party_piety_0').getAttribute('aria-label'), /Tav: Trog\. Favor: 3 of 6 stars\. 40% toward the next star/);
        assert.equal(await page.locator('#party_piety_1 .party-piety-star').count(), 0, 'Xom has no favor pips');
        assert.equal(await label(1), 'Mood');
        assert.equal(await page.locator('#party_piety_2 .party-piety-star').count(), 0, 'Gozag has no favor pips');
        assert.equal(await label(2), 'Gold');
        assert.deepEqual(await fills(3), Array(6).fill('100%'));
        assert.equal(await label(3), 'Piety 6/6');

        const geometry = await page.locator('.is-controlled-card').evaluate(card => {
            const rect = selector => card.querySelector(selector).getBoundingClientRect();
            const plinth = rect('.faith-plinth-stone'), meter = rect('.party-piety'), hp = rect('.party-bar-wrap.hp-track');
            const text = card.querySelector('.party-piety .party-bar-label');
            return { gapToPlinth: meter.top - plinth.bottom, clearOfBars: hp.left - meter.right, topOffset: meter.top - hp.top,
                heightOffset: meter.height - hp.height, fits: text.scrollWidth <= text.clientWidth,
                centered: Math.abs(meter.left + meter.width / 2 - rect('.party-faith-frame').left - rect('.party-faith-frame').width / 2) <= 1,
                inCard: meter.left >= card.getBoundingClientRect().left };
        });
        assert(geometry.gapToPlinth >= 0, 'Meter starts below the plinth');
        assert(geometry.clearOfBars >= 0, 'Meter stays out of the HP column');
        assert.equal(geometry.topOffset, 0, 'Meter shares the HP and MP row');
        assert.equal(geometry.heightOffset, 0, 'Meter matches the HP and MP height');
        assert(geometry.fits, 'The label fits inside the meter');
        assert(geometry.centered, 'Meter stays centred under the shrine');
        assert(geometry.inCard);
        await page.locator('.is-controlled-card').screenshot({ path: path.join(output, 'trog-rank3.png') });

        state.members[0].piety = 90;
        await render();
        assert.deepEqual((await fills(0)).slice(3, 4), ['60%'], 'Piety inside one star rank still refreshes the card');

        state.members[0].penance = 12;
        await render();
        assert.equal(await label(0), 'Penance');
        await page.locator('.is-controlled-card').screenshot({ path: path.join(output, 'penance.png') });

        Object.assign(state.members[0], { god: '', piety: 0, piety_rank: 0, penance: 0 });
        await render();
        assert.deepEqual(await fills(0), Array(6).fill('0%'));
        assert.equal(await label(0), 'Piety');
        assert.match(await page.locator('#party_piety_0').getAttribute('data-tip-title'), /No deity/);
        await page.locator('.is-controlled-card').screenshot({ path: path.join(output, 'no-deity.png') });

        Object.assign(state.members[0], { species: 'Eldritch', defiance: 35, elder_rites: 1, elder_summary: 'Stolen rites.' });
        await render();
        assert.equal(await page.locator('#party_piety_0 .party-piety-rail > i').evaluate(node => node.style.width), '35%');
        assert.equal(await label(0), 'Defy 35');
        Object.assign(state.members[0], { species: 'Human', god: 'Trog', piety: 85, piety_rank: 3 });
        delete state.members[0].defiance;
        await render();

        const chip = page.locator('.is-controlled-card [data-reading="attack"]');
        assert.equal(await chip.locator('.party-reading-value').textContent(), '9/1.1t');
        assert.equal(await chip.getAttribute('aria-label'), 'Attack: 9 damage every 1.1 turns');
        assert.equal(await chip.getAttribute('data-tip-body'),
            'hand axe: 9 damage per hit, before armour\ndagger: 5 damage per hit, before armour\n1.1 turns per attack, about 8 damage per turn');
        assert.equal(await page.locator('.party-card:not(.is-controlled-card) [data-reading="attack"]').count(), 0);
        const rowTop = await page.locator('.is-controlled-card [data-reading="floor"]').evaluate(node => node.getBoundingClientRect().top);
        assert.equal(await chip.evaluate(node => node.getBoundingClientRect().top), rowTop, 'Attack shares the Lv and Floor row');
        state.members[0].atk_aut = 8;
        await render();
        assert.equal(await chip.locator('.party-reading-value').textContent(), '9/0.8t', 'The reading follows native delay without a card rebuild');
        state.members[0].attack_info = { damage: [hit('your enemies will bleed and die for Makhleb.', 'Woe')] };
        await render();
        assert.equal(await chip.locator('.party-reading-value').textContent(), '0.8t', 'A rating without a number shows speed alone');

        await page.locator('#party_piety_0').click();
        assert.deepEqual(await page.evaluate(() => window.inspected), [[0, 'abilities']], 'The meter opens the same faith view as the plinth');
        await page.locator('#party_piety_0').focus();
        await page.keyboard.press('a');
        assert.deepEqual(await page.evaluate(() => window.sent), [], 'Inspecting faith never sends a dungeon action');

        await page.evaluate(() => document.body.classList.add('workflow-compact-roster'));
        assert.equal(await page.locator('#party_piety_0').isVisible(), true, 'Compact keeps the controlled meter');
        assert.equal(await page.locator('#party_piety_1').isVisible(), false, 'Compact companions stay at shrine height');
        assert.equal(await page.locator('.party-card:not(.is-controlled-card) .party-portrait').first()
            .evaluate(node => node.getBoundingClientRect().height), 68);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, geometry, output }));
    } finally { await browser.close(); }
}
browserProof().catch(error => { console.error(error); process.exitCode = 1; });
