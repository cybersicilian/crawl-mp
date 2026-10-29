const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Compare compact item art with native inventory menu pixels in a disposable game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18989';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.INVENTORY_ART_PROOF_DIR || '/tmp/dcss-inventory-art-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = { cases: [] };
    page.on('pageerror', error => errors.push(error.message));
    const key = value => page.evaluate(value => require('comm').send_message('key', { keycode: value.charCodeAt(0) }), value);
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const pixels = locator => locator.evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(0, 0, 32, 32).data));
    const shot = name => page.screenshot({ path: path.join(out, name + '.png') });
    async function closeInspector() {
        await page.locator('#party_inspector_close_btn').click();
        await page.locator('#party_inspector_modal').waitFor({ state: 'hidden' });
        await ready();
    }
    async function nativeParity(item) {
        const hud = await pixels(page.locator('#hud_item_0_' + item.slot + ' canvas'));
        await key('i');
        await page.locator('#ui-stack .workflow-inventory').waitFor();
        const category = /potion/i.test(item.kind_name) ? 1 : /scroll/i.test(item.kind_name) ? 2
            : /wand|miscellan/i.test(item.kind_name) ? 3 : 0;
        const tab = page.locator('#ui-stack [data-category="' + category + '"]');
        if (await tab.count()) await tab.click();
        const row = page.locator('#ui-stack li.selectable').filter({ hasText: item.name }).first();
        await row.waitFor();
        assert.deepEqual(await pixels(row.locator('canvas').first()), hud, item.name + ' matches native inventory art');
        await key('\u001b'); await ready();
        evidence.cases.push('native pixel parity: ' + item.name);
        return hud;
    }
    const basePixels = item => page.evaluate(slot => {
        const art = window.crawl_party.state.members[0].equipment_profile.items.find(item => item.inv_slot === slot).art;
        const moduleName = suffix => Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/' + suffix));
        const packet = require(moduleName('player')).inv[slot];
        const tile = require(moduleName('tileinfo-main')).get_tile_info([].concat(packet.tile)[0]);
        if (tile.sx !== art.layers[0].sx || tile.sy !== art.layers[0].sy)
            throw new Error('Native inventory packet and equipment profile disagree on the base sprite');
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        if (!require(moduleName('native-tile-art')).draw(canvas, { ...art, layers: [art.layers[0]] }))
            throw new Error('Native base artwork unavailable');
        return Array.from(canvas.getContext('2d').getImageData(0, 0, 32, 32).data);
    }, item.slot);
    async function wizard(command) { await key('&'); await key(command); await ready(); }
    async function createItem(spec, name) {
        await key('&'); await key('%');
        const input = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await input.fill(spec + ' no_uniq'); await input.press('Enter');
        await ready();
        await key('g'); await ready();
        await page.waitForFunction(name => window.crawl_party.state.members[0].inventory.some(item => new RegExp(name).test(item.name)), name);
        return (await state()).members[0].inventory.find(item => new RegExp(name).test(item.name));
    }
    try {
        await page.goto(url);
        evidence.account = 'BrandQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        const leader = page.locator('.party-slot-box[data-slot="0"]');
        await leader.locator('.party-slot-species').selectOption('Human');
        await leader.locator('.party-slot-job').selectOption('Chaos Knight');
        await leader.locator('.party-slot-weapon').selectOption('mace');
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1, null, { timeout: 120000 });
        await ready();
        await page.locator('#hud_item_0_0 canvas').waitFor();
        const initial = await state(), mace = initial.members[0].inventory.find(item => /mace.*chaos/.test(item.name));
        assert(mace, 'Reproduce the attached chaos mace');
        const known = await nativeParity(mace);
        const beforeReads = initial.world_aut_clock;
        await page.locator('#quickbar_slot_0').click();
        await page.locator('#quickbar_entry_item_' + mace.slot).click();
        assert.deepEqual(await pixels(page.locator('#quickbar_slot_0 canvas')), known, 'Quick slots keep the brand');
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
        assert.deepEqual(await pixels(page.locator('#party_item_0_' + mace.slot + ' canvas')), known, 'Backpack keeps the brand');
        assert.deepEqual(await pixels(page.locator('[data-equip-slot="weapon:0"] canvas')), known, 'Loadout keeps the brand');
        await closeInspector();
        assert.equal((await state()).world_aut_clock, beforeReads);
        await shot('chaos-brand');
        evidence.cases.push('HUD, quick slot, backpack and loadout agree without using a turn');

        await key('&');
        const confirmation = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await confirmation.fill('wiz'); await confirmation.press('Enter');
        await key('\u001b'); await ready();
        await wizard('E');
        const boots = await createItem('pair of boots ego:flying pre_id', 'boots|barding');
        await nativeParity(boots);
        const ammo = await createItem('dart ego:curare pre_id q:3', 'curare');
        await nativeParity(ammo);
        assert(await page.locator('#hud_item_0_' + ammo.slot).evaluate(button => {
            const count = button.querySelector('.hud-slot-quantity').getBoundingClientRect();
            const art = button.querySelector('canvas').getBoundingClientRect();
            return count.bottom <= art.y + art.height * 18 / 32;
        }), 'Stack counts leave the bottom-right brand visible');
        const staff = await createItem('staff of fire pre_id', 'staff of fire');
        await nativeParity(staff);
        const aliased = [];
        for (const name of ['potion of empathy', 'potion of soul ambrosia', 'potion of concord',
            'potion of transfusion', 'ring of camaraderie', 'amulet of the vanguard',
            'scroll of soul recall', 'scroll of rallying', 'scroll of phase swap', 'scroll of shared vigour']) {
            const item = await createItem(name + ' pre_id q:1', name);
            const composite = await nativeParity(item);
            if (name === 'potion of empathy' || name === 'ring of camaraderie') {
                const before = (await state()).world_aut_clock;
                await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
                assert.deepEqual(await pixels(page.locator('#party_item_0_' + item.slot + ' canvas')), composite);
                await closeInspector();
                assert.equal((await state()).world_aut_clock, before);
            }
            aliased.push({ slot: item.slot, name, base: await basePixels(item) });
        }
        await shot('known-item-properties');

        await wizard('I');
        await page.waitForFunction(() => !window.crawl_party.state.members[0].inventory.find(item => item.slot === 0).name.includes('chaos'));
        const unknown = (await state()).members[0].inventory.find(item => item.slot === mace.slot);
        const hidden = await nativeParity(unknown);
        assert.notDeepEqual(hidden, known, 'Unidentified weapon art must hide its brand');
        assert.notDeepEqual(await pixels(page.locator('#quickbar_slot_0 canvas')), known, 'Quick slot refreshes after identification changes');
        for (const fixture of aliased) {
            const item = (await state()).members[0].inventory.find(item => item.slot === fixture.slot);
            assert.deepEqual(await nativeParity(item), fixture.base, fixture.name + ' keeps its physical sprite when identified');
        }
        await wizard('i');
        await page.waitForFunction(() => window.crawl_party.state.members[0].inventory.find(item => item.slot === 0).name.includes('chaos'));
        assert.deepEqual(await pixels(page.locator('#hud_item_0_' + mace.slot + ' canvas')), known);
        assert.deepEqual(await pixels(page.locator('#quickbar_slot_0 canvas')), known);
        for (const fixture of aliased) {
            const item = (await state()).members[0].inventory.find(item => item.slot === fixture.slot);
            assert.deepEqual(await basePixels(item), fixture.base, fixture.name + ' keeps its sprite after type identification');
            await nativeParity(item);
        }
        evidence.cases.push('All ten co-op potion, jewellery and scroll aliases retain their base sprites through identification');
        evidence.cases.push('Native identification hides and restores brand overlays in HUD and quick slots');

        await key('&'); await key('p');
        await page.locator('#ui-stack li.selectable').filter({ hasText: / - bat\b/ }).first().click();
        await ready();
        await page.waitForFunction(() => window.crawl_party.state.members[0].equipment_profile.items
            .some(item => item.art.layers.some(layer => layer.texture === 'icons')));
        await nativeParity((await state()).members[0].inventory.find(item => item.slot === mace.slot));
        evidence.cases.push('Native melded mesh composes layers from the icons atlas');

        for (const [width, height] of [[1440, 900], [1024, 768]]) {
            await page.setViewportSize({ width, height });
            assert(await page.locator('#hud_inventory').evaluate(node => {
                const box = node.getBoundingClientRect(); return box.right <= innerWidth && box.bottom <= innerHeight;
            }));
            assert.equal(await page.locator('#hud_item_0_' + mace.slot + ' canvas').getAttribute('width'), '32');
            await shot('inventory-' + width);
        }
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        assert.deepEqual(errors, []);
        evidence.passed = true; evidence.errors = errors;
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await shot('failure').catch(() => {});
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
