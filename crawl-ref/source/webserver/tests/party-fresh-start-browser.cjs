/* Fresh launch and exact checkpoint resume through the actual lobby UI. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium, send, state, ready } = require('./multiplayer-native-client.cjs');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18891';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname)
    || url === 'https://dcss.iancaltabiano.com' && process.env.FRESH_START_PUBLIC_ORIGIN === url);
const output = process.env.FRESH_START_PROOF;
assert(output, 'Explicit evidence directory required');
fs.mkdirSync(output, { recursive: true });
const account = { username: 'FreshQA' + Date.now().toString(36), password: crypto.randomBytes(18).toString('hex') };
fs.writeFileSync(path.join(output, '.account.json'), JSON.stringify(account), { mode: 0o600 });
const evidence = { url, account: account.username }, errors = [];
let browser, page;
const heroes = party => party.members.map(hero => ({ name: hero.name, species: hero.species,
    job: hero.job, turns: hero.turns, pos: hero.pos }));
async function save() {
    await send(page, 'library_save', { exit: true });
    await page.locator('.party-loaded-summary').waitFor({ state: 'visible', timeout: 45000 });
    await page.getByRole('button', { name: 'New expedition', exact: true }).waitFor({ state: 'visible' });
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await signInTestAccount(page, account.username, account.password);
    await page.locator('#lobby_home').waitFor({ state: 'visible' });
    await page.waitForFunction(() => require('jquery').cookie('login'));
    await page.locator('#lobby_creation_visibility').selectOption('private');
    await page.locator('#lobby_home [data-lobby-create]').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2,
        null, { timeout: 120000 });
    await ready(page);
    const start = await state(page);
    await send(page, 'key', { keycode: 46 });
    await page.waitForFunction(turn => window.crawl_party.state.members[0].turns > turn, start.members[0].turns);
    await ready(page);
    const original = heroes(await state(page));
    const first = await page.evaluate(() => decodeURIComponent(location.hash.slice('#expedition-'.length)));
    assert.match(first, /^[0-9a-f-]{36}$/);
    await save();
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert(await page.locator('#party_new_expedition').isVisible());
        await page.locator('#party_new_expedition').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'saved-party-' + width + '.png') });
    }
    await page.locator('#party_new_expedition').click();
    await page.waitForFunction(() => !document.getElementById('party_room_view').classList.contains('has-saved-expedition'));
    assert(await page.getByLabel('Hero 1 name', { exact: true }).isVisible());
    assert.equal(await page.locator('#party_lobby_visibility').inputValue(), 'private');
    assert.equal(await page.locator('#game_library_panel [data-library-load="' + first + '"]').count(), 1);
    await page.getByLabel('Hero 1 name', { exact: true }).fill('FreshHero');
    await page.getByLabel('Hero 1 name', { exact: true }).press('Tab');
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(first => location.hash.startsWith('#expedition-')
        && location.hash !== '#expedition-' + first && window.crawl_party?.state?.members?.[0]?.name === 'FreshHero',
    first, { timeout: 120000 });
    await ready(page);
    const second = await page.evaluate(() => decodeURIComponent(location.hash.slice('#expedition-'.length)));
    assert.notEqual(second, first);
    await save();
    await page.locator('#party_lobby_save').selectOption(first);
    await page.waitForFunction(name => document.querySelector('.party-manager-table')?.textContent.includes(name), original[0].name);
    await page.getByRole('button', { name: /^Resume saved expedition/ }).click();
    await page.waitForFunction(({ first, name }) => location.hash === '#expedition-' + first
        && window.crawl_party?.state?.members?.[0]?.name === name,
    { first, name: original[0].name }, { timeout: 120000 });
    await ready(page);
    assert.deepEqual(heroes(await state(page)), original, 'Original checkpoint retains heroes, positions and turns');
    await save();
    assert.equal(await page.locator('#game_library_panel [data-library-load="' + second + '"]').count(), 1);
    assert.deepEqual(errors, []);
    Object.assign(evidence, { passed: true, first, second, original, exactResume: true, errors });
    console.log(JSON.stringify(evidence));
})().catch(async error => {
    Object.assign(evidence, { passed: false, error: String(error.stack || error), errors });
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
}).finally(async () => {
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
