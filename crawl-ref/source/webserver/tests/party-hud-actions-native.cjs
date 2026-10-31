const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real HUD with controlled snapshots and intercepted actions; never a human save. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8895';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.HUD_PROOF_DIR || '/tmp/dcss-party-hud-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(url);
        await signInTestAccount(page, 'PartyHUD' + Date.now().toString().slice(-8), 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
        await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('4 heroes'));
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return name && require(name).ready();
        });
        const nativeView = () => page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
            return { size: require(name).cell_width, clock: window.crawl_party.state.world_aut_clock };
        });
        const beforeZoom = await nativeView();
        await page.locator('#hud_zoom_in').click();
        assert((await nativeView()).size > beforeZoom.size, 'Relocated zoom control still changes the native view');
        await page.locator('#hud_zoom_reset').click();
        assert.deepEqual(await nativeView(), beforeZoom, 'Zoom and reset spend no native turns');
        const fixture = await page.evaluate(() => {
            const data = structuredClone(window.crawl_party.state);
            data.controlled_slot = 0; data.inventory_use = true; data.gold = 173;
            data.members.forEach((hero, index) => {
                hero.player_id = 'controlled-hud-' + index + '-' + Date.now();
                hero.place = index === 2 ? 'D:2' : 'D:1'; hero.on_same_level = index !== 2;
                hero.pos = index === 0 ? { x: 0, y: 0 } : { x: 3 + index, y: -4 };
                hero.aut_clock = data.world_aut_clock + [0, 6, 10, 0][index]; hero.aut_lead = [0, 6, 10, 0][index];
                hero.xl_next = [23, 68, 42, 0][index];
                hero.runes = index === 0 ? ['serpentine', 'barnacled'] : index === 2 ? ['serpentine', 'silver'] : [];
                hero.runes_known = true;
            });
            data.members[0].mp = 6; data.members[0].mp_max = 6;
            data.members[0].spells = [{ id: 901, name: 'Magic Dart', letter: 'a', mp_cost: 1, fail: '0%', level: 1, schools: 'Conjurations' }];
            data.members[0].abilities = [{ id: 902, name: 'Evoke Blink', hotkey: 'b', cost: 'None', fail: '0%' }];
            Object.assign(data.members[0], { name: 'Aster with an exceptionally long expedition name',
                god: 'Trog', piety_rank: 4, penance: 0, god_relation: 'Shared Covenant', statuses: [
                    { id: 501, text: 'Berserk (expiring)', light: 'Berserk', is_bad: false, dur: 3, desc: 'Moving and acting quickly.' },
                    { id: 502, text: 'Poisoned', light: 'Pois', is_bad: true, dur: 6, desc: 'Poison is damaging this hero.' }
                ] });
            Object.assign(data.members[1], { god: 'Sif Muna', piety_rank: 3, penance: 8, god_relation: 'Rival', statuses: [
                { id: 503, text: 'Confused', light: 'Conf', is_bad: true, dur: 4, desc: 'Unable to act reliably.' },
                { id: 504, text: 'Silenced', light: 'Sil', is_bad: true, dur: 9, desc: 'Unable to cast spells.' }
            ] });
            Object.assign(data.members[2], { god: 'Gozag', piety_rank: 6, penance: 0, statuses: [] });
            Object.assign(data.members[3], { god: 'Xom', piety_rank: 6, penance: 0, statuses: [] });
            delete data.members[3].pos;
            return data;
        });
        const install = () => page.evaluate(() => {
            const names = Object.keys(require.s.contexts._.defined);
            const partyName = names.find(name => name.endsWith('/party'));
            window.hudRender = state => require(partyName).state(state);
            window.hudPackets = [];
            require('comm').send_message = (msg, fields) => window.hudPackets.push({ msg, ...fields });
        });
        const render = data => page.evaluate(data => window.hudRender(data), data);
        const packets = () => page.evaluate(() => { const result = window.hudPackets; window.hudPackets = []; return result; });
        await install(); await render(fixture);
        const cards = page.locator('.party-card');
        assert.equal(await page.locator('.party-member-state[role="progressbar"]').count(), 4);
        assert.deepEqual(await page.locator('.party-member-state').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-valuenow'))),
            ['23', '68', '42', '0']);
        assert.equal(await cards.first().locator('#stats_xl, #stats_time').filter({ visible: true }).count(), 0);
        assert.equal(await page.locator('.party-self-details [role="progressbar"]').count(), 0);
        await page.locator('#party_xp_1').focus();
        await page.locator('#party_xp_1').press('Enter');
        await page.locator('#party_xp_1').click();
        assert.deepEqual(await packets(), [], 'Reading level progress never spends a turn');
        const progressed = structuredClone(fixture); progressed.members[1].xl_next = 69;
        await render(progressed);
        assert.equal(await page.locator('#party_xp_1').getAttribute('aria-valuenow'), '69', 'XP-only snapshots repaint');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_xp_1');
        const capped = structuredClone(fixture); capped.members[2].xl = 27; delete capped.members[2].xl_next;
        delete capped.members[3].xl_next;
        await render(capped);
        assert.equal(await page.locator('#party_xp_2').getAttribute('data-progress-state'), 'capped');
        assert.equal(await page.locator('#party_xp_2').getAttribute('aria-valuenow'), '100');
        assert.equal(await page.locator('#party_xp_3').getAttribute('data-progress-state'), 'unknown');
        assert.equal(await page.locator('#party_xp_3').getAttribute('aria-valuenow'), null);
        await render(fixture);
        await page.locator('#party_banner_cycle').click();
        assert.deepEqual(await packets(), [{ msg: 'cycle_player' }], 'Relocated next-hero control keeps its native handler');
        assert.equal(await page.locator('#party_hud_header, #party_rules, #party_banner_sim_toggle, #party_banner_inspect').count(), 0);
        assert.equal(await page.locator('#party_progress #party_hud_gold').count(), 1);
        assert.equal(await page.locator('#stats #party_hud_gold').count(), 0);
        assert.equal(await page.locator('#party_hud_gold').textContent(), '173');
        assert.equal(await page.locator('#party_progress_floor .party-context-value').textContent(), 'D:1');
        assert.deepEqual(await page.locator('.party-progress-rune').evaluateAll(nodes => nodes.map(node => node.dataset.runeName)),
            ['serpentine', 'barnacled', 'silver']);
        await page.waitForFunction(() => document.querySelectorAll('.party-progress-rune .party-rune-art[data-art="ready"] canvas').length === 3);
        assert(!(await page.locator('#action-panel').isVisible()), 'Party progress replaces the legacy top-left item strip');
        assert.equal(await cards.first().locator('.party-card-sections #hud_powers').count(), 1);
        assert.equal(await cards.first().locator('.party-card-sections #hud_inventory').count(), 1);
        assert.equal(await page.locator('#hud_powers, #hud_inventory').count(), 2);
        assert.equal(await cards.first().locator('.personal-stat-reading').count(), 6);
        assert.equal(await cards.first().locator('#stats .stats_caption:visible').count(), 0);
        await page.waitForFunction(() => document.querySelectorAll('#hud_powers canvas[data-power-art="native"]').length === 2);
        assert.equal(await page.locator('.party-card:first-child.is-controlled-card #stats').count(), 1);
        await page.evaluate(() => {
            window.originalNativeStats = document.getElementById('stats');
            window.originalCardPanels = ['hud_powers', 'hud_inventory'].map(id => document.getElementById(id));
        });
        assert.equal(await page.locator('#right_column > #stats, #hud_sidebar_scroll > #stats').count(), 0);
        assert(!(await page.locator('#party_turn_banner').isVisible()));
        assert(await page.locator('#monster_list').evaluate(node => node.getBoundingClientRect().height <= 72),
            'Nearby creatures never create a large empty lower sidebar panel');
        assert.equal(await page.locator('#mission_bar_tools #hud_zoom_controls button').count(), 3);
        assert.equal(await page.locator('#mission_bar_tools #party_banner_cycle, #mission_bar_tools #party_banner_center').count(), 2);
        assert(await cards.first().evaluate(card => card.getBoundingClientRect().top
            - document.getElementById('party_hud').getBoundingClientRect().top <= 12), 'Roster starts directly with heroes');
        assert.equal(await page.locator('#quickbar_commands #workflow_compact_btn').count(), 1);
        const iconRoles = await page.locator('#quickbar_primary .tt-icon').evaluateAll(nodes => nodes.map(node => node.dataset.uiIcon));
        assert.deepEqual(iconRoles, ['explore', 'autofight', 'rest', 'pickup']);
        assert.equal(await page.locator('#quickbar_primary .tt-icon image').count(), 4, 'Frequent actions use actual sprite artwork');
        const spritePixels = await page.locator('#quickbar_primary .tt-icon image').first().evaluate(async node => {
            const image = new Image();
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = node.href.baseVal; });
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
            for (let i = 0; i < data.length; i += 4) if (data[i + 3]) colors.add([...data.slice(i, i + 3)].join(','));
            return { url: image.src, width: image.width, height: image.height, colors: colors.size,
                tileSize: require('item-properties').iconAtlas().size };
        });
        assert.match(spritePixels.url, /\/static\/ui-sprites\/hud-sprites\.[a-f0-9]+\.png$/);
        assert(spritePixels.width > 20 && spritePixels.height > 20 && spritePixels.colors > 20,
            'The shared atlas loads real colored raster pixels');
        assert.equal(spritePixels.tileSize, 16, 'Imported UI art retains native 16px sprite frames');
        const iconSizes = () => page.locator('.tt-icon[data-ui-sprite]:visible').evaluateAll(nodes => nodes.map(node => {
            const style = getComputedStyle(node);
            return { name: node.dataset.uiIcon, width: parseFloat(style.width), height: parseFloat(style.height) };
        }));
        assert((await iconSizes()).every(icon => icon.width === 16 && icon.height === 16),
            'Cards, stats, effects, faith marks, filters and controls render the shared icons at native 16px');
        assert.equal(await cards.first().locator('.party-inspect-btn > .tt-icon').getAttribute('data-ui-icon'), 'inspect');
        assert.equal(await cards.first().locator('.party-camera-btn > .tt-icon').getAttribute('data-ui-icon'), 'camera');
        assert.equal(await cards.nth(1).locator('.party-control-btn > .tt-icon').getAttribute('data-ui-icon'), 'control');
        assert.equal(await page.locator('#party_progress_floor .tt-icon').count(), 1);
        assert.equal(await page.locator('#quickbar_categories button > .tt-icon').count(), 4);
        assert.equal(await cards.first().locator('.party-portrait').getAttribute('data-portrait-status'), 'berserk poison');
        assert.equal(await cards.first().locator('.portrait-status-layer').count(), 2);
        assert(await page.locator('.portrait-status-interior').evaluateAll(nodes => nodes.every(node =>
            getComputedStyle(node).pointerEvents === 'none' && getComputedStyle(node).overflow === 'hidden')));
        const moving = await page.locator('.party-portrait').evaluateAll(nodes => nodes.flatMap(node => node.getAnimations({ subtree: true }))
            .filter(animation => animation.playState === 'running').length);
        assert(moving > 0 && moving <= 60, 'Shrines and status interiors animate within a bounded budget');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert(await page.locator('.party-portrait').evaluateAll(nodes => nodes.every(node =>
            node.getAnimations({ subtree: true }).every(animation => animation.playState !== 'running'))),
            'Reduced motion freezes the decorative animation');
        assert.equal(await cards.first().locator('.portrait-status-layer:visible').count(), 2,
            'Reduced motion retains static status cues');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        assert.match(await cards.nth(1).locator('.party-compass').getAttribute('aria-label'), /NE.*4 tiles/);
        assert(await cards.nth(2).locator('.compass-unknown').isVisible());
        assert.equal(await page.locator('.party-compass > svg.compass-rose').count(), 4);
        assert.equal(await page.locator('.party-compass > svg.compass-needle').count(), 4);
        assert.equal(await cards.nth(1).locator('.compass-needle').evaluate(node => node.style.transform), 'rotate(45deg)',
            'SVG class names must survive the native jQuery version so the needle rotates toward the hero');
        assert(await page.locator('.party-compass').evaluateAll(nodes => nodes.every(node => {
            const style = getComputedStyle(node);
            return style.borderTopWidth === '1px' && style.borderRadius === '50%' && style.boxSizing === 'border-box';
        })), 'Every compass rose has an integrated rim without changing its geometry');
        assert(await cards.nth(2).locator('.party-navigate-btn').isDisabled());
        assert(await cards.nth(3).locator('.party-navigate-btn').isDisabled());
        await cards.nth(1).getByRole('button', { name: 'Navigate to Lyra', exact: true }).click();
        assert.deepEqual(await packets(), [{ msg: 'click_cell', x: 4, y: -4, button: 1 }]);
        await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/enums'));
            window.hudModes = require(name).mouse_mode;
            window.jQuery(document).trigger('game_input_changed', [window.hudModes.TARGET]);
        });
        assert(await cards.nth(1).locator('.party-navigate-btn').isDisabled());
        await cards.nth(1).locator('.party-navigate-btn').evaluate(element => element.click());
        assert.deepEqual(await packets(), [], 'Navigation cannot become a targeting click');
        await page.evaluate(() => window.jQuery(document).trigger('game_input_changed', [window.hudModes.COMMAND]));
        // Revalidate the floor at activation even if a snapshot changes before repaint.
        await page.evaluate(() => { window.crawl_party.state.members[1].place = 'D:2'; });
        await cards.nth(1).locator('.party-navigate-btn').click();
        assert.deepEqual(await packets(), []);
        await render(fixture);
        assert.equal(await page.locator('.party-ping-heading .tt-icon').count(), 1);
        assert(!(await page.locator('#party_ping_toolbar').innerText()).includes('Signal'));
        // Active effects and religion stay visible in the ordinary compact roster.
        assert.equal(await page.locator('.party-effect:visible').count(), 4);
        assert.deepEqual(await page.locator('.party-effect').allTextContents(), ['', '', '', '']);
        assert.equal(await page.locator('.party-effect.is-bad .party-effect-warning').count(), 3);
        assert.equal(await cards.nth(0).locator('.party-portrait').getAttribute('data-faith-tier'), '4');
        assert.equal(await cards.nth(1).locator('.party-faith.is-penance').count(), 1);
        assert.equal(await cards.nth(2).locator('.party-faith-favor').count(), 0);
        assert.equal(await cards.nth(3).locator('.party-faith-favor').count(), 0);
        const originalFaithLayers = await cards.first().locator('.faith-craft:not([display=none])').count();
        await page.waitForFunction(() => document.querySelectorAll('.party-faith[data-faith-art="native"]').length === 4);
        assert.equal(await page.locator('.party-faith > canvas').count(), 4);
        await page.locator('#party_effect_0_502').focus();
        await page.keyboard.press('Enter'); await page.keyboard.press('Space');
        assert.deepEqual(await packets(), [], 'Reading an effect never spends a turn');
        const changedFaith = structuredClone(fixture);
        changedFaith.members[0].piety_rank = 2; changedFaith.members[0].penance = 5;
        changedFaith.members[0].statuses[1].dur = 5;
        await render(changedFaith);
        assert(await page.evaluate(() => document.getElementById('stats') === window.originalNativeStats), 'Repainting preserves native HUD nodes and handlers');
        assert(await page.evaluate(() => window.originalCardPanels.every(panel => panel === document.getElementById(panel.id))),
            'Card repaint retains original inventory and power panels');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_effect_0_502');
        assert.equal(await cards.nth(0).locator('.party-portrait').getAttribute('data-faith-tier'), '2');
        assert((await cards.first().locator('.faith-craft:not([display=none])').count()) < originalFaithLayers);
        assert(await cards.nth(0).locator('.party-faith').getAttribute('aria-label').then(label => label.includes('Under penance')));
        assert.match(await page.locator('#party_effect_0_502').getAttribute('aria-label'), /5 standard turns/);
        const unknown = structuredClone(fixture);
        delete unknown.members[3].god; delete unknown.members[3].statuses; delete unknown.members[3].statuses_known;
        await render(unknown);
        assert.equal(await cards.nth(3).locator('.party-faith.is-unknown').count(), 1);
        assert.equal(await cards.nth(3).locator('.party-effect.is-unknown').count(), 1);
        unknown.members[3].god = ''; unknown.members[3].statuses = [];
        await render(unknown);
        assert.equal(await cards.nth(3).locator('.party-faith.is-unaffiliated').count(), 1);
        assert.equal(await cards.nth(3).locator('.party-effect').count(), 0);
        await render(fixture);
        await cards.nth(1).locator('.party-faith').click();
        assert.equal(await page.locator('#party_insp_tab_abilities').getAttribute('aria-selected'), 'true');
        assert.match((await page.locator('.party-insp-hero-meta').allTextContents()).join(' '), /Sif Muna.*Under penance/);
        await page.locator('#party_inspector_close_btn').click();
        assert.deepEqual(await packets(), [], 'Inspecting faith is turn-free');
        await page.evaluate(() => {
            const names = Object.keys(require.s.contexts._.defined);
            const player = require(names.find(name => name.endsWith('/player')));
            const hud = require(names.find(name => name.endsWith('/player-hud')));
            hud.create(Object.assign({}, player, { status: [{ light: 'Pois', text: 'Poisoned', col: 4, desc: 'Controlled native status display.' }] }))();
        });
        assert.equal(await page.locator('#stats_status_lights .status_light').textContent(), '');
        assert.equal(await page.locator('#stats_status_lights .status_light .party-effect-warning').count(), 1);
        await page.evaluate(() => {
            const names = Object.keys(require.s.contexts._.defined);
            require(names.find(name => name.endsWith('/player-hud'))).create(require(names.find(name => name.endsWith('/player'))))();
        });

        const item = fixture.members[0].inventory[0];
        await page.locator('#quickbar_slot_0').click();
        await page.locator('#quickbar_entry_item_' + item.slot).click();
        await page.locator('#quickbar_slot_1').click();
        await page.locator('[data-quick-category="spell"]').click();
        await page.locator('#quickbar_entry_spell_901').click();
        await page.locator('#quickbar_slot_2').click();
        await page.locator('[data-quick-category="ability"]').click();
        await page.locator('#quickbar_entry_ability_902').click();
        assert.equal(await page.locator('#quickbar_slots canvas[data-power-art="native"]').count(), 2);
        await page.locator('#quickbar_slot_0').click();
        assert.deepEqual(await packets(), [{ msg: 'inv_item_use', slot: item.slot, expected_slot: 0, expected_name: item.name }]);
        await page.locator('#quickbar_slot_1').click();
        assert.deepEqual(await packets(), [{ msg: 'power_action', expected_slot: 0, id: 901, letter: 'a', kind: 'spell' }]);
        await page.locator('#quickbar_slot_2').click();
        assert.deepEqual(await packets(), [{ msg: 'power_action', expected_slot: 0, id: 902, letter: 'b', kind: 'ability' }]);
        const noMana = structuredClone(fixture); noMana.members[0].mp = 0;
        await render(noMana); await page.locator('#quickbar_slot_1').evaluate(element => element.click());
        assert.equal(await page.locator('#quickbar_slot_1').getAttribute('aria-disabled'), 'true');
        assert.deepEqual(await packets(), []);
        const other = structuredClone(fixture); other.controlled_slot = 1;
        other.members[1].spells = []; other.members[1].abilities = [];
        await render(other);
        assert.equal(await cards.first().getAttribute('data-party-slot'), '1');
        assert.equal(await cards.first().locator('#stats').count(), 1);
        assert.equal(await cards.first().locator('.party-card-sections #hud_inventory').count(), 1);
        assert.equal(await page.locator('#hud_powers canvas[data-power-art="native"]').count(), 0,
            'Changing heroes immediately clears the previous hero’s powers');
        const offFloor = structuredClone(fixture); offFloor.controlled_slot = 2;
        await render(offFloor);
        assert.equal(await page.locator('#party_progress_floor .party-context-value').textContent(), 'D:2');
        await render(other);
        assert.equal(await page.locator('#quickbar_slots .hud-quick-slot').count(), 1);
        assert.equal(await page.locator('#quickbar_slots .is-empty').count(), 1);
        await render(fixture);
        assert.equal(await page.locator('#quickbar_slots .hud-quick-slot').count(), 4);
        assert.equal(await page.locator('#quickbar_slots .is-empty').count(), 1);
        await page.locator('#hud_item_0_' + item.slot).dragTo(page.locator('#quickbar_slot_3'));
        assert(!(await page.locator('#quickbar_slot_3').getAttribute('class')).includes('is-empty'));
        await page.locator('#quickbar_slot_3').click({ button: 'right' });
        await page.locator('#quickbar_clear').click();
        assert((await page.locator('#quickbar_slot_3').getAttribute('class')).includes('is-empty'));
        await page.locator('#quickbar_search').fill('nonexistent action');
        assert.equal(await page.locator('.quickbar-catalog-action').count(), 0);
        await page.locator('#quickbar_search').fill('');
        await page.locator('#quickbar_search').press('Escape');
        assert.equal(await page.locator('#quickbar_more').getAttribute('open'), null);
        assert.deepEqual(await packets(), [], 'Editing and keyboard input spend no turns');
        const key = fixture.members[0].player_id;
        assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem('dcss.quickbar.v1.' + key))[1].id, key), 901);
        await page.reload();
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.evaluate(() => { location.hash = '#play-coop-2p-web-trunk'; });
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4);
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return name && require(name).ready();
        });
        await install(); await render(fixture);
        assert.equal(await page.locator('#quickbar_slots .hud-quick-slot').count(), 4, 'Assignments survive reload');
        await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/quickbar'));
            window.jQuery(document).off('.quickbar');
            require(name).init(); require(name).init();
        });
        await page.locator('#quickbar_slot_1').click();
        assert.deepEqual(await packets(), [{ msg: 'power_action', expected_slot: 0, id: 901, letter: 'a', kind: 'spell' }]);
        // All ten stored positions remain available without permanent empty boxes.
        for (let index = 3; index < 10; index++) {
            await page.locator('#quickbar_slot_' + index).click();
            await page.locator('[data-quick-category="item"]').click();
            await page.locator('#quickbar_entry_item_' + item.slot).click();
        }
        assert.equal(await page.locator('#quickbar_slots .hud-quick-slot').count(), 10);
        assert.equal(await page.locator('#quickbar_slots .is-empty').count(), 0);
        assert(await page.locator('#dcss_quick_dock').evaluate(el => el.getBoundingClientRect().height <= 34));
        assert.deepEqual(await page.locator('.quickbar-key').allTextContents(), Array.from('1234567890'));
        for (const [index, key] of Array.from('1234567890').entries()) {
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press(key);
            const expected = index === 1 ? { msg: 'power_action', expected_slot: 0, id: 901, letter: 'a', kind: 'spell' }
                : index === 2 ? { msg: 'power_action', expected_slot: 0, id: 902, letter: 'b', kind: 'ability' }
                    : { msg: 'inv_item_use', slot: item.slot, expected_slot: 0, expected_name: item.name };
            assert.deepEqual(await packets(), [expected], key + ' uses its assigned slot through the real game client');
        }
        await page.locator('#dcss_quick_dock').screenshot({ path: path.join(output, 'ten-slot-shortcuts.png') });
        for (let index = 3; index < 10; index++) {
            await page.locator('#quickbar_slot_' + index).click({ button: 'right' });
            await page.locator('#quickbar_clear').click();
            await page.locator('#quickbar_search').press('Escape');
        }
        const density = {};
        await page.mouse.move(1, 1);
        for (const [width, height] of [[1280, 800], [1440, 900], [1024, 768]]) {
            await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
            assert(await page.evaluate(() => {
                const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
                return require(name).cell_width >= 16 && require(name).cell_height >= 16;
            }), 'Reflow preserves a usable native dungeon scale');
            assert(await cards.evaluateAll(cards => cards.every(card => {
                const rect = card.getBoundingClientRect();
                const bars = card.querySelector('.party-bars').getBoundingClientRect();
                const controls = card.querySelector('.party-card-actions').getBoundingClientRect();
                return controls.top >= bars.bottom - 1 && controls.right <= rect.right;
            })));
            assert(await page.locator('.is-controlled-card .party-icon-utility').evaluate(row => {
                const noise = row.querySelector('[data-reading="noise"]').getBoundingClientRect();
                const wielded = row.querySelector('.party-wielded-item').getBoundingClientRect();
                return noise.width > 30 && wielded.width === 34 && row.scrollWidth <= row.clientWidth;
            }), 'Native equipment and icon readings share a fitting utility row');
            assert(await page.locator('.party-member-state').evaluateAll(nodes => nodes.every(node => {
                const bounds = node.getBoundingClientRect(), card = node.closest('.party-card').getBoundingClientRect();
                return bounds.width > 60 && bounds.right <= card.right && node.scrollWidth <= node.clientWidth;
            })), 'Every XP bar fits its player card');
            assert(await cards.evaluateAll(cards => cards.every(card => {
                const level = card.querySelector('.party-member-state').getBoundingClientRect();
                const control = [...card.querySelectorAll('.party-card-actions button')].find(node => node.offsetWidth).getBoundingClientRect();
                return Math.abs(level.height - control.height) < 1 && Math.abs(level.top - control.top) < 1
                    && Math.abs(level.bottom - control.bottom) < 1;
            })), 'Every player level bar aligns exactly with the adjacent controls');
            assert(await cards.evaluateAll(cards => cards.every(card => {
                const controls = card.querySelector('.party-card-actions').getBoundingClientRect();
                const level = card.querySelector('.party-member-state').getBoundingClientRect();
                return Math.abs(level.left - controls.right - 12) < 1;
            })), 'Experience uses the remaining width beside each actual action group');
            assert(await cards.evaluateAll(cards => cards.every(card => {
                const portrait = card.querySelector('.hud-hero-medallion').getBoundingClientRect();
                const compass = card.querySelector('.party-compass').getBoundingClientRect();
                const name = card.querySelector('.party-member-name').getBoundingClientRect();
                const faith = card.querySelector('.party-faith').getBoundingClientRect();
                const bars = card.querySelector('.party-bars').getBoundingClientRect();
                return Math.abs(compass.x + compass.width / 2 - portrait.x - portrait.width / 2) < 1
                    && Math.abs(compass.y + compass.height / 2 - portrait.y) <= 2
                    && (card.classList.contains('is-controlled-card') ? name.top >= faith.bottom
                        : name.left >= portrait.right && name.bottom <= bars.top)
                    && faith.top >= portrait.bottom - 1
                    && Math.abs(faith.x + faith.width / 2 - portrait.x - portrait.width / 2) < 1;
            })), 'Shrine geometry is preserved; companion identity uses the content column');
            assert(await cards.evaluateAll(cards => cards.every(card => {
                const effects = card.querySelector('.party-effect-strip');
                return !effects || effects.getBoundingClientRect().top >= card.querySelector('.party-bars').getBoundingClientRect().bottom;
            })), 'Effects remain visible below health without overlapping it');
            assert(await page.locator('#hud_bottom_row').evaluate(row => {
                const rect = row.getBoundingClientRect(), map = row.querySelector('#hud_bottom_map').getBoundingClientRect();
                const log = row.querySelector('#message_pane').getBoundingClientRect();
                return Math.abs(rect.bottom - innerHeight) < 2 && map.left <= 1 && map.right <= log.left
                    && log.right <= rect.right + 1 && rect.height <= 140 && row.scrollWidth <= row.clientWidth;
            }), 'Minimap and compact log share the bottom strip without overlap');
            assert(await cards.first().locator('.party-member-name').evaluate(name => name.scrollWidth > name.clientWidth
                && getComputedStyle(name).textOverflow === 'ellipsis' && getComputedStyle(name).whiteSpace === 'nowrap'));
            assert(await page.locator('#dcss_quick_dock').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
            density[width] = await page.locator('#dcss_quick_dock').evaluate(el => {
                const bounds = el.getBoundingClientRect();
                const expander = el.querySelector('#quickbar_more > summary').getBoundingClientRect();
                return { height: bounds.height, width: bounds.width, occupiedWidth: expander.right - bounds.left };
            });
            assert(density[width].height <= 34 && density[width].width <= 300,
                'A populated quickbar stays short and keeps its expander beside the actions');
            await page.locator('#hud_sidebar_scroll').evaluate(scroll => { scroll.scrollTop = 0; });
            await page.mouse.move(300, height - 10);
            await page.evaluate(() => { document.activeElement.blur(); window.dcss_tooltips.hide(); });
            await page.screenshot({ path: path.join(output, 'hud-' + width + '.png') });
        }
        await page.locator('#dcss_quick_dock').screenshot({ path: path.join(output, 'compact-bar.png') });
        await page.locator('#hud_sidebar_scroll').evaluate(scroll => { scroll.scrollTop = 0; });
        await cards.first().screenshot({ path: path.join(output, 'controlled-card.png') });
        await page.locator('#party_hud').screenshot({ path: path.join(output, 'party-roster.png') });
        await page.locator('#quickbar_more > summary').click();
        await page.locator('#workflow_compact_btn').click();
        assert.equal(await page.locator('.party-member-meta:visible').count(), 4);
        await page.locator('#workflow_compact_btn').click();
        await page.mouse.move(1, 1);
        await page.evaluate(() => { document.activeElement.blur(); window.dcss_tooltips.hide(); });
        const tray = await page.locator('#quickbar_more_content').boundingBox();
        assert(tray.width <= 360 && tray.height <= 220);
        const spriteDisplay = await iconSizes();
        assert(spriteDisplay.every(icon => icon.width === 16 && icon.height === 16),
            'Expanded quickbar categories and commands retain the same 16px optical size');
        assert.equal(await page.locator('#workflow_compact_btn > .tt-icon').count(), 1);
        assert(await page.locator('#quickbar_commands').evaluate(root => [...root.querySelectorAll('[data-action-group]')]
            .filter(group => group.dataset.actionGroup !== 'combat').every(group => getComputedStyle(group, '::before').display !== 'none')));
        fs.writeFileSync(path.join(output, 'tray-controls.json'), JSON.stringify(await page.locator('#quickbar_commands').evaluate(root => ({
            html: root.outerHTML, groups: [...root.children].map(group => ({ label: group.dataset.label,
                styles: { display: getComputedStyle(group).display, justify: getComputedStyle(group).justifyContent },
                controls: [...group.children].map(button => ({ id: button.id, margin: getComputedStyle(button).margin,
                    x: button.getBoundingClientRect().x, width: button.getBoundingClientRect().width })) }))
        })), null, 2));
        await page.locator('#quickbar_more_content').screenshot({ path: path.join(output, 'compact-tray.png') });
        await page.screenshot({ path: path.join(output, 'expanded-actions.png') });
        // Dense palettes stay bounded with a full pack, without dropping actions.
        const crowded = structuredClone(fixture);
        crowded.members[0].inventory = Array.from({ length: 52 }, (_, index) => ({
            ...item, slot: index, letter: String.fromCharCode(index < 26 ? 97 + index : 65 + index - 26),
            name: 'Controlled inventory item ' + (index + 1)
        }));
        crowded.members[0].spells = Array.from({ length: 30 }, (_, index) => ({
            ...fixture.members[0].spells[0], id: 1000 + index, letter: String.fromCharCode(97 + index % 26)
        }));
        const compactHeights = await page.locator('#hud_powers, #hud_inventory').evaluateAll(nodes => nodes.map(node => node.offsetHeight));
        await render(crowded);
        assert.equal(await page.locator('.quickbar-catalog-action').count(), 52);
        assert(await page.locator('#quickbar_catalog').evaluate(el => el.clientHeight <= 100 && el.scrollHeight > el.clientHeight));
        assert((await page.locator('#quickbar_more_content').boundingBox()).height <= 220);
        assert.equal(await page.locator('#hud_inventory .hud-item-slot').count(), 52);
        assert.equal(await page.locator('#hud_powers .hud-power-button').count(), 31);
        assert(await page.locator('#hud_powers, #hud_inventory').evaluateAll((nodes, heights) => nodes.every((node, index) =>
            node.offsetHeight > heights[index] && getComputedStyle(node).maxHeight === 'none'
            && getComputedStyle(node).overflowY === 'visible'), compactHeights),
            'Actions and inventory grow vertically inside the player card');
        assert(await page.locator('#hud_sidebar_scroll').evaluate(node => node.scrollHeight > node.clientHeight),
            'One sidebar scrollbar reaches every card section');
        await page.locator('#quickbar_search').press('Escape');
        await page.locator('#hud_sidebar_scroll').evaluate(scroll => { scroll.scrollTop = 0; });
        await cards.first().screenshot({ path: path.join(output, 'full-pack-card.png') });
        await render(fixture);
        await page.locator('#quickbar_more > summary').click();
        await page.locator('#quickbar_entry_item_' + item.slot).focus();
        await page.locator('#quickbar_entry_item_' + item.slot).press('Shift+Enter');
        assert.equal(await page.locator('#quickbar_slots .hud-quick-slot').count(), 5);
        assert.deepEqual(await packets(), [], 'Keyboard pinning cannot activate the action');
        await page.locator('#quickbar_slot_3').click({ button: 'right' });
        await page.locator('#quickbar_clear').click();
        assert.deepEqual(errors, []);
        await page.locator('#hud_layout_toggle').click();
        await page.locator('#hud_bottom_map > .hud-panel-move').focus();
        await page.keyboard.press('ArrowRight');
        assert(await page.locator('#hud_bottom_map').evaluate(map => getComputedStyle(map).position === 'fixed'));
        await page.locator('#hud_layout_help button').first().click();
        assert(await page.locator('#hud_bottom_map').evaluate(map => !map.classList.contains('hud-floating')));
        await page.locator('#hud_layout_help button').last().click();
        const evidence = { passed: true, navigationProtocol: true, floorGuard: true, signalIcon: true,
            itemSpellAbilitySlots: true, nativeActionGuards: true, perHeroPersistence: true,
            reload: true, lifecycleRebind: true, dragToPin: true, clearSlot: true,
            keyboardPinning: true, fullInventory: true, fullCapacity: true, narrowLayouts: true,
            iconEffects: true, faithFavorPenance: true, religionExceptions: true, statusKeyboardIsolation: true,
            contentSizedActions: true, portraitCompass: true, faithPlinth: true,
            controlledNameBelowPlinth: true, companionNameBesidePortrait: true,
            integratedPersonalHud: true, nativeStatsPreserved: true, continuousCardSections: true,
            intrinsicSectionGrowth: true, nativePowerArt: true, personalStatVisuals: true,
            sharedPlayerXp: true, xpOnlyUpdates: true, compactNoiseActions: true, elapsedTimeRemoved: true,
            sharedUiIcons: true, coloredUiSprites: true, native16pxIcons: true, spriteDisplay, compactNearbyCreatures: true, alignedLevelBars: true, spritePixels, animatedDeityShrines: true, portraitStatusInteriors: true, reducedMotion: true,
            sharedGoldFloorRuneTracker: true, legacyItemStripReplaced: true, bottomMinimapAndLog: true,
            relocatedViewControls: true, mapWorkspacePreserved: true, nameEllipsis: true, nativeStatusIcons: true, density, tray, output };
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') }); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
