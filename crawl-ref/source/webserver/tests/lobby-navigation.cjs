const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Isolated browser proof: task views, direct resume, discovery, and retained context. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8888';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const output = process.env.NAV_PROOF_DIR || '/tmp/dcss-workspace-proof';
fs.mkdirSync(output, { recursive: true });
let browser, page;
const sent = [], errors = [], evidence = { checkpoints: [] };
async function shot(name) {
    await page.mouse.move(1, 1);
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    await page.screenshot({ path: path.join(output, name + '-viewport.png') });
}
async function view(id, keyboard = false) {
    const link = page.locator(`.lobby-chapters [data-workspace-target='${id}']`);
    if (keyboard) { await link.focus(); await link.press('Enter'); } else await link.click();
    await page.waitForFunction(id => document.querySelector(`.lobby-chapters [data-workspace-target='${id}']`)
        .getAttribute('aria-current') === 'page', id);
    if (keyboard) await page.waitForFunction(id => document.activeElement?.closest('[data-workspace-view]')
        ?.getAttribute('data-workspace-view') === id, id);
    assert.equal(await page.evaluate(() => location.hash), '#lobby');
}
async function roster() {
    return page.locator('.party-slot-box').evaluateAll(nodes => nodes.map(node => ({
        name: node.querySelector('.party-slot-name').value,
        race: node.querySelector('.party-slot-species').value,
        job: node.querySelector('.party-slot-job').value
    })));
}
function quiet(start) {
    assert.deepEqual(sent.slice(start).filter(message => !['ping', 'pong', 'latency_probe'].includes(message.msg)), [],
        'View changes, searching, and filtering must never issue server or game commands');
}
async function loadFixture() {
    await page.evaluate(() => require('comm').handle_message({ msg: 'game_library', player_id: 'qa-account',
        games: Array.from({ length: 5 }, (_, i) => ({ id: 'qa-save-' + i,
            name: i === 2 ? 'Ember Pilgrimage' : 'The Amber Expedition ' + i, status: 'saved', loadable: i !== 4, running: i === 0,
            saved_at: '2026-10-18T12:00:00Z', state: { place: 'Dungeon:3', turns: 120 + i,
                players: [{ name: 'Lyra', species: 'Deep Elf', job: 'Conjurer' }] } })) }));
    await page.waitForFunction(() => document.querySelectorAll('.lobby-recent-entry').length === 2);
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(css|js|svg|png)(\?|$)/.test(response.url()))
            errors.push(response.status() + ' ' + response.url());
    });
    page.on('websocket', socket => socket.on('framesent', frame => {
        try { sent.push(JSON.parse(String(frame.payload))); } catch { /* JSON commands only. */ }
    }));
    await page.goto(url);
    await page.locator('.welcome-intro').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#lobby_navigation').isVisible(), false);
    const account = 'WorkspaceQA' + Date.now().toString(36); evidence.account = account;
    await signInTestAccount(page, account, 'crawl'); await page.locator('#lobby_home').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#game_library_panel').isVisible(), false);
    assert.equal(await page.locator('#party_lobby_panel').isVisible(), false);
    assert.equal(await page.locator('#lobby_body').isVisible(), false);
    assert.equal(await page.locator('#play_now .mode-card').count(), 8);
    assert.equal(await page.locator('#play_now a.edit_rc_link').count(), 1);
    assert.equal(await page.locator('[data-lobby-create]:visible').count(), 1);
    assert.equal(await page.locator('#logout_link').isVisible(), false);
    await shot('play-empty-desktop');
    evidence.checkpoints.push('Focused Play; all eight native modes; one create action; contextual account controls');
    const beforeCreate = sent.length;
    await page.locator('#lobby_home [data-lobby-create]').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    assert.equal(sent.slice(beforeCreate).filter(message => message.msg === 'party_room_create').length, 1);
    assert.equal(await page.locator('#play_now').isVisible(), false);
    await page.getByLabel('Hero 1 name', { exact: true }).fill('Archivist');
    await page.getByLabel('Hero 1 name', { exact: true }).press('Tab');
    await page.locator('#party_slot_species_1_visual_search').fill('Gargoyle');
    await page.locator('#party_slot_species_1_visual_choices [data-value="Gargoyle"]').click();
    await page.waitForTimeout(250);
    const original = await roster(), start = sent.length;
    await view('saved', true); assert(await page.locator('#game_library_panel').isVisible());
    await view('friends'); assert(await page.locator('.lobby-party-notice').isVisible());
    await view('chronicle', true);
    assert(await page.locator('#coop_chronicle_panel').evaluate(el => el.contains(document.activeElement)));
    await page.locator('[data-chronicle-filter="discoveries"]').click();
    await page.getByRole('searchbox', { name: 'Search Chronicle' }).fill('Arga');
    await view('play', true); assert.deepEqual(await roster(), original);
    assert(await page.locator('#party_lobby_panel').evaluate(el => el.contains(document.activeElement)));
    await view('chronicle');
    assert.equal(await page.getByRole('searchbox', { name: 'Search Chronicle' }).inputValue(), 'Arga');
    await page.getByRole('searchbox', { name: 'Search Chronicle' }).fill('no-such-discovery');
    assert(await page.locator('.chronicle-no-results').isVisible());
    await page.getByRole('searchbox', { name: 'Search Chronicle' }).fill('');
    await page.locator('[data-chronicle-filter="all"]').click();
    await page.locator('#lobby_primary_action').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    const launch = await page.locator('#btn_launch_party_room').boundingBox();
    assert(launch.y >= 0 && launch.y + launch.height < 800);
    await page.locator('.party-other-modes').click(); assert(await page.locator('#play_now').isVisible());
    await view('play');
    quiet(start); await shot('party-desktop');
    // The launch bar remains reachable after scrolling through long character cards.
    await page.locator('.party-slot-box:visible').last().scrollIntoViewIfNeeded();
    const sticky = await page.locator('#btn_launch_party_room').boundingBox();
    assert(sticky.y >= 0 && sticky.y + sticky.height < 800);
    await page.locator('#btn_leave_party_room').click(); await page.locator('#lobby_home').waitFor({ state: 'visible' });
    evidence.checkpoints.push('Create once; retain roster and Chronicle filters; return to party; sticky launch and original mode routes');
    await loadFixture();
    const silent = sent.length;
    assert.equal(await page.locator('.lobby-recent-entry [data-library-load]').first().getAttribute('href'), '#expedition-qa-save-0');
    assert.equal(await page.locator('.lobby-nav-count').textContent(), '5');
    await shot('play-populated-desktop');
    await view('saved');
    await page.getByRole('searchbox', { name: 'Find a saved expedition' }).fill('Ember');
    assert.equal(await page.locator('#game_library_panel .game-library-entry:visible').count(), 1);
    await view('play'); await view('saved');
    assert.equal(await page.getByRole('searchbox', { name: 'Find a saved expedition' }).inputValue(), 'Ember');
    quiet(silent);
    await page.evaluate(() => { window.qaSend = window.socket.send.bind(window.socket);
        window.socket.send = payload => { const { msg, ...data } = JSON.parse(payload);
            if (['expedition_open', 'go_lobby'].includes(msg)) window.qaLoad = { msg, data };
            else window.qaSend(payload); }; });
    await page.locator('#game_library_panel .game-library-entry:visible [data-library-load]').click();
    await page.waitForFunction(() => window.qaLoad?.msg === 'expedition_open');
    assert.equal(await page.evaluate(() => window.qaLoad.data.id), 'qa-save-2');
    assert.equal(await page.evaluate(() => location.hash), '#expedition-qa-save-2');
    await page.evaluate(() => { location.hash = '#lobby'; });
    await page.waitForFunction(() => window.qaLoad?.msg === 'go_lobby');
    await view('play'); await page.locator('.lobby-recent-entry [data-library-load]').first().click();
    await page.waitForFunction(() => window.qaLoad?.data?.id === 'qa-save-0');
    await page.evaluate(() => { location.hash = '#lobby'; });
    await page.waitForFunction(() => window.qaLoad?.msg === 'go_lobby');
    await page.evaluate(() => { window.socket.send = window.qaSend; });
    evidence.checkpoints.push('One-click recent Resume and full-library Resume target exact expedition identity; saved search persists');
    await view('friends');
    await page.evaluate(() => {
        const comm = require('comm');
        comm.handle_message({ msg: 'party_rooms_list', rooms: [{ room_id: 'fixture-room', name: 'Copper Kettle',
            host: 'CopperHost', friendly_fire: false, launch_slots: [0], status: 'staging',
            slots: [{ state: 'player', username: 'CopperHost', hero_name: 'Copper', species: 'Minotaur', job: 'Fighter' }] }] });
        comm.handle_message({ msg: 'lobby_clear' });
        for (let i = 0; i < 2; i++) comm.handle_message({ msg: 'lobby_entry', id: 'live-' + i,
            expedition_id: 'live-expedition-' + i, username: i ? 'Juniper' : 'AmberHost',
            game_id: 'coop-2p-web-trunk', xl: 5, char: 'MiFi', place: 'D:3', turn: 120, dur: 70,
            idle_time: 0, god: 'Trog', spectator_count: 2, milestone: 'Entered the Lair' });
        comm.handle_message({ msg: 'lobby_complete' });
    });
    const discoveryStart = sent.length;
    await page.getByRole('searchbox', { name: 'Find a friend or expedition' }).fill('AmberHost');
    assert.equal(await page.locator('#player_list tbody tr:visible').count(), 1);
    assert.equal(await page.locator('#party_rooms_table tbody tr:visible').count(), 0);
    const liveActions = page.locator('#player_list tbody tr:visible .live-expedition-actions');
    assert.equal(await liveActions.locator('.coop-watch-table-btn').getAttribute('href'), '#expedition-live-expedition-0');
    await liveActions.locator('a').evaluateAll(links => links.forEach(link => link.addEventListener('click', event => event.preventDefault(), { once: true })));
    await liveActions.getByRole('link', { name: 'Join co-op', exact: true }).click();
    assert.equal(await page.evaluate(() => window.pending_auto_join_party), true);
    await liveActions.getByRole('link', { name: 'Watch', exact: true }).click();
    assert.equal(await page.evaluate(() => window.pending_auto_join_party), false);
    await page.getByRole('button', { name: 'Show full details' }).click();
    assert(await page.locator('#player_list tbody tr:visible .god').isVisible());
    await page.getByRole('searchbox', { name: 'Find a friend or expedition' }).fill('nothing-matches-qa');
    assert(await page.locator('.lobby-discovery-no-results').isVisible());
    await page.getByRole('searchbox', { name: 'Find a friend or expedition' }).fill('');
    // Native game startup removes jQuery document handlers; these controls must survive.
    await page.evaluate(() => require('jquery')(document).off());
    for (const [width, height] of [[390,844], [768,1024], [1440,900]]) {
        await page.setViewportSize({ width, height });
        for (const id of ['play', 'saved', 'friends', 'chronicle']) {
            await view(id);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id + ' must fit at ' + width);
            await shot(id + '-' + width);
        }
    }
    quiet(discoveryStart);
    evidence.checkpoints.push('Immediate room/live search, no results and full details; populated views fit 390, 768, 1280, 1440px');
    await view('play');
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const roomDisplay = await page.evaluate(() => {
        const room = document.getElementById('party_room_view'), previous = room.style.display;
        document.getElementById('game_library_panel').replaceChildren();
        room.style.display = 'none'; document.getElementById('lobby').style.display = 'none';
        return previous;
    });
    await settle();
    await page.evaluate(() => { document.getElementById('lobby').style.display = ''; });
    await settle();
    assert.equal(await page.locator('.lobby-chapters [aria-current]').getAttribute('data-workspace-target'), 'play');
    await loadFixture(); await page.locator('#game_library_panel').waitFor({ state: 'visible' });
    await page.evaluate(() => { document.getElementById('party_room_view').style.display = 'block'; });
    await settle();
    assert.equal(await page.locator('.lobby-chapters [aria-current]').getAttribute('data-workspace-target'), 'saved',
        'Late party-room restoration cannot steal focus from the saved expedition');
    await page.evaluate(display => { document.getElementById('party_room_view').style.display = display; }, roomDisplay);
    await settle(); await view('friends'); await loadFixture(); await settle();
    assert.equal(await page.locator('.lobby-chapters [aria-current]').getAttribute('data-workspace-target'), 'friends',
        'An explicit chapter choice overrides automatic return navigation');
    evidence.checkpoints.push('Delayed save-list and party-room updates return directly to Saved; explicit navigation remains in control');

    await view('saved'); await page.getByRole('searchbox', { name: 'Find a saved expedition' }).fill('');
    await page.locator('#lobby_account summary').click(); assert(await page.locator('#logout_link').isVisible());
    await page.locator('#lobby_account summary').press('Escape'); assert.equal(await page.locator('#logout_link').isVisible(), false);
    await page.reload(); await page.locator('#game_library_panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.lobby-chapters [aria-current]').getAttribute('data-workspace-target'), 'saved');
    evidence.checkpoints.push('Account Escape and workspace restoration after reload');
    const archive = await browser.newPage({ viewport: { width: 390, height: 844 } });
    for (const route of ['/games', '/players', '/randarts', '/stats']) {
        const response = await archive.goto(url + route); assert.equal(response.status(), 200);
        assert.equal(await archive.locator('.library-brand').textContent(), 'Pebble Broth');
        assert(await archive.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' fits mobile');
        await archive.screenshot({ path: path.join(output, 'archive-' + route.slice(1) + '.png'), fullPage: true });
    }
    await archive.close();
    await page.goto(url + '/?view=friends#lobby'); await page.locator('#lobby_friends_panel').waitFor({ state: 'visible' });
    evidence.checkpoints.push('Archive navigation renders on all four public routes; explicit return destination restores Join friends');
    await view('play');
    const daily = await page.evaluate(() => window.__PEBBLE_DAILY_BROTH), beforeDaily = sent.length;
    await page.locator('[data-daily-seed]').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    await page.waitForFunction(seed => document.querySelector('#party_room_host_text').textContent.includes(seed), daily.seed);
    const dailyCommands = sent.slice(beforeDaily).filter(message => message.msg === 'party_room_create');
    assert.equal(dailyCommands.length, 1); assert.equal(dailyCommands[0].seed, daily.seed);
    assert.deepEqual(dailyCommands[0].seasonings, daily.seasonings.filter(item => item !== 'friendly_fire'));
    await page.locator('#btn_leave_party_room').click(); await page.locator('#lobby_home').waitFor({ state: 'visible' });
    const other = await browser.newPage();
    await other.goto(url); await signInTestAccount(other, 'OtherQA' + Date.now().toString(36), 'crawl'); await other.locator('#lobby_home [data-lobby-create]').click();
    await other.locator('#party_room_view').waitFor({ state: 'visible' });
    for (let iteration = 0; iteration < 2; iteration++) {
        await view('chronicle');
        await page.evaluate(() => require('comm').handle_message({ msg: 'coop_chronicle', ghosts: [], cool_items: [],
            party_comps: [{ comp_name: 'Navigation recipe', friendly_fire: false, seasonings: [],
                members: [{ name: 'Pilot', species: 'Minotaur', job: 'Fighter' }] }] }));
        const beforeBuild = sent.length;
        await page.locator('.btn-load-chronicle-comp').first().click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        assert.equal(sent.slice(beforeBuild).filter(message => message.msg === 'party_room_apply_comp').length, 1);
    }
    await page.locator('#btn_leave_party_room').click();
    await other.locator('#btn_leave_party_room').click(); await other.close();
    evidence.checkpoints.push('Daily seed configures exactly once; Use build returns new/existing rooms to setup while another host has a party');
    assert.deepEqual(errors, []); evidence.success = true; evidence.errors = errors;
    console.log(JSON.stringify({ success: true, output, checkpoints: evidence.checkpoints }));
})().catch(async error => {
    evidence.error = String(error.stack || error); evidence.errors = errors;
    evidence.recentCommands = sent.slice(-20).map(({ msg }) => msg);
    console.error(error); process.exitCode = 1;
    if (page) await shot('failure').catch(() => {});
}).finally(async () => {
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
