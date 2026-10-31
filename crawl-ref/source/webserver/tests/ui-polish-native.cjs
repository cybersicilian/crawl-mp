/* Spatial acceptance in a disposable native expedition and its real lobby. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8928';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.UI_POLISH_PROOF_DIR || '/tmp/dcss-ui-polish-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], evidence = { layouts: [], layoutIssues: [], widths: [1280, 768, 390, 320] };
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(css|js|svg|png)(\?|$)/.test(response.url()))
            errors.push(response.status() + ' ' + response.url());
    });
    const key = keycode => page.evaluate(keycode => require('comm').send_message('key', { keycode }), keycode);
    const ready = () => page.waitForFunction(() => {
        const module = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return module && require(module).ready() && !document.querySelector('#ui-stack > *');
    });
    async function fit(name, target = page, heights = [800]) {
        for (const width of evidence.widths) for (const height of heights) {
            await target.setViewportSize({ width, height });
            await target.evaluate(() => document.fonts.ready);
            await target.waitForTimeout(180);
            const bounds = await target.evaluate(() => {
                const footer = document.getElementById('hud_bottom_row');
                return { viewport: innerWidth, document: document.documentElement.scrollWidth, height: innerHeight,
                    footerGrid: footer ? getComputedStyle(footer).gridTemplateColumns : null };
            });
            if (bounds.document > width) evidence.layoutIssues.push({ name, width, height, bounds,
                overflow: await target.evaluate(() => [...document.querySelectorAll('body *')].filter(node => {
                    const rect = node.getBoundingClientRect();
                    return rect.width && rect.right > innerWidth + 1 && getComputedStyle(node).visibility !== 'hidden';
                }).slice(0, 15).map(node => ({ tag: node.tagName, id: node.id, className: String(node.className) }))) });
            evidence.layouts.push({ name, width, height, ...bounds });
            fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(evidence, null, 2));
            if (width === 1280 || width === 390 || height === 360)
                await target.screenshot({ path: path.join(output, `${name}-${width}-${height}.png`), fullPage: height !== 360 });
        }
    }
    async function view(id) {
        await page.locator(`.lobby-chapters [data-workspace-target='${id}']`).click();
        await page.waitForFunction(id => document.querySelector(`.lobby-chapters [data-workspace-target='${id}']`)
            ?.getAttribute('aria-current') === 'page', id);
    }
    async function popupFit(name) {
        for (const [width, height] of [[1280, 800], [768, 800], [390, 800], [320, 800], [768, 360]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(180);
            const popup = page.locator('#ui-stack .ui-popup-outer').last();
            const bounds = await popup.boundingBox();
            if (bounds.x < -1 || bounds.x + bounds.width > width + 1 || bounds.y < -1 || bounds.y + bounds.height > height + 1)
                evidence.layoutIssues.push({ name, width, height, bounds });
            const surface = page.locator('#ui-stack .workflow-surface').last();
            const content = await surface.evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth,
                clippedScrollers: [...node.querySelectorAll('.simplebar-content')].filter(child => {
                    const viewport = child.closest('[data-simplebar]');
                    return getComputedStyle(child).visibility !== 'hidden' && (child.scrollWidth > child.clientWidth + 1
                        || child.getBoundingClientRect().right > viewport.getBoundingClientRect().right + 1);
                }).map(child => ({ width: child.clientWidth, scrollWidth: child.scrollWidth })),
                overflow: [...node.querySelectorAll('*')].filter(child => {
                    const rect = child.getBoundingClientRect();
                    return rect.width && rect.right > node.getBoundingClientRect().right + 1;
                }).slice(0, 12).map(child => ({ tag: child.tagName, className: String(child.className),
                    width: child.clientWidth, scrollWidth: child.scrollWidth })) }));
            if (content.scrollWidth > content.width + 1 || content.clippedScrollers.length)
                evidence.layoutIssues.push({ name, width, height, content });
            const close = page.locator('#ui-stack .workflow-popup-tools button').last();
            assert(await close.evaluate(button => {
                const rect = button.getBoundingClientRect();
                return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
            }), name + ' close control is reachable');
            await popup.screenshot({ path: path.join(output, `${name}-${width}-${height}.png`) });
            evidence.layouts.push({ name, width, height, bounds });
            fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(evidence, null, 2));
        }
        await page.setViewportSize({ width: 1280, height: 800 });
    }
    try {
        await page.goto(url);
        await page.locator('.welcome-intro').waitFor({ state: 'visible' });
        await fit('welcome');
        await page.setViewportSize({ width: 390, height: 800 });
        await page.locator('#reg_link').click();
        await page.locator('#register').waitFor({ state: 'visible' });
        await fit('account');
        await page.locator('#reg_cancel').click();
        await page.setViewportSize({ width: 1280, height: 800 });
        evidence.account = 'PolishQA' + Date.now().toString(36);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_home').waitFor({ state: 'visible' });
        await fit('play');
        await page.setViewportSize({ width: 1280, height: 800 });
        for (const id of ['saved', 'friends', 'chronicle']) {
            await view(id); await fit(id); await page.setViewportSize({ width: 1280, height: 800 });
        }
        for (const route of ['/games', '/players', '/randarts', '/stats']) {
            const record = await context.newPage();
            record.on('pageerror', error => errors.push(error.message));
            await record.goto(url + route);
            await record.locator('.library-book').waitFor();
            await fit(route.slice(1), record);
            await record.close();
        }
        await view('play');
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-species').selectOption('Human');
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-job').selectOption('Reaver');
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.waitForFunction(() => /1 hero\b/.test(document.getElementById('btn_launch_party_room').textContent));
        await fit('setup');
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.locator('#btn_launch_party_room').scrollIntoViewIfNeeded();
        const launch = await page.locator('#btn_launch_party_room').boundingBox();
        assert(launch.y >= 0 && launch.y + launch.height <= 800, 'Native launch action is reachable');
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1, null, { timeout: 120000 });
        await page.locator('#loader').waitFor({ state: 'hidden' });
        await ready();
        const hero = await page.evaluate(() => window.crawl_party.state.members[0]);
        assert.equal(hero.species, 'Human');
        assert.equal(hero.job, 'Reaver');
        evidence.hero = { species: hero.species, job: hero.job };
        const clock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        await key(105); await page.locator('.menu_inventory').waitFor();
        await popupFit('inventory');
        assert(await page.evaluate(() => document.activeElement === document.body), 'New menus preserve native command focus');
        const item = page.locator('.menu_inventory li.selectable').first();
        await item.focus(); await item.press('Enter');
        await page.locator('#ui-stack .describe-item').waitFor();
        await popupFit('item-description');
        await page.locator('#ui-stack .workflow-popup-tools button').last().click();
        await page.locator('#ui-stack .describe-item').waitFor({ state: 'detached' });
        if (await page.locator('.menu_inventory').count()) {
            await page.waitForTimeout(220);
            assert(await item.evaluate(node => node === document.activeElement), 'Reading returns to the originating item after animation');
            await key(27);
        }
        await ready();
        await page.locator('#hud_spell_library').click();
        await page.locator('.workflow-action-menu').waitFor();
        await popupFit('spell-library');
        const describe = page.locator('[data-entry-action=describe]').first();
        const entry = await describe.locator('..').locator('..').getAttribute('data-entry-id');
        await describe.focus(); await page.keyboard.press('Enter');
        await page.locator('#ui-stack .describe-spell').waitFor();
        await page.locator('#ui-stack .workflow-popup-tools button').last().click();
        await page.locator('#ui-stack .describe-spell').waitFor({ state: 'detached' });
        await page.waitForTimeout(250);
        assert(await page.locator(`[data-entry-id='${entry}'] [data-entry-action=describe]`)
            .evaluate(node => node === document.activeElement), 'Exact spell action survives the popup fade callback');
        await key(27); await ready();
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock, 'Reading has no world-time cost');
        await page.locator('#dock_session_menu').click();
        await fit('session-menu');
        await page.keyboard.press('Escape'); await ready();
        await page.locator('#quickbar_more > summary').click();
        await fit('quick-actions');
        const tray = await page.locator('#quickbar_more_content').boundingBox();
        assert(tray.x >= 0 && tray.x + tray.width <= 320, 'Quick actions stay inside the narrow viewport');
        await page.locator('#quickbar_more > summary').click();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await key(105); await page.locator('.menu_inventory').waitFor();
        await page.locator('.menu_inventory li.selectable').first().focus();
        await page.keyboard.press('Enter'); await page.locator('#ui-stack .describe-item').waitFor();
        await key(27);
        if (await page.locator('.menu_inventory').count()) await key(27);
        await ready();
        const report = await context.newPage();
        await report.goto('file://' + path.join(output, '..', 'brief.html'));
        await report.getByRole('heading', { name: 'Assessment', exact: true }).waitFor();
        assert(await report.locator('.tpd-logo').evaluate(node => node.complete && node.naturalWidth > 0));
        assert(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Report fits its viewport');
        await report.screenshot({ path: path.join(output, 'design-report.png'), fullPage: true });
        await report.close();
        assert.deepEqual(evidence.layoutIssues, [], 'Every inspected surface fits its viewport');
        assert.deepEqual(errors, []);
        Object.assign(evidence, { success: true, exactFocusReturn: true, reducedMotion: true, zeroTurnReading: true, errors });
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, layouts: evidence.layouts.length, exactFocusReturn: true, zeroTurnReading: true }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
