/* Command bindings and one-size dock geometry through real WebTiles and a disposable localhost game. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18997';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    // Wide enough that the bar stays on one row, so any height change is a defect.
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready() && !document.querySelector('#ui-stack > *');
    });
    const sent = () => page.evaluate(() => window.qaKeys.splice(0));
    const settle = () => page.waitForTimeout(200);
    const caption = index => page.locator(`#quickbar_slot_${index} .quickbar-caption`).innerText();
    const saved = () => page.evaluate(() => {
        const key = Object.keys(localStorage).find(name => name.startsWith('dcss.quickbar.v1.'));
        return key ? JSON.parse(localStorage.getItem(key)).filter(Boolean).map(binding => binding.id) : [];
    });
    async function closeNative() {
        for (let index = 0; index < 10; index++) {
            const input = page.locator('#message_pane input:visible');
            if (await input.count()) await input.press('Escape');
            else if (await page.locator('#ui-stack > *:visible').count()) await page.keyboard.press('Escape');
            else break;
            await page.waitForTimeout(150);
        }
        await ready();
    }
    // Every control on the bar is the same box with its caption on one baseline.
    const geometry = () => page.evaluate(() => {
        const controls = [...document.querySelectorAll('#quickbar_primary .dcss-dock-btn, #quickbar_slots .hud-quick-slot, #quickbar_more > summary, #dock_session_menu, #dock_common_hotkeys')]
            .filter(element => element.getClientRects().length);
        const captions = controls.map(element => element.querySelector('.workflow-action-label, .quickbar-caption, .quickbar-more-label')).filter(Boolean);
        return { count: controls.length, dock: document.getElementById('dcss_quick_dock').getBoundingClientRect().height,
            sizes: [...new Set(controls.map(element => { const box = element.getBoundingClientRect(); return box.width + 'x' + box.height; }))],
            baselines: [...new Set(captions.map(element => element.getBoundingClientRect().y))],
            clipped: captions.filter(element => element.scrollWidth > element.clientWidth + .5).map(element => element.textContent) };
    });
    try {
        await page.goto(url);
        const account = 'BarQA' + Date.now().toString().slice(-8);
        await page.waitForFunction(() => window.socket?.readyState === 1 && window.jQuery
            && window.jQuery._data(document.getElementById('login_form'), 'events')?.submit?.length);
        await signInTestAccount(page, account, 'crawl-qa-' + account);
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length, null, { timeout: 240000 });
        await ready();
        await page.waitForTimeout(800);
        await page.evaluate(() => {
            window.qaKeys = [];
            const comm = require('comm'), original = comm.send_message;
            comm.send_message = function (msg, data) {
                if (msg === 'key') window.qaKeys.push(data.keycode);
                return original.apply(this, arguments);
            };
        });
        const empty = await geometry();
        assert.deepEqual([empty.sizes.length, empty.baselines.length, empty.clipped], [1, 1, []], JSON.stringify(empty));

        // "+" opens on Items; Commands is reachable and a search narrows it.
        const commandTab = page.locator('[data-quick-category="command"]');
        await page.locator('#quickbar_slots .hud-quick-slot.is-empty').first().click();
        assert.equal(await page.locator('[data-quick-category="item"]').getAttribute('aria-pressed'), 'true');
        await commandTab.click();
        const rows = page.locator('.quickbar-catalog-action.is-command');
        assert((await rows.count()) >= 25, 'Every command is offered');
        await page.locator('#quickbar_search').fill('find');
        assert.equal(await rows.count(), 1);
        await rows.first().click();
        await settle();
        assert.equal(await caption(0), 'Find');
        assert.equal(await page.locator('#mission_ack').isVisible(), false, 'Assigning is not reported as a sent command');
        assert.deepEqual(await sent(), [], 'Assigning sends nothing');

        // The next assignment stays on Commands.
        await page.locator('#quickbar_slots .hud-quick-slot.is-empty').first().click();
        assert.equal(await commandTab.getAttribute('aria-pressed'), 'true');
        await page.locator('#quickbar_search').fill('');
        await page.locator('#quickbar_entry_command_explore').click();
        await settle();
        assert.equal(await caption(1), 'Explore');

        // Right-click on the action row.
        await page.locator('#quickbar_primary [data-dock-key="<"]').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Add to quickbar' }).click();
        await settle();
        assert.equal(await caption(2), 'Ascend');

        // Shift-click and drag from the tray.
        await page.locator('#quickbar_more > summary').click();
        await commandTab.click();
        await page.locator('#quickbar_command_overview').click({ modifiers: ['Shift'] });
        await settle();
        assert.equal(await caption(3), 'Overview');
        assert.deepEqual(await sent(), [], 'Shift-click pins without running');
        await page.locator('#quickbar_commands [data-dock-key="m"]').dragTo(page.locator('#quickbar_slots .hud-quick-slot.is-empty').first());
        await settle();
        assert.equal(await caption(4), 'Skills');
        await page.evaluate(() => { document.getElementById('quickbar_more').open = false; document.activeElement.blur(); });
        await settle();
        assert.deepEqual(await saved(), ['find', 'explore', 'ascend', 'overview', 'skills']);
        const bound = await geometry();
        assert.deepEqual([bound.sizes, bound.dock], [empty.sizes, empty.dock], 'Binding a slot never resizes the bar');
        assert.deepEqual([bound.baselines.length, bound.clipped], [1, []]);

        // Number keys and clicks run the bound command.
        await page.keyboard.press('1');
        await page.waitForTimeout(400);
        assert.deepEqual(await sent(), [6], 'Key 1 sends Find');
        await closeNative(); await sent();
        await page.locator('#quickbar_slot_3').click();
        await page.waitForTimeout(400);
        assert.deepEqual(await sent(), [15], 'A click sends Overview');
        await closeNative(); await sent();

        // A bound control's gate follows the hero.
        const gate = () => page.locator('#quickbar_slot_2').getAttribute('aria-disabled');
        assert.equal(await gate(), 'false', 'Ascend is usable on the arrival stairs');
        const clock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        await page.keyboard.press('2');
        await page.waitForFunction(start => window.crawl_party.state.world_aut_clock > start, clock);
        assert.deepEqual(await sent(), ['o'.charCodeAt(0)], 'Key 2 sends Explore');
        await page.waitForTimeout(1200);
        await closeNative();
        assert.equal(await gate(), 'true', 'Ascend is gated away from the stairs');
        assert.match(await page.locator('#quickbar_slot_2').getAttribute('data-tip-meta'), /stair/i);
        await sent();
        await page.keyboard.press('3');
        await settle();
        assert.deepEqual(await sent(), [], 'A gated slot sends nothing');

        await page.reload();
        await page.locator('#quickbar_slot_0 .quickbar-caption').waitFor({ timeout: 90000 });
        assert.equal(await caption(1), 'Explore', 'Bindings survive a reload');
        await ready();
        await page.locator('#quickbar_slot_4').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Clear quick slot' }).click();
        await settle();
        assert.deepEqual(await saved(), ['find', 'explore', 'ascend', 'overview']);
        assert.deepEqual(errors, []);
        console.log('Quickbar commands: five binding routes, keys, clicks, live gates, persistence and one-size geometry passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
