/* Public HTTPS acceptance with existing QA identity; no native game is opened. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const out = path.join(__dirname, 'public');
fs.mkdirSync(out, { recursive: true });
const credentials = JSON.parse(fs.readFileSync(path.join(root,
    'docs/diagnostics/2026-10-27-multiplayer-performance/deploy/public/private-accounts.json'), 'utf8'));
const activation = JSON.parse(fs.readFileSync(path.join(__dirname, 'active-release.json'), 'utf8'));
const url = 'https://dcss.iancaltabiano.com';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const keys = ['travel_delay', 'default_autopickup', 'hp_warning', 'note_items'];
const proof = { passed: false, url, nativeGameStarted: false, newAccounts: 0, checks: [], assets: {}, errors: [] };
let browser, page, original, originalValues, edited = false;
const responses = [];
function assetName(href) {
    const pathname = new URL(href).pathname;
    return Object.keys(activation.runtime_files).find(name => name.startsWith('webserver/static/')
        && pathname === '/' + name.slice('webserver/'.length));
}
async function attach() {
    await page.waitForFunction(() => typeof require === 'function' && require.defined('client') && require.defined('comm'));
    await page.evaluate(() => {
        const comm = require('comm'), handle = comm.handle_message;
        window.qaSettings = null; window.qaCommands = [];
        comm.handle_message = function (data) {
            if (data.msg === 'game_settings') window.qaSettings = data;
            return handle(data);
        };
        comm.register_send_listener(msg => window.qaCommands.push(msg));
    });
}
async function authenticatedLobbyBarrier() {
    const request = 'qa-ready-' + Date.now();
    await page.evaluate(request => {
        window.qaSettings = null;
        const game = document.querySelector('#play_now .edit_rc_link').getAttribute('data-game_id');
        require('comm').send_message('get_game_settings', { game_id: game, request_id: request });
    }, request);
    await page.waitForFunction(request => window.qaSettings?.request_id === request && window.qaSettings.available, request);
}
async function open() {
    await authenticatedLobbyBarrier();
    await page.evaluate(() => { window.qaSettings = null; });
    await page.locator('#lobby_account summary').click();
    await page.locator('#lobby_account_settings .lobby-account-settings-button').first().click();
    await page.locator('#rc_settings_workspace').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.qaSettings?.available === true);
}
async function save() {
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.waitForFunction(() => window.qaSettings?.saved === true
        && document.getElementById('rc_settings_status').textContent.startsWith('Settings saved.'));
}
async function restore() {
    if (!edited || !original || !page) return;
    const request = 'qa-restore-' + Date.now();
    const changes = Object.fromEntries(keys.map(key => [key,
        Object.prototype.hasOwnProperty.call(original, key) ? original[key] : null]));
    await page.evaluate(({ changes, request }) => {
        const game = window.qaSettings.game_id;
        require('comm').send_message('set_game_settings', { game_id: game, request_id: request, changes });
    }, { changes, request });
    await page.waitForFunction(request => window.qaSettings?.request_id === request
        && window.qaSettings.saved && window.qaSettings.available, request);
    assert.deepEqual(await page.evaluate(() => window.qaSettings.overrides), original);
    proof.qaPreferencesRestored = true; edited = false;
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => proof.errors.push(error.message));
    page.on('response', response => {
        const name = assetName(response.url());
        if (name) responses.push((async () => { proof.assets[name] = { sha256: hash(await response.body()), status: response.status() }; })());
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await attach();
    await page.locator('#username').fill(credentials.host);
    await page.locator('#password').fill(credentials.password);
    await page.locator('#login_form').evaluate(form => form.requestSubmit());
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await open();
    const initial = await page.evaluate(() => window.qaSettings);
    original = initial.overrides; originalValues = initial.values;
    assert.equal(initial.schema.fields.length, 131);
    assert.equal(initial.base.explore_delay, -1, 'Confirmed live auto-explore default is displayed');
    assert.equal(await page.locator('#rc_file_contents, #rc_advanced').count(), 0);
    assert.equal(await page.locator('#rc_settings_categories button').count(), 8);
    proof.checks.push('Authenticated settings menu: 131 controls, seven categories, live base defaults and no raw RC editor');
    const search = page.getByRole('searchbox', { name: 'Find a setting' });
    await search.fill('Travel speed');
    const travel = originalValues.travel_delay === 31 ? 32 : 31;
    await page.locator('#rc_setting_travel_delay').fill(String(travel));
    const autopickup = !originalValues.default_autopickup;
    await search.fill('Auto-pickup');
    await page.locator('#rc_setting_default_autopickup').selectOption(String(autopickup));
    await search.fill('Low-health warning');
    const warning = originalValues.hp_warning === 42 ? 43 : 42;
    await page.locator('#rc_setting_hp_warning').fill(String(warning));
    await search.fill('Items to record');
    const notes = [...originalValues.note_items, 'settings-verification-only'];
    await page.locator('#rc_setting_note_items').fill(notes.join('\n'));
    edited = true; await save();
    const modified = await page.evaluate(() => window.qaSettings.values);
    assert.equal(modified.travel_delay, travel); assert.equal(modified.default_autopickup, autopickup);
    assert.equal(modified.hp_warning, warning); assert.deepEqual(modified.note_items, notes);
    proof.checks.push('Number, boolean and multiline-list changes saved with authoritative acknowledgement');
    await page.reload({ waitUntil: 'domcontentloaded' }); await attach();
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' }); await open();
    const reloaded = await page.evaluate(() => window.qaSettings.values);
    for (const key of keys) assert.deepEqual(reloaded[key], modified[key], key + ' persists after page reload');
    await search.fill(''); await page.getByRole('button', { name: 'Travel & rest', exact: true }).click();
    await page.getByRole('button', { name: 'Reset Travel speed to base default', exact: true }).click();
    assert.equal(await page.locator('#rc_setting_travel_delay').inputValue(), String(initial.base.travel_delay));
    await page.getByRole('button', { name: 'Undo changes', exact: true }).click();
    assert.equal(await page.locator('#rc_setting_travel_delay').inputValue(), String(travel));
    proof.checks.push('Saved choices persist after reload; reset and undo work without changing the saved configuration');
    await page.getByLabel('Customized only', { exact: true }).check();
    assert(await page.locator('.rc-setting:visible').count() < 131);
    await page.getByLabel('Customized only', { exact: true }).uncheck();
    await page.screenshot({ path: path.join(out, 'live-settings-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'live-settings-mobile.png') });
    await page.getByRole('button', { name: 'Close', exact: true }).focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'rc_settings_search');
    proof.checks.push('Search, customized filter, 390px layout and modal keyboard focus verified on delivered production assets');
    await restore();
    assert.deepEqual(await page.evaluate(() => window.qaSettings.values), originalValues);
    await Promise.all(responses);
    for (const name of ['webserver/static/scripts/client.js', 'webserver/static/scripts/client-lobby.js',
        'webserver/static/scripts/rc-settings.js', 'webserver/static/styles/rc-settings.css']) {
        assert.equal(proof.assets[name]?.sha256, activation.runtime_files[name], name + ' matches deployed bytes');
        assert.equal(proof.assets[name]?.status, 200);
    }
    const commands = await page.evaluate(() => window.qaCommands);
    assert(!commands.some(name => ['play', 'expedition_open', 'library_load', 'key', 'party_room_launch'].includes(name)));
    proof.checks.push('Existing QA preferences restored; no game was opened or advanced; all four changed UI assets match release hashes');
    assert.deepEqual(proof.errors, []); proof.passed = true;
    console.log(JSON.stringify({ passed: true, checks: proof.checks, qaPreferencesRestored: true, nativeGameStarted: false }));
})().catch(error => { proof.failure = error.message.replaceAll(credentials.password, '[redacted]'); console.error(String(error.stack || error.message).replaceAll(credentials.password, '[redacted]')); process.exitCode = 1; }).finally(async () => {
    try { await restore(); } catch (error) { proof.cleanupFailure = error.message; process.exitCode = 1; }
    if (browser) await browser.close();
    fs.writeFileSync(path.join(out, 'live-verification.json'), JSON.stringify(proof, null, 2));
});
