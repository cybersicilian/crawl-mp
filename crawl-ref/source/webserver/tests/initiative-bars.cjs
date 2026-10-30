/* Clock semantics and controlled browser presentation; no gameplay is simulated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let model;
vm.runInNewContext(fs.readFileSync(path.join(root, 'game_data/static/party-model.js'), 'utf8'), {
    define(dependencies, factory) { model = factory(); }
});
const snapshot = {
    world_aut_clock: 100, active_slot: 0, controlled_slot: 0,
    controllable_slots: [0, 1, 2, 3], gold: 0,
    members: [100, 106, 110, 100].map((clock, slot) => ({
        slot, name: ['Moss', 'Lyra', 'Orin', 'Nessa'][slot], aut_clock: clock,
        aut_lead: clock - 100, alive: true, on_same_level: true, active: slot === 0,
        species: 'Human', job: 'Fighter', place: 'D:1', hp: 20, hp_max: 20,
        mp: 3, mp_max: 3, move_aut: 10, atk_aut: 7, weapon: '',
        statuses: [], spells: [], mutations: [], resists: {}
    }))
};
const balances = data => JSON.parse(JSON.stringify(model.initiativeTimeline(data)));
assert.deepEqual(balances(snapshot).map(({ banked, debt, status }) => [banked, debt, status]), [
    [10, 0, 'banked'], [4, 6, 'mixed'], [0, 10, 'debt'], [10, 0, 'banked']
]);
// Recovery and banked time share one horizon but represent separate facts.
for (const entry of balances(snapshot)) assert.equal(entry.banked + entry.debt, 10);
for (const excluded of [{ alive: false }, { ghost_haunting: true }, { hp: 0 }, { on_same_level: false }]) {
    const data = structuredClone(snapshot);
    Object.assign(data.members[2], excluded, { aut_clock: 900 });
    assert.equal(balances(data)[0].banked, 6, 'Inactive clocks cannot inflate catch-up time');
    assert.equal(balances(data)[2].banked, undefined);
}
for (const missing of [data => { delete data.world_aut_clock; },
    data => { delete data.members[1].aut_clock; }, data => { data.members[1].aut_clock = '106'; }]) {
    const data = structuredClone(snapshot); missing(data);
    assert(balances(data).every(entry => entry.status === 'unknown'));
}
const synced = structuredClone(snapshot);
synced.world_aut_clock = 110;
synced.members.forEach(member => { member.aut_clock = 110; });
assert(balances(synced).every(entry => entry.status === 'ready' && entry.banked === 0 && entry.debt === 0));
const signature = model.cardSignature(snapshot, 0, false);
const changed = structuredClone(snapshot);
changed.members[2].aut_clock = 140; changed.members[2].aut_lead = 40;
assert.equal(model.cardSignature(changed, 0, false), signature, 'Clock-only packets preserve card focus');
const monsters = data => JSON.parse(JSON.stringify(model.monsterTiming(data)));
assert.deepEqual(monsters(snapshot), { status: 'credit', credit: 10, debt: 0, world: 100, horizon: 110 });
assert.equal(monsters({ ...snapshot, controlled_slot: 2 }).credit, 10, 'Shared monster time does not follow selected hero');
assert.equal(monsters(synced).status, 'ready');
assert.equal(monsters(synced).credit, 0);
const ahead = structuredClone(snapshot); ahead.world_aut_clock = 125;
assert.deepEqual(monsters(ahead), { status: 'debt', credit: 0, debt: 15, world: 125, horizon: 110 });
for (const excluded of [{ alive: false }, { ghost_haunting: true }, { hp: 0 }, { on_same_level: false }]) {
    const data = structuredClone(snapshot);
    Object.assign(data.members[2], excluded, { aut_clock: 900 });
    assert.equal(monsters(data).credit, 6, 'Inactive clocks do not inflate monster credit');
}
for (const data of [null, {}, { ...snapshot, enabled: false },
    { ...snapshot, members: [] }, { ...snapshot, world_aut_clock: '100' },
    { ...snapshot, world_aut_clock: Infinity }, { ...snapshot, members: [{ alive: false }] },
    { ...snapshot, members: [{ aut_clock: NaN }] }])
    assert.deepEqual(monsters(data), { status: 'unknown', credit: null, debt: null });

async function browserProof() {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const output = process.env.INITIATIVE_PROOF_DIR || '/tmp/dcss-initiative-proof';
    fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><main id="normal" style="width:340px; padding:10px">'
            + '<div id="party_hud"><div id="party_hud_members"></div></div>'
            + '<div id="party_progress"></div><div id="dcss_quick_dock"></div></main></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/materials.css',
            'game_data/static/styles/game-coop.css', 'game_data/static/styles/tabletop-party.css',
            'game_data/static/styles/gameplay-shell.css', 'game_data/static/styles/hud-workspace.css',
            'game_data/static/styles/hud-polish.css', 'game_data/static/styles/party-initiative.css',
            'game_data/static/styles/party-card-status.css', 'game_data/static/styles/hud-reflow.css',
            'game_data/static/styles/party-faith.css',
            'game_data/static/styles/party-progress.css']) {
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        }
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const noop = () => {};
            window.testCommands = [];
            window.testInspections = [];
            window.modules = { jquery: window.jQuery,
                comm: { send_message: (...args) => window.testCommands.push(args) },
                client: { is_party_member: () => false, is_watching: () => Boolean(window.watching) },
                './dungeon_renderer': { set_view_center: noop },
                './display': { invalidate: noop, display: noop },
                './minimap': { update_overlay: noop, fit_to: noop },
                './party-inspector': { open: slot => window.testInspections.push(slot), render: noop,
                    ensure: noop, tooltips: noop, hotkeys: noop },
                './status-icons': { decorate: noop, icon: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
                './tileinfo-dngn': {},
                './workflow-actions': { reason: () => '' }, './chat-context': { update: noop },
                './party-doom': { update: noop },
                './party-trade': { button: () => window.jQuery('<button type="button" class="party-mini-btn">Trade</button>') },
                'item-properties': { render: text => document.createTextNode(text) }
            };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
        });
        for (const [name, file] of [['item-properties', '../../static/scripts/item-properties.js'],
            ['./effect-icon-catalog', 'effect-icon-catalog.js'], ['./effect-icon-art', 'effect-icon-art.js'], ['./status-icons', 'status-icons.js'], ['./frame-update', 'frame-update.js'],
            ['./hud-iconography', 'hud-iconography.js'], ['./party-model', 'party-model.js'], ['./party-status-model', 'party-status-model.js'],
            ['./party-faith', 'party-faith.js'], ['./portrait-status', 'portrait-status.js'], ['./party-card-status', 'party-card-status.js'], ['./player-card-details', 'player-card-details.js'], ['./party-initiative', 'party-initiative.js'],
            ['./party-navigation', 'party-navigation.js'], ['./party-controls', 'party-controls.js'], ['party', 'party.js']]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', file) });
        }
        const render = data => page.evaluate(data => {
            window.modules.party.state(data);
            window.modules['./hud-iconography'].init();
        }, data);
        await render(snapshot);
        const meters = page.locator('.party-initiative');
        assert.equal(await meters.count(), 4);
        assert.deepEqual(await meters.allTextContents(), ['', '', '', ''], 'No visible timing text');
        assert.equal(await meters.nth(1).getAttribute('data-timing-state'), 'mixed');
        assert.match(await meters.nth(1).getAttribute('aria-label'), /Lyra.*Recovering with catch-up time/);
        assert(await meters.evaluateAll(nodes => nodes.every(node =>
            ['aria-label', 'data-tip-title', 'data-tip-body', 'data-tip-meta'].every(name =>
                !/\d/.test(node.getAttribute(name) || '')))), 'Initiative labels and descriptions use no numeric timing');
        assert.equal(await meters.nth(0).locator('.initiative-bank i').evaluate(el => el.style.width), '50%');
        assert.equal(await meters.nth(2).locator('.initiative-debt i').evaluate(el => el.style.width), '50%');
        assert(await meters.nth(2).locator('.initiative-debt i').evaluate(el => getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient')));
        await meters.nth(1).focus();
        await page.evaluate(() => { window.originalMeter = document.activeElement; });
        await render(changed);
        assert(await page.evaluate(() => document.activeElement === window.originalMeter), 'Live clocks retain focus and DOM nodes');
        assert.equal(await meters.nth(0).locator('.initiative-bank i').evaluate(el => el.style.width), '100%');
        assert.equal(await meters.nth(1).locator('.initiative-bank i').evaluate(el => el.style.width), '85%');
        await meters.nth(1).press('Enter');
        await meters.nth(1).click();
        assert.deepEqual(await page.evaluate(() => [window.testCommands, window.testInspections]), [[], []]);
        await render(snapshot);
        await page.screenshot({ path: path.join(output, 'banked-mixed-debt.png') });
        for (const width of [300, 340]) {
            await page.locator('#normal').evaluate((el, width) => { el.style.width = width + 'px'; }, width);
            assert(await meters.evaluateAll(elements => elements.every(el => {
                const r = el.getBoundingClientRect(); const card = el.closest('.party-card').getBoundingClientRect();
                return r.width >= 70 && r.left >= card.left && r.right <= card.right;
            })), 'Meters fit narrow hero cards');
        }
        await render(synced);
        assert.equal(await page.locator('.party-initiative[data-timing-state="ready"]').count(), 4);
        const unavailable = structuredClone(snapshot); delete unavailable.world_aut_clock;
        await render(unavailable);
        assert.equal(await page.locator('.party-initiative[data-timing-state="unknown"]').count(), 4);
        await page.evaluate(() => window.jQuery('#party_progress').append(window.modules['./party-initiative'].createMonster()));
        const timing = page.locator('#party_progress_monsters'), yieldButton = page.locator('#party_yield_btn');
        const connectionState = structuredClone(snapshot);
        connectionState.multiplayer = true;
        connectionState.members[0].queued_action = 'move';
        connectionState.members[0].queued_action_count = 3;
        connectionState.members[1].connected = false;
        connectionState.members[2].activity = 'rest';
        await render(connectionState);
        assert.equal(await page.locator('[data-party-slot="0"] .party-member-activity').textContent(), 'Queued (3)');
        assert.equal(await page.locator('[data-party-slot="1"] .party-member-activity').textContent(), 'Disconnected');
        assert.match(await page.locator('#party_xp_1').getAttribute('data-tip-body'), /until they reconnect/);
        assert.equal(await page.locator('[data-party-slot="2"] .party-member-activity').textContent(), 'Resting');
        assert.equal(await yieldButton.textContent(), 'Clear queue');
        await yieldButton.click();
        assert.deepEqual(await page.evaluate(() => window.testCommands.pop()), ['party_activity', { action: 'cancel' }]);
        await page.screenshot({ path: path.join(output, 'connection-and-queue.png') });
        assert(await page.locator('.party-member-state').evaluateAll(elements => elements.every(element => {
            const bounds = element.getBoundingClientRect();
            const card = element.closest('.party-card').getBoundingClientRect();
            return bounds.width > 80 && bounds.left >= card.left && bounds.right <= card.right;
        })), 'Connection and queue status fit inside narrow hero cards');
        await page.locator('#party_xp_1').focus();
        connectionState.members[1].connected = true;
        await render(connectionState);
        assert.equal(await page.locator('[data-party-slot="1"] .party-member-activity').textContent(), 'Exploring');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_xp_1');
        const renderMode = async data => {
            await render(data);
            await page.evaluate(data => window.modules['./party-initiative'].updateMonster(
                window.jQuery('#party_progress_monsters'), data), data);
        };
        assert.equal(await timing.isVisible(), false, 'Monster timing starts hidden before native state');
        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 900 });
            for (const members of [snapshot.members.slice(0, 1), snapshot.members]) {
                await renderMode({ ...snapshot, multiplayer: false, members });
                assert.equal(await yieldButton.isVisible(), false, 'Solo Yield stays hidden, including with companions');
                assert.equal(await timing.isVisible(), false, 'Solo monster timing stays hidden, including with companions');
            }
            await renderMode({ ...snapshot, multiplayer: true });
            assert(await yieldButton.isVisible(), 'Multiplayer Yield remains directly available');
            assert(await timing.isVisible(), 'Multiplayer monster timing remains available');
            assert.match(await timing.getAttribute('aria-label'), /World catching up/);
            assert(!/\d/.test(await timing.textContent()), 'The shared tracker has no numeric readout');
            await page.evaluate(() => { window.watching = true; });
            await renderMode({ ...snapshot, multiplayer: true });
            assert.equal(await yieldButton.isVisible(), false, 'Spectators cannot Yield');
            assert(await timing.isVisible(), 'Multiplayer spectators can inspect timing');
            await page.evaluate(() => { window.watching = false; });
            await renderMode(snapshot);
            assert.equal(await timing.isVisible(), false, 'Missing multiplayer flag hides timing after a multiplayer game');
            assert.equal(await yieldButton.isVisible(), false);
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, clockSemantics: true, visualMeters: true,
            liveFocus: true, commonScale: true, keyboardIsolation: true, narrowCards: true,
            soloAndMultiplayerVisibility: true, output }));
    } finally { await browser.close(); }
}
if (process.argv.includes('--browser')) browserProof().catch(error => { console.error(error); process.exitCode = 1; });
else console.log('Initiative clock contracts passed. Use --browser for controlled browser proof.');
