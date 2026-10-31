const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Local, isolated proof for welcome, account forms, and expedition planning. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8888';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const output = process.env.LOBBY_PROOF_DIR || '/tmp/dcss-lobby-final-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const errors = [], evidence = {};
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(css|js|png|svg|gif)(\?|$)/.test(response.url()))
            errors.push(response.status() + ' ' + response.url());
    });
    async function fits(name, width, height) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(160);
        const dimensions = await page.evaluate(() => ({ width: innerWidth,
            document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        assert(dimensions.document <= width && dimensions.body <= width, name + ' must not overflow horizontally');
        evidence[name] = dimensions;
        await page.mouse.move(5, 5);
        await page.evaluate(() => document.activeElement?.blur());
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(80);
        await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
        await page.screenshot({ path: path.join(output, name + '-viewport.png') });
    }
    try {
        await page.goto(url);
        await page.locator('.welcome-intro').waitFor({ state: 'visible' });
        assert((await page.locator('.welcome-entry').evaluate(el => getComputedStyle(el).backgroundImage))
            .includes('dungeon-threshold.png'), 'Custom illustration must be integrated');
        for (const [width, height] of [[1280, 800], [1920, 1080], [390, 844]])
            await fits('welcome-' + width, width, height);
        await page.locator('#reg_link').click();
        await page.locator('#register').waitFor({ state: 'visible' });
        const dialog = await page.locator('#register').boundingBox();
        assert(dialog.x >= 0 && dialog.x + dialog.width <= 390, 'Account dialog fits mobile');
        await fits('registration-390', 390, 844);
        await page.locator('#reg_cancel').click();
        await page.locator('#register').waitFor({ state: 'hidden' });
        const account = 'FolioQAL' + Date.now().toString().slice(-8);
        evidence.account = account;
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_home').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.welcome-intro').isVisible(), false, 'Welcome collapses after sign-in');
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
        await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('4 heroes'));
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(200);
        assert(!(await page.locator('#party_room_title_text').innerText()).includes('==='));
        assert(!(await page.locator('#party_room_host_text').innerText()).includes('web-trunk'));
        const toggle = page.locator('#btn_toggle_party_ff');
        const before = await toggle.innerText();
        await toggle.click();
        await page.waitForFunction(text => document.querySelector('#btn_toggle_party_ff').textContent !== text, before);
        await toggle.click();
        await page.waitForFunction(text => document.querySelector('#btn_toggle_party_ff').textContent === text, before);
        const arga = page.locator('.chronicle-entry-title').filter({ hasText: 'Arga' }).first();
        if (await arga.count()) {
            assert.equal(await arga.locator('.item-property').count(), 2);
            assert(!(await arga.innerText()).includes('{'));
        }
        await fits('staging-1280', 1280, 800);
        const launch = await page.locator('#btn_launch_party_room').boundingBox();
        assert(launch.y + launch.height <= 800, 'Primary launch action stays within laptop viewport');
        await fits('staging-390', 390, 844);
        await page.locator('#btn_leave_party_room').click();
        await page.locator('#lobby_home').waitFor({ state: 'visible' });
        await page.locator('#lobby_account summary').click();
        await page.locator('#logout_link').click();
        await page.locator('.welcome-intro').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.coop-preset-btn').count(), 0);
        assert.equal(await page.locator('#password').getAttribute('required'), '');
        assert.deepEqual(errors, []);
        evidence.errors = errors;
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, output, account }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
