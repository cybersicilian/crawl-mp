const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real sign-in/logout and token replay against an isolated local WebTiles server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8888';
const target = new URL(url);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
assert(local || (process.env.LOGOUT_ALLOW_PRODUCTION === '1'
    && target.origin === 'https://dcss.iancaltabiano.com'), 'Use a local fixture or explicitly allow the production host');
const output = process.env.LOGOUT_PROOF_DIR || '/tmp/dcss-logout-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const account = 'DeployQA' + Date.now().toString(36);
    let revokedCookie;
    async function login() {
        await page.goto(url);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.cookie.includes('login='));
        assert.equal(await page.getByRole('button', { name: 'Log out', exact: true }).isVisible(), false);
        assert.equal(await page.locator('#lobby_account').getAttribute('open'), null,
            'Account controls stay collapsed until requested');
    }
    try {
        const surfaces = ['lobby', 'chronicle', 'stats', 'games', 'players', 'randarts'];
        for (const [index, surface] of surfaces.entries()) {
            await login();
            if (surface === 'chronicle')
                await page.locator('[data-workspace-target="chronicle"]').click();
            else if (surface !== 'lobby') await page.goto(new URL('/' + surface, url).href);
            await page.setViewportSize({ width: [1280, 390, 320][index % 3], height: 844 });
            await page.locator('.lobby-account summary, .archive-account summary').click();
            const logout = page.getByRole('button', { name: 'Log out', exact: true });
            assert(await logout.isVisible());
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
                surface + ' must fit the viewport');
            const bounds = await logout.boundingBox();
            assert(bounds.height >= 44, 'Logout retains a touch-sized target');
            await page.screenshot({ path: path.join(output, surface + '.png') });
            const cookie = (await context.cookies()).find(entry => entry.name === 'login');
            assert(cookie, 'Sign-in issued a remembered session');
            if (!revokedCookie) revokedCookie = cookie;
            const response = page.waitForResponse(response =>
                new URL(response.url()).pathname === '/logout' && response.request().method() === 'POST');
            await logout.focus();
            await logout.press('Enter');
            assert.equal((await response).status(), 303);
            await page.locator('#login_form').waitFor({ state: 'visible' });
            assert.equal(new URL(page.url()).hash, '#lobby');
            assert.equal((await context.cookies()).some(entry => entry.name === 'login'), false);
            await page.reload();
            await page.locator('#login_form').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#logout_link').isVisible(), false,
                'Reload must keep the user signed out');
        }
        const replay = await browser.newContext();
        await replay.addCookies([revokedCookie]);
        const stale = await replay.newPage();
        await stale.goto(url);
        await stale.locator('#login_form').waitFor({ state: 'visible' });
        await stale.waitForFunction(() => !document.cookie.includes('login='));
        assert.equal(await stale.locator('#lobby_navigation').isVisible(), false,
            'A copied, revoked token must not sign in');
        await replay.close();
        await page.goto(new URL('/games', url).href);
        assert.equal(await page.locator('#logout_link').isVisible(), false,
            'Anonymous record visitors do not see a logout action');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, surfaces, revokedTokenRejected: true, output }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') });
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
