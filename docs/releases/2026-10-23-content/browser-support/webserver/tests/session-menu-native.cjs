const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Fresh disposable game: open/cancel, native menu cancellation, save/quit/resume. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18988';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.SESSION_MENU_PROOF_DIR || '/tmp/dcss-session-menu-native-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = [], evidence = { account: 'EscMenuQA' + Date.now().toString().slice(-8) };
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready() && require('library-ui').save_status().reason === '';
    });
    const state = () => page.evaluate(() => ({ clock: window.crawl_party.state.world_aut_clock,
        members: window.crawl_party.state.members.map(hero => ({ name: hero.name, slot: hero.slot,
            player_id: hero.player_id, hp: hero.hp, pos: hero.pos,
            inventory: hero.inventory.map(item => ({ slot: item.slot, name: item.name, qty: item.qty })) })) }));
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await ready(); evidence.before = await state(); evidence.route = await page.evaluate(() => location.hash);
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('Escape'); await page.locator('#session_menu[open]').waitFor();
        await page.screenshot({ path: path.join(out, 'escape-menu.png') });
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#session_menu[open]').count(), 0);
        assert.deepEqual(await state(), evidence.before, 'Opening and closing spends no turn');

        await page.keyboard.press('i'); await page.locator('#ui-stack > *').first().waitFor();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('ui-stack').children.length === 0);
        assert.equal(await page.locator('#session_menu[open]').count(), 0, 'Native inventory gets first Esc');
        await ready(); await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('Escape'); await page.locator('#session_menu[open]').waitFor();
        await page.locator('[data-session-save="continue"]').click();
        await page.waitForFunction(() => document.getElementById('library_notice')?.textContent.includes('Expedition saved'));
        await ready(); assert.deepEqual(await state(), evidence.before, 'Manual save spends no turn');

        await page.locator('#dock_session_menu').click();
        await page.locator('#session_menu[open]').waitFor();
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('[data-session-save="quit"]').click();
        assert.equal(await page.locator('#session_menu[open]').count(), 1, 'Declined party exit preserves menu');
        assert.deepEqual(await state(), evidence.before);
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-session-save="quit"]').click();
        await page.locator('#game_library_panel').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => require('client').in_game()), false, 'Returned to the lobby');
        assert.equal(await page.locator('#session_menu').count(), 0, 'Exit cleans up menu');
        const resume = page.locator('#game_library_panel [data-library-load]').first();
        await resume.waitFor();
        evidence.gameId = await resume.getAttribute('data-library-load');
        await page.screenshot({ path: path.join(out, 'saved-in-lobby.png') });
        await resume.click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await ready(); evidence.after = await state();
        assert.deepEqual(evidence.after, evidence.before, 'Saved roster, positions, health, inventory and clock survive resume');
        assert.equal(await page.evaluate(() => location.hash), evidence.route, 'Same expedition resumes');
        await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('Escape');
        await page.locator('#session_menu[open]').waitFor(); await page.keyboard.press('Escape');
        assert.deepEqual(errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, saveQuitResume: true, heroes: evidence.after.members.length,
            turnFree: true, nativeCancellation: true, errors }));
    } catch (error) {
        fs.writeFileSync(path.join(out, 'failure-state.json'), JSON.stringify(await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return { playing: require('client').in_game(), watching: require('client').is_watching(),
                ready: name && require(name).ready(), normal: window.jQuery('#normal').is(':visible'),
                blockers: Array.from(document.querySelectorAll('#ui-stack > *, dialog[open]')).map(node => node.id),
                bodyClass: document.body.className, ping: window.crawl_party?.armed_ping_kind,
                save: require('library-ui').save_status() };
        }), null, 2));
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
