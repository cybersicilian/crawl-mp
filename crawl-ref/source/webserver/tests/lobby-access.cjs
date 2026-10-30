/* Real private invites and exact native checkpoint load/resume, in disposable storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium, send, state, ready } = require('./multiplayer-native-client.cjs');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18769';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.LOBBY_ACCESS_PROOF || '/tmp/dcss-lobby-access-proof';
const runtime = process.env.LOBBY_ACCESS_RUNTIME;
assert(runtime, 'An explicit disposable runtime is required');
fs.mkdirSync(output, { recursive: true });
const errors = [], evidence = {};
let browser, host, guest, outsider;
async function account(username) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('response', response => { if (response.status() >= 400 && /\.(css|js|png)(\?|$)/.test(response.url())) errors.push(response.status() + ' ' + response.url()); });
    await page.goto(url); await signInTestAccount(page, username, 'crawl');
    await page.locator('#lobby_home').waitFor({ state: 'visible' });
    await page.waitForFunction(() => require('jquery').cookie('login')); return page;
}
async function openLink(page, link) {
    await page.goto(link); await page.locator('.welcome-entry.signed-in').waitFor({ state: 'attached' });
}
async function closeUnused(page) {
    const details = page.locator('.party-unused-seats');
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
    for (const slot of [2, 3]) {
        const control = page.locator('[data-manager-focus="' + slot + ':control"]');
        if (await details.getAttribute('open') === null) await details.locator('summary').click();
        await control.selectOption('closed');
        await page.waitForFunction(slot => document.querySelector('.party-slot-box[data-slot="' + slot + '"]').dataset.seatState === 'closed', slot);
    }
}
function packages(identifier) {
    const root = path.join(runtime, 'library/saves', identifier), result = {};
    function visit(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.name.endsWith('.cs')) result[path.relative(root, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        }
    }
    visit(root); assert(Object.keys(result).length, 'A genuine native save exists'); return result;
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    host = await account('Briar'); guest = await account('Rowan'); outsider = await account('Sable');
    await host.locator('#lobby_creation_visibility').selectOption('private');
    await host.locator('#lobby_home [data-lobby-create]').click();
    await host.locator('#party_room_view').waitFor({ state: 'visible' });
    await host.waitForFunction(() => document.querySelectorAll('.party-manager-table tbody tr').length === 2);
    assert.equal(await host.locator('.party-slot-box:visible').count(), 2, 'Only joining heroes have character editors');
    assert(!await host.locator('.party-manager').innerText().then(text => text.includes('Karn') || text.includes('Vex')), 'Unjoined preset characters stay out of the roster');
    await closeUnused(host);
    await outsider.locator('.lobby-chapters [data-workspace-target="friends"]').click();
    assert.equal(await outsider.locator('.party-room-listing').count(), 0, 'Private lobby is not broadcast to outsiders');
    await send(outsider, 'party_room_join', { room_id: 'room-Briar', slot: 1 });
    assert(await outsider.locator('#party_room_view').isHidden(), 'Guessing the room identity does not join it');
    const expired = await host.locator('#party_lobby_link').inputValue();
    assert.match(expired, /#lobby-room-Briar\?invite=/);
    host.once('dialog', dialog => dialog.accept());
    await host.locator('#party_reset_invite').click();
    await host.waitForFunction(old => document.getElementById('party_lobby_link').value !== old, expired);
    await openLink(guest, expired);
    await guest.getByText('This lobby link is unavailable or has expired.', { exact: true }).waitFor();
    const link = await host.locator('#party_lobby_link').inputValue();
    evidence.expiredInviteRejected = true;
    await openLink(guest, link);
    await guest.locator('#party_invite_offer').waitFor({ state: 'visible' });
    await guest.getByRole('button', { name: 'Join lobby', exact: true }).click();
    await host.waitForFunction(() => document.querySelector('[data-slot="1"]').dataset.seatOwner === 'Rowan');
    evidence.invitedJoin = true;
    await host.locator('.party-lobby-tools').screenshot({ path: path.join(output, 'private-lobby-tools.png') });
    await host.mouse.move(1, 1);
    await host.locator('.party-manager').screenshot({ path: path.join(output, 'joined-players-only.png') });
    await host.locator('#btn_launch_party_room').click();
    await host.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
    await guest.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1, null, { timeout: 120000 });
    await ready(host); const first = await state(host);
    await send(host, 'key', { keycode: 46 });
    await host.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, first.members[0].turns);
    await ready(host);
    const before = (await state(host)).members.map(hero => ({ name: hero.name, species: hero.species, job: hero.job, turns: hero.turns, pos: hero.pos }));
    const identifier = await host.evaluate(() => decodeURIComponent(location.hash.replace('#expedition-', '')));
    await send(outsider, 'go_lobby');
    assert.equal(await outsider.locator('#player_list tbody tr').count(), 0, 'Private live game stays out of discovery');
    await send(outsider, 'watch', { username: 'Briar', expedition_id: identifier });
    await outsider.getByText('This expedition requires a lobby invite.', { exact: true }).waitFor();
    await send(host, 'library_save', { exit: true });
    await host.locator('.party-loaded-summary').waitFor({ state: 'visible', timeout: 30000 });
    const saved = packages(identifier);
    evidence.firstNativeSave = identifier;
    host.once('dialog', dialog => dialog.accept());
    await host.locator('#btn_leave_party_room').click();
    await host.locator('#lobby_home').waitFor({ state: 'visible' });
    await host.locator('.lobby-chapters [data-workspace-target="saved"]').click();
    await host.locator('[data-library-lobby="' + identifier + '"]').click();
    await host.locator('.party-loaded-summary').waitFor({ state: 'visible' });
    assert.deepEqual(packages(identifier), saved, 'Loading into a lobby leaves the native package untouched');
    assert.equal(await host.locator('.party-manager-table tbody tr').count(), 1, 'Saved heroes are not presented as joined players');
    assert.equal(await host.locator('.party-slot-box:visible').count(), 0, 'Saved builds cannot be replaced with starting characters');
    assert.match(await host.locator('.party-loaded-summary').textContent(), /Turn [1-9]/);
    assert.equal(await host.locator('#party_lobby_visibility').inputValue(), 'private');
    evidence.packageUnchangedOnLoad = true;
    const resumeLink = await host.locator('#party_lobby_link').inputValue();
    await openLink(guest, resumeLink);
    await guest.locator('#party_invite_offer').waitFor({ state: 'visible' });
    await guest.getByRole('button', { name: 'Join lobby', exact: true }).click();
    await host.waitForFunction(() => document.querySelectorAll('.party-manager-table tbody tr').length === 2);
    await host.mouse.move(1, 1);
    await host.locator('#party_room_view').screenshot({ path: path.join(output, 'saved-expedition-lobby.png') });
    for (const width of [390, 768, 1440]) {
        await host.setViewportSize({ width, height: 1000 });
        assert(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Saved lobby fits ' + width);
    }
    await host.getByRole('button', { name: /^Resume saved expedition/ }).click();
    await host.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
    await guest.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1, null, { timeout: 120000 });
    await ready(host);
    const after = (await state(host)).members.map(hero => ({ name: hero.name, species: hero.species, job: hero.job, turns: hero.turns, pos: hero.pos }));
    assert.deepEqual(after, before, 'Exact hero identities, positions and turn counts survive lobby resume');
    assert.equal(await host.evaluate(() => location.hash), '#expedition-' + identifier);
    await send(host, 'library_save', { exit: true });
    await host.locator('.party-loaded-summary').waitFor({ state: 'visible', timeout: 30000 });
    assert.deepEqual(errors, []);
    Object.assign(evidence, { passed: true, exactExpedition: identifier, privateDiscovery: true, expiredInviteRejected: true,
        packageUnchangedOnLoad: true, savedHeroes: before, nativeResume: true, errors });
    console.log(JSON.stringify(evidence));
})().catch(async error => {
    evidence.error = String(error.stack || error); evidence.errors = errors;
    if (host) await host.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    if (guest) await guest.screenshot({ path: path.join(output, 'invite-failure.png'), fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
}).finally(async () => {
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
