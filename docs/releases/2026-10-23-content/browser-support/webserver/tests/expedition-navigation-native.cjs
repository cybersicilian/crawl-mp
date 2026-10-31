const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Disposable localhost games: stable links, refresh, exact resume and spectating. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8893';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.EXPEDITION_PROOF_DIR || '/tmp/dcss-expedition-url-proof';
fs.mkdirSync(output, { recursive: true });
const evidence = {}, errors = [];
let browser, page;

async function game(target = page) {
    await target.locator('#dungeon').waitFor({ state: 'visible' });
    await target.waitForFunction(() => window.crawl_party?.state?.members?.length > 0);
    const id = (await target.locator('.library-game-link').getAttribute('href')).split('/').pop();
    await target.waitForFunction(id => location.hash === '#expedition-' + id, id);
    return { id, heroes: await target.evaluate(() => window.crawl_party.state.members.map(hero => hero.player_id)) };
}
async function saveExit() {
    await page.waitForFunction(() => {
        const button = document.getElementById('dock_save_exit_btn');
        return button && !button.disabled;
    });
    // Saving is setup for URL checks and stays independent of the dock layout.
    await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
    await page.waitForFunction(() => location.hash === '#lobby');
    await page.locator('#game_library_panel [data-library-load]').first().waitFor({ state: 'visible' });
}

(async () => {
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => errors.push(error.message));
    const username = 'SaveQA' + Date.now().toString(36);
    evidence.account = username;
    await page.goto(url);
    await signInTestAccount(page, username, 'crawl');
    await page.locator('#lobby_home [data-lobby-create]').click();
    await page.locator('#btn_launch_party_room').click();
    const first = await game();
    evidence.first = first;
    console.log('Fresh native expedition publishes its stable URL.');

    await page.reload();
    assert.deepEqual(await game(), first, 'Refresh must reclaim the same native expedition and hero IDs');
    console.log('Refreshing an active expedition preserves native identity.');
    const guest = await browser.newPage();
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(url + '/#expedition-' + first.id);
    assert.deepEqual(await game(guest), first);
    evidence.spectator = true;
    await guest.close();
    console.log('A shared expedition link opens the exact live game for a spectator.');
    await saveExit();

    await page.locator('#lobby_primary_action').click();
    await page.locator('#btn_launch_party_room').click();
    const second = await game();
    assert.notEqual(second.id, first.id);
    evidence.second = second;
    await page.evaluate(id => { location.hash = '#expedition-' + id; }, first.id);
    await page.waitForFunction(() => document.getElementById('library_notice')?.textContent.includes('return to the lobby'));
    assert.deepEqual(await game(), second, 'A rejected switch must preserve the live game and its URL');
    await saveExit();
    const resume = page.locator('#game_library_panel [data-library-load="' + first.id + '"]');
    assert.equal(await resume.getAttribute('href'), '#expedition-' + first.id);
    await resume.click();
    assert.deepEqual(await game(), first, 'Resume must select the linked save rather than the latest same-mode save');
    console.log('Resume opens an older same-mode expedition by its URL.');
    await saveExit();

    await page.goto(url + '/?load=' + second.id + '&keep=1#lobby');
    assert.deepEqual(await game(), second);
    assert.equal(new URL(page.url()).search, '?keep=1');
    console.log('Legacy load bookmarks migrate to the stable expedition URL.');
    await page.screenshot({ path: path.join(output, 'expedition.png') });
    await saveExit();
    assert.deepEqual(errors, []);
    evidence.success = true;
    console.log('Expedition URLs: native launch, refresh, spectator sharing, exact resume and legacy migration passed.');
})().catch(async error => {
    evidence.error = String(error.stack || error);
    if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    evidence.errors = errors;
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
