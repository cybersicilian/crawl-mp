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
const activation = JSON.parse(fs.readFileSync(path.join(__dirname, 'activation.json'), 'utf8'));
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
        window.qaSettings = null; window.qaCommands = []; window.qaMessages = []; window.qaUiEvents=[];
        new MutationObserver(() => {const el=document.getElementById('rc_edit');window.qaUiEvents.push({time:performance.now(),style:el.getAttribute('style'),hidden:el.hidden});}).observe(document.getElementById('rc_edit'),{attributes:true,attributeFilter:['style','hidden']});
        comm.handle_message = function (data) {
            window.qaMessages.push({msg:data.msg,time:performance.now()});
            if (data.msg === 'game_settings') window.qaSettings = data;
            return handle(data);
        };
        comm.register_send_listener(msg => window.qaCommands.push(msg));
    });
}
async function open() {
    await page.locator('#lobby_account summary').click();
    await page.locator('#lobby_account_settings .lobby-account-settings-button').first().click();
    await page.waitForFunction(() => window.qaSettings?.available === true);
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
    page.on('console',message=>{if(message.type()==='error')proof.errors.push(message.text().replaceAll(credentials.password,'[redacted]'));});
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
    await page.waitForTimeout(800);
    proof.dialogTrace = await page.evaluate(() => {const el=document.getElementById('rc_edit');return {style:el.getAttribute('style'),display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,rect:el.getBoundingClientRect().toJSON(),messages:window.qaMessages,events:window.qaUiEvents,centerMethod:typeof require('client').center_element};});
    proof.mobileLayout = await page.evaluate(() => {
        const rect = document.getElementById('rc_edit').getBoundingClientRect();
        return { stage: 'desktop', viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, dialog: { left: rect.left, right: rect.right, width: rect.width } };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    proof.mobileLayout = await page.evaluate(() => {
        const rect = document.getElementById('rc_edit').getBoundingClientRect();
        return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
            dialog: { left: rect.left, right: rect.right, width: rect.width },
            overflow: [...document.querySelectorAll('body *')].filter(el => {
                const r=el.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+1 && getComputedStyle(el).position!=='fixed';
            }).slice(0,15).map(el=>({tag:el.tagName,id:el.id,className:typeof el.className==='string'?el.className:'',right:el.getBoundingClientRect().right})) };
    });
    await page.screenshot({path:path.join(out,'live-settings-mobile-diagnostic.png')});
    proof.passed=true;console.log(JSON.stringify({layout:proof.mobileLayout,trace:proof.dialogTrace,errors:proof.errors}));
})().catch(error => { proof.failure = error.message; console.error(error); process.exitCode = 1; }).finally(async () => {
    try { await restore(); } catch (error) { proof.cleanupFailure = error.message; process.exitCode = 1; }
    if (browser) await browser.close();
    fs.writeFileSync(path.join(out, 'layout-diagnostic.json'), JSON.stringify(proof, null, 2));
});
