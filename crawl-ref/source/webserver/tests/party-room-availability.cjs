/* Room discovery uses authoritative seats and retains live/legacy joins. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><section id="party_lobby_panel">'
            + '<div id="party_rooms_list_view"><table id="party_rooms_table"><tbody id="party_rooms_tbody"></tbody></table></div>'
            + '<div id="party_room_view"></div><div id="party_rooms_empty"></div></section></body></html>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery };
            window.define = (deps, create) => {
                if (typeof deps === 'function') window.modules[window.moduleName] = deps();
                else window.modules[window.moduleName] = create(...deps.map(dep => window.modules[dep]));
            };
        });
        for (const name of ['character-catalog', 'class-art', 'party-room-list']) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, 'static/scripts', name + '.js') });
        }
        const render = room => page.evaluate(room => {
            window.modules['party-room-list'].render([room]);
        }, room);
        const room = { room_id: 'room-a', host: 'Host', name: 'Expedition', slots: [], available_slots: [] };
        await render(room);
        let button = page.locator('.btn-join-party-room');
        assert(await button.isDisabled());
        assert.equal(await button.textContent(), 'No open seats');
        await render({ ...room, available_slots: [2] });
        assert(await button.isEnabled());
        assert.equal(await button.textContent(), 'Join party');
        assert.equal(await page.locator('.party-room-seat').inputValue(), '2');
        assert.equal(await page.locator('.party-room-seat option').textContent(), 'P3 · Open seat');
        await render({ ...room, status: 'launched' });
        assert(await button.isEnabled(), 'Staging slots cannot infer current native membership');
        assert.equal(await button.textContent(), 'Join live expedition');
        const legacy = { ...room }; delete legacy.available_slots;
        await render(legacy);
        assert(await button.isEnabled(), 'A legacy server does not falsely report full rooms');
        assert.deepEqual(errors, []);
        console.log('Closed/full staging rooms, available seats, live joins and legacy compatibility passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
