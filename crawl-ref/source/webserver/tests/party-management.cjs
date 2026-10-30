/* Two disposable accounts exercise real lobby messages and ownership. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { signInTestAccount } = require('./helpers/test-account.cjs');
const url = process.env.WEBTILES_URL || 'http://localhost:8888';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const output = process.env.PARTY_MANAGEMENT_PROOF || '/tmp/dcss-party-management-proof';
fs.mkdirSync(output, { recursive: true });
const errors = [], packets = [], evidence = {};
let browser, host, guest;
const row = (page, slot) => page.locator('[data-manager-slot="' + slot + '"]');
async function fits(page, width) {
    await page.setViewportSize({ width, height: 950 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Party fits viewport ' + width);
}
async function account(name) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => socket.on('framesent', frame => {
        try { packets.push({ account: name, ...JSON.parse(String(frame.payload)) }); } catch { /* JSON only. */ }
    }));
    await page.goto(url); await signInTestAccount(page, name, 'crawl');
    await page.locator('#lobby_home').waitFor({ state: 'visible' }); return page;
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    evidence.host = 'Aster'; evidence.guest = 'Mira';
    host = await account(evidence.host);
    await host.locator('#lobby_home [data-lobby-create]').click();
    await host.locator('#party_room_view').waitFor({ state: 'visible' });
    await host.waitForFunction(() => document.querySelectorAll('.party-manager-table tbody tr').length === 2);
    await host.locator('#party_slot_name_0').fill('Aster');
    await host.locator('#party_slot_name_0').dispatchEvent('change');
    await host.locator('#party_slot_name_0').blur();
    await host.waitForFunction(() => document.querySelector('[data-manager-slot="0"]').textContent.includes('Aster'));
    await host.locator('.party-unused-seats summary').click();
    await host.locator('[data-manager-focus="2:control"]').selectOption('open');
    await host.locator('[data-manager-focus="3:control"]').selectOption('closed');
    await host.waitForFunction(() => document.querySelector('[data-slot="3"]').dataset.seatState === 'closed');
    const inspectionStart = packets.length;
    await row(host, 0).getByRole('button', { name: 'Starting sheet for Aster' }).click();
    await host.locator('#character_guide_dialog').waitFor({ state: 'visible' });
    await host.keyboard.press('Escape');
    assert(!packets.slice(inspectionStart).some(packet => packet.msg === 'party_room_update_slot'), 'Sheet is read-only');
    await row(host, 0).getByRole('button', { name: 'Edit Aster' }).click();
    assert(await host.locator('#party_slot_name_0').evaluate(node => node === document.activeElement));
    guest = await account(evidence.guest);
    await guest.locator('.lobby-chapters [data-workspace-target="friends"]').click();
    const listing = guest.locator('.party-room-listing').filter({ hasText: evidence.host });
    await listing.waitFor({ state: 'visible' });
    await listing.locator('.party-room-seat').selectOption('2');
    await guest.locator('.lobby-discovery-header').screenshot({ path: path.join(output, 'lobby-filters.png') });
    await guest.locator('#lobby_rooms_panel').screenshot({ path: path.join(output, 'lobby-open-seats.png') });
    await guest.screenshot({ path: path.join(output, 'lobby-desktop.png') });
    await listing.getByRole('button', { name: 'Join party', exact: true }).click();
    await guest.locator('#party_room_view').waitFor({ state: 'visible' });
    await host.waitForFunction(name => document.querySelector('[data-slot="2"]').dataset.seatOwner === name, evidence.guest);
    assert(packets.some(packet => packet.account === evidence.guest && packet.msg === 'party_room_join' && packet.slot === 2));
    assert(await guest.locator('#party_slot_name_0').isDisabled(), 'Guest cannot edit another player');
    assert(await guest.locator('#party_slot_name_2').isEnabled(), 'Guest can edit their own hero');
    assert(await row(guest, 0).getByRole('button', { name: 'Edit Aster' }).isDisabled());
    await row(guest, 2).locator('.party-manager-readiness button').click();
    await host.waitForFunction(() => document.querySelector('[data-slot="2"]').dataset.seatReady === 'false');
    assert.match(await host.locator('#party_room_status_hint').textContent(), /1 hero is not ready/, 'Host sees the guest is waiting');
    await row(guest, 2).locator('.party-manager-readiness button').click();
    await host.waitForFunction(() => document.querySelector('[data-slot="2"]').dataset.seatReady === 'true');
    let dismissed = false;
    host.once('dialog', async dialog => { dismissed = true; await dialog.dismiss(); });
    await host.locator('.party-slot-box[data-slot="2"] [data-mode="closed"]').click();
    assert(dismissed, 'Releasing an occupied seat asks for confirmation');
    assert.equal(await host.locator('.party-slot-box[data-slot="2"]').getAttribute('data-seat-owner'), evidence.guest);
    dismissed = false;
    host.once('dialog', async dialog => { dismissed = true; await dialog.dismiss(); });
    await host.locator('#btn_leave_party_room').click();
    assert(dismissed, 'Closing a party occupied by a friend asks for confirmation');
    assert(await host.locator('#party_room_view').isVisible());
    await host.waitForFunction(() => {
        const sheet = require('starting-sheet');
        return Array.from(document.querySelectorAll('.party-slot-box')).every(card => sheet.preview(sheet.read(card)).status === 'ready');
    }, null, { timeout: 30000 });
    await host.waitForFunction(() => Array.from(document.querySelectorAll('.party-manager .native-player-tile')).every(node => node.dataset.equipped === 'true'));
    await host.locator('.party-manager').screenshot({ path: path.join(output, 'party-manager-desktop.png') });
    for (const width of [390, 768, 1440]) await fits(host, width);
    await host.locator('#party_room_view').scrollIntoViewIfNeeded();
    await host.screenshot({ path: path.join(output, 'party-builder-desktop.png') });
    const art = await host.evaluate(() => {
        const catalog = require('character-catalog'), art = require('class-art');
        const names = Object.keys(catalog.jobs);
        return { names, covered: art.names, icons: names.map(name => ({ name, svg: art.render(catalog.jobs[name]).outerHTML,
            path: art.render(catalog.jobs[name]).querySelector('path').getAttribute('d') })) };
    });
    assert.deepEqual(art.covered.slice().sort(), art.names.slice().sort(), 'Every native class has an emblem');
    assert.equal(new Set(art.icons.map(icon => icon.path)).size, art.names.length, 'All class symbols are distinct');
    evidence.classCount = art.names.length;
    const gallery = await browser.newPage({ viewport: { width: 1320, height: 980 } });
    await gallery.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await gallery.addStyleTag({ path: path.resolve(__dirname, '../static/tabletop/party-management.css') });
    await gallery.evaluate(icons => {
        document.body.replaceChildren();
        document.body.style.cssText = 'margin:0;background:#1e2324;color:#ead8b8;padding:30px;font-family:Georgia,serif;box-sizing:border-box;';
        const title = document.createElement('h1'); title.textContent = 'Class insignia'; title.style.margin = '0 0 6px';
        const note = document.createElement('p'); note.textContent = icons.length + ' distinct starting backgrounds · scalable vector emblems'; note.style.color = '#bfae91';
        const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:12px;margin-top:24px;';
        icons.forEach(icon => {
            const cell = document.createElement('div'); cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;min-height:115px;text-align:center;font-size:13px;padding:12px 4px;border:1px solid #8b75514d;background:#292b2a;box-sizing:border-box;';
            cell.innerHTML = icon.svg; const label = document.createElement('span'); label.textContent = icon.name; cell.appendChild(label);
            cell.querySelector('svg').style.cssText += ';width:62px;height:62px'; grid.appendChild(cell);
        }); document.body.append(title, note, grid);
    }, art.icons);
    await gallery.screenshot({ path: path.join(output, 'all-class-icons.png'), fullPage: true });
    await gallery.close();
    await guest.locator('#btn_leave_party_room').click();
    await host.waitForFunction(() => !document.querySelector('[data-slot="2"]').dataset.seatOwner);
    await host.locator('#btn_leave_party_room').click();
    assert.deepEqual(errors, []); evidence.success = true;
    console.log(JSON.stringify(evidence));
})().catch(async error => {
    evidence.error = String(error.stack || error); console.error(error); process.exitCode = 1;
    if (host) await host.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
}).finally(async () => {
    evidence.errors = errors; fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
