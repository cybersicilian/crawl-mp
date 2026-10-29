/* Native forecast semantics and actual party rendering, including status-only packets. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let model;
vm.runInNewContext(fs.readFileSync(path.join(root, 'game_data/static/party-status-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
const hero = (names = [], fields = {}) => ({ slot: 0, name: 'Moss', hp: 24, hp_max: 40,
    statuses: names.map((text, id) => ({ id, text })), ...fields });
const poison = hero(['quite poisoned (24 -> 12)'], { poison_survival: 12 });
assert.equal(model.health(poison).fill, 30);
assert.equal(model.health(poison).poison, 30);
assert.equal(model.health(poison).lethal, false);
const lethal = model.health(hero(['lethally poisoned (24 -> -3)'], { poison_survival: -3 }));
assert.equal(lethal.fill, 0); assert.equal(lethal.poison, 60); assert.equal(lethal.lethal, true);
assert.match(lethal.summary, /Potentially lethal/);
const drained = model.health(hero([], { real_hp_max: 50 }));
assert.equal(drained.fill, 48); assert.equal(drained.drained, 20);
assert.equal(drained.capacity, 80); assert.equal(drained.maximum, 40);
assert.equal(model.health(hero(['Poisoned'])).poison, 0, 'Missing forecasts cannot fabricate loss');
assert.match(model.health(hero(['Poisoned'])).summary, /forecast unavailable/);
assert.equal(model.health(hero(['Poisoned'], { poison_survival: 24 })).poison, 0);
assert.equal(model.health({}).known, false);
for (const fields of [{ hp_max: 0 }, { hp: NaN }, { hp_max: Infinity }]) {
    const view = model.health(hero([], fields));
    for (const key of ['fill', 'poison', 'drained', 'current', 'capacity']) assert(Number.isFinite(view[key]));
}
for (const fields of [{ hp: -5 }, { hp: 80 }, { poison_survival: 90 }, { real_hp_max: 0 }]) {
    const view = model.health(hero(['poisoned'], fields));
    assert(view.fill >= 0 && view.poison >= 0 && view.fill + view.poison <= view.capacity);
}
for (const [name, kind] of [['on fire', 'burning'], ['regenerating (expiring)', 'regen'],
    ['berserking', 'berserk'], ['spiked', 'barbs'], ['flayed', 'flayed'],
    ["in death's door", 'death-door'], ['sick', 'no-regen'], ['inhibited regen', 'no-regen']])
    assert.equal(model.health(hero([name])).effects[0].kind, kind);
for (const name of ['poison resistant', 'fire resistance', 'on berserk cooldown', "on death's door cooldown", 'frozen ramparts'])
    assert.equal(model.health(hero([name])).effects.length, 0, name);
assert.equal(model.health(hero(['on fire'], { statuses_known: false })).effects.length, 0);
assert.equal(model.health(hero(['hasted', 'confused'])).effects.length, 0, 'Other statuses remain in their own badges');

async function browserProof() {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const output = process.env.HEALTH_PROOF_DIR || '/tmp/dcss-health-bars-proof';
    fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 430, height: 800 }, deviceScaleFactor: 2 });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><main id="normal" style="width:360px;padding:12px">'
            + '<div id="party_hud"><div id="party_hud_members"></div></div></main></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/materials.css',
            ...['game-coop', 'tabletop-party', 'gameplay-shell', 'hud-workspace', 'hud-polish',
                'party-initiative', 'party-card-status', 'party-faith', 'hud-reflow', 'health-effects']
                .map(name => 'game_data/static/styles/' + name + '.css')])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.addStyleTag({ content: 'body{margin:0;background:#151a20;color:#e2dac7}.party-hp-fill{transition:none}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const noop = () => {};
            window.sent = [];
            window.modules = { jquery: window.jQuery,
                comm: { send_message: (...args) => window.sent.push(args) },
                client: { is_party_member: () => false, is_watching: () => false },
                './dungeon_renderer': { set_view_center: noop }, './display': { invalidate: noop, display: noop },
                './minimap': { update_overlay: noop, fit_to: noop }, './party-inspector': { open: noop, render: noop },
                './party-controls': { toggle_drawer: noop, bind: noop }, './tileinfo-dngn': {},
                './workflow-actions': { reason: () => '' }, './chat-context': { update: noop } };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
        });
        for (const [name, file] of [['item-properties', 'static/scripts/item-properties.js'],
            ...['status-icons', 'party-model', 'party-status-model', 'party-faith', 'portrait-status',
                'party-card-status', 'player-card-details', 'party-initiative', 'party-navigation', 'party']
                .map(name => [name === 'party' ? name : './' + name, 'game_data/static/' + name + '.js'])]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        const state = { controlled_slot: 0, controllable_slots: [0, 1, 2, 3], members: [
            poison, hero(['on fire'], { slot: 1, name: 'Lyra' }),
            hero(['regenerating'], { slot: 2, name: 'Orin', real_hp_max: 50 }),
            hero(['lethally poisoned (24 -> 0)'], { slot: 3, name: 'Nessa', poison_survival: 0 })
        ].map(member => ({ ...member, species: 'Human', job: 'Fighter', alive: true, mp: 3, mp_max: 3,
            place: 'D:1', weapon: '', resists: {}, spells: [], mutations: [] })) };
        const render = data => page.evaluate(data => window.modules.party.state(data), data);
        await render(state);
        const bar = slot => page.locator('#party_hp_' + slot);
        assert.equal(await bar(0).locator('.party-hp-fill').evaluate(node => node.style.width), '30%');
        assert.equal(await bar(0).locator('.party-hp-poison').evaluate(node => node.style.width), '30%');
        assert.equal(await bar(0).locator('.party-bar-label').textContent(), 'HP 24/40 → 12');
        assert.equal(await bar(0).getAttribute('aria-valuenow'), '24');
        assert.match(await bar(3).getAttribute('aria-valuetext'), /lethal poison/);
        assert.equal(await bar(3).locator('.party-hp-warning').textContent(), '!');
        const fillColor = slot => bar(slot).locator('.party-hp-fill').evaluate(node => getComputedStyle(node).backgroundImage);
        assert.notEqual(await fillColor(0), await fillColor(1));
        assert.notEqual(await fillColor(1), await fillColor(2));
        assert.equal(await bar(2).locator('.party-hp-drained').evaluate(node => node.style.width), '20%');
        await page.screenshot({ path: path.join(output, 'health-effects.png'), fullPage: true });
        // HP stays fixed while the native poison estimate changes: invalidate the card cache.
        state.members[0].poison_survival = 18;
        await render(state);
        assert.equal(await bar(0).locator('.party-hp-poison').evaluate(node => node.style.width), '15%');
        assert.equal(await bar(0).locator('.party-bar-label').textContent(), 'HP 24/40 → 18');
        await bar(0).focus(); await page.keyboard.press('5');
        assert.deepEqual(await page.evaluate(() => window.sent), [], 'Inspecting health never sends a dungeon action');
        state.members[0].statuses = []; state.members[0].poison_survival = 24;
        state.members[1].statuses = [];
        await render(state);
        assert.equal(await bar(0).locator('.party-hp-poison').count(), 0);
        assert.equal(await bar(0).getAttribute('data-health-effects'), '');
        assert.equal(await bar(1).getAttribute('data-health-effects'), '');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_hp_0', 'Snapshot refresh preserves focused health help');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await bar(3).locator('.party-hp-poison').evaluate(node => getComputedStyle(node).animationName), 'none');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, forecastSegments: true, statusOnlyUpdates: true,
            heroIsolation: true, expiry: true, keyboardIsolation: true, errors, output }));
    } finally { await browser.close(); }
}
browserProof().catch(error => { console.error(error); process.exitCode = 1; });
