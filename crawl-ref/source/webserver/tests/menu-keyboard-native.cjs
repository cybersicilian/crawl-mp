const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Keyboard routing against an isolated engine and disposable localhost account. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8898';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.MENU_PROOF_DIR || '/tmp/dcss-menu-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(15000);
    const errors = [], evidence = { account: 'MenuQA' + Date.now().toString().slice(-8) };
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const raw = key => page.evaluate(key => require('comm').send_message('key', { keycode: key.charCodeAt(0) }), key);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    async function closeNative() {
        for (let index = 0; index < 10 && await page.locator('#ui-stack > *').count(); index++) {
            await page.evaluate(() => require('comm').send_message('key', { keycode: 27 }));
            await page.waitForTimeout(100);
        }
        await ready();
    }
    async function closeFolio() {
        for (let index = 0; index < 3 && await page.locator('#party_inspector_modal[open]').count(); index++) {
            await page.keyboard.press('Escape'); await page.waitForTimeout(50);
        }
        assert.equal(await page.locator('#party_inspector_modal[open]').count(), 0);
    }
    const reset = () => page.evaluate(() => { window.qaSent = []; });
    const sent = () => page.evaluate(() => window.qaSent);
    async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); }
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
        await page.waitForFunction(() => /4 heroes/.test(document.getElementById('btn_launch_party_room').textContent));
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await ready();
        await page.evaluate(() => {
            window.qaSent = [];
            const comm = require('comm'), send = comm.send_message;
            comm.send_message = function (msg, data) {
                window.qaSent.push({ msg, ...data }); return send.apply(this, arguments);
            };
        });
        const initial = await state();

        // Native inventory letters continue to work after tab/button focus.
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('i');
        await page.locator('.workflow-inventory').waitFor();
        const directKey = await page.locator('.workflow-inventory li.selectable').first().getAttribute('data-menu-key');
        await page.keyboard.press(directKey);
        await page.locator('.describe-item:visible').waitFor(); await closeNative();
        await raw('i'); await page.locator('.workflow-inventory').waitFor();
        await page.locator('.workflow-categories [aria-selected=true]').focus();
        const first = page.locator('.workflow-inventory li.selectable').first();
        const itemKey = await first.getAttribute('data-menu-key');
        assert(itemKey && itemKey.length === 1);
        await page.keyboard.press(itemKey);
        await page.locator('.describe-item:visible').waitFor();
        const actions = page.locator('.describe-item .actions [data-hotkey]');
        assert(await actions.count());
        const actionKeys = await actions.evaluateAll(buttons => buttons.map(button => button.dataset.hotkey));
        evidence.itemActionKeys = actionKeys;
        await reset();
        await page.locator('#ui-stack > *').last().locator('.workflow-popup-tools button').focus();
        await page.keyboard.press('Enter');
        await page.locator('#ui-stack .describe-item').waitFor({ state: 'detached' });
        assert.equal((await sent()).filter(packet => packet.msg === 'key' && packet.keycode === 27).length, 1);
        await closeNative();

        // One Enter/Space activates a focused native Menu row exactly once.
        for (const key of ['Enter', 'Space']) {
            await raw('i'); await page.locator('.workflow-inventory').waitFor();
            await page.locator('.workflow-inventory li.selectable').first().focus();
            await reset(); await page.keyboard.press(key);
            await page.locator('.describe-item:visible').waitFor();
            assert.equal((await sent()).filter(packet => packet.msg === 'key').length, 1);
            await closeNative();
        }
        await raw('i'); await page.locator('.workflow-inventory').waitFor();
        await page.locator('.workflow-inventory li.selectable').first().focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.classList.contains('selectable')), true);
        await shot('inventory-keyboard'); await closeNative();

        // Command keys use the same bespoke surfaces as the dock.
        for (const [key, section] of [['m', 'skills'], ['A', 'mutations'], ['%', 'overview']]) {
            await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press(key);
            await page.locator('#party_inspector_modal[open]').waitFor();
            assert.equal(await page.evaluate(() => window.crawl_party.inspector_tab), section);
            await closeFolio();
        }
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'overview'));
        await page.keyboard.press(']');
        assert.equal(await page.evaluate(() => window.crawl_party.inspector_tab), 'abilities');
        await page.keyboard.press('[');
        assert.equal(await page.evaluate(() => window.crawl_party.inspector_tab), 'overview');
        await page.keyboard.press('2');
        assert.equal(await page.evaluate(() => window.crawl_party.inspector_slot), 1);
        assert.equal((await state()).active_slot, initial.active_slot, 'Inspection does not transfer control');
        await page.keyboard.press('1');
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
        const inspect = page.locator('#party_insp_panel_equipment [data-folio-key]').filter({ hasText: 'Inspect' }).first();
        const inspectKey = await inspect.getAttribute('data-folio-key');
        await page.locator('#party_inspector_close_btn').focus(); await page.keyboard.press(inspectKey);
        await page.locator('.describe-item:visible').waitFor(); await closeNative();
        await page.locator('#party_inspector_modal[open]').waitFor();
        assert.equal(await page.evaluate(() => window.crawl_party.inspector_tab), 'equipment');
        await reset();
        await page.locator('#party_inventory_search').focus();
        await page.keyboard.type('a[m]');
        assert.equal(await page.locator('#party_inventory_search').inputValue(), 'a[m]');
        assert.equal(await page.evaluate(() => window.crawl_party.inspector_tab), 'equipment');
        assert.deepEqual(await sent(), []);
        await closeFolio();

        // Native lookup search typing stays isolated; chapter/list keys remain available.
        if (!await page.locator('#dock_codex_btn').isVisible())
            await page.locator('#quickbar_more > summary').click();
        await page.locator('#dock_codex_btn').click();
        await page.getByRole('searchbox', { name: 'Search the encyclopedia' }).waitFor();
        await reset(); await page.getByRole('searchbox', { name: 'Search the encyclopedia' }).fill('goblin');
        assert.deepEqual(await sent(), []);
        await page.keyboard.press('Enter');
        await page.locator('.menu_lookup_search .menu_contents li.selectable').first().waitFor();
        await page.locator('.menu_lookup_search .menu_contents li.selectable').filter({ hasText: /Goblin · monster/i }).first().focus();
        await page.keyboard.press('Enter');
        await page.locator('.describe-monster:visible').waitFor();
        assert(await page.locator('.describe-monster.workflow-surface').count());
        const monsterTabs = page.locator('.describe-monster .workflow-pane-tabs button');
        if (await monsterTabs.count() > 1) {
            await monsterTabs.first().focus(); await page.keyboard.press('ArrowRight');
            assert.equal(await monsterTabs.nth(1).getAttribute('aria-selected'), 'true');
        }
        await shot('bestiary-surface'); await closeNative();
        await raw('?'); await page.locator('#ui-stack .workflow-surface').waitFor();
        evidence.helpSurface = await page.locator('#ui-stack .workflow-surface').last().getAttribute('class');
        await shot('help-surface'); await closeNative();
        assert.equal((await state()).world_aut_clock, initial.world_aut_clock, 'Menu reads spend no turns');

        // Separate spell/ability pickers make native letters unambiguous.
        const caster = (await state()).members.find(member => member.spells?.some(spell => spell.mp_cost <= member.mp));
        assert(caster, 'The fixture party needs a caster');
        await page.evaluate(slot => require('comm').send_message('switch_player', { slot }), caster.slot);
        await page.waitForFunction(slot => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return require(name).controlledSlot() === slot;
        }, caster.slot);
        await ready(); await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('z'); await page.locator('#power_picker_dialog[open]').waitFor();
        assert.equal(await page.evaluate(() => document.activeElement.id), 'power_picker_heading');
        await page.keyboard.press('ArrowDown');
        assert(await page.evaluate(() => document.activeElement.classList.contains('power-picker-cast-button')));
        await reset(); await page.keyboard.press('/');
        await page.keyboard.type('a[z]');
        assert.equal(await page.locator('#power_picker_search').inputValue(), 'a[z]');
        assert.deepEqual(await sent(), []);
        await page.locator('#power_picker_search').fill('');
        await page.locator('#power_picker_heading').focus();
        const cast = page.locator('#power_picker_list .power-picker-cast-button:enabled').first();
        const castKey = await cast.getAttribute('data-folio-key');
        await reset(); await page.keyboard.press(castKey);
        await page.locator('#power_picker_dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => window.qaSent.some(packet => packet.msg === 'power_action'));
        assert.equal((await sent()).filter(packet => packet.msg === 'power_action').length, 1);
        await closeNative();
        await page.evaluate(() => require('comm').send_message('key', { keycode: 27 }));
        await ready();
        evidence.directPowerKey = castKey;

        for (const [width, height] of [[1280, 800], [768, 900], [390, 844]]) {
            await page.setViewportSize({ width, height });
            await raw('i'); await page.locator('.workflow-inventory').waitFor();
            const bounds = await page.locator('#ui-stack > *').last().locator('.ui-popup-outer').boundingBox();
            assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Popup fits ' + width);
            await shot('inventory-' + width); await closeNative();
        }
        assert.deepEqual(errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await shot('failure');
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
