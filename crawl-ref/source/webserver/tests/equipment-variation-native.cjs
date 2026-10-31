const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real mutation, form, species and slot-grant transitions in a disposable game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8898';
assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const out = process.env.EQUIPMENT_PROOF_DIR || '/tmp/dcss-equipment-validation/native';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20000);
    const errors = [], cases = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const key = value => page.evaluate(value => require('comm').send_message('key', { keycode: value.charCodeAt(0) }), value);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const prompt = async (value, question) => {
        if (question) await page.waitForFunction(question => Array.from(document.querySelectorAll('#messages .game_message'))
            .some(line => line.textContent.includes(question) && line.querySelector('input')?.getClientRects().length), question);
        const field = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await field.waitFor(); await field.fill(String(value)); await field.press('Enter');
    };
    const wizard = async code => { await key('&'); await key(code); };
    const menu = async () => {
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
        await page.waitForFunction(() => document.querySelector('.paperdoll-hero-art')?.dataset.art === 'ready');
    };
    const close = async () => {
        await page.locator('#party_inspector_close_btn').click();
        await page.locator('#party_inspector_modal').waitFor({ state: 'hidden' }); await ready();
    };
    const shot = async label => {
        await page.mouse.move(2, 2); await page.evaluate(() => window.dcss_tooltips?.hide());
        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, label + '.png') });
    };
    const waitCapacity = (type, count) => page.waitForFunction(({ type, count }) =>
        window.crawl_party.state.members[0].equipment_profile.slots.find(slot => slot.type === type).capacity === count,
    { type, count });
    const mutate = async (name, levels) => {
        await wizard(']'); await prompt(name, 'Which mutation'); await prompt(levels, 'How many levels'); await ready();
    };
    const transform = async name => {
        await wizard('p');
        const hotkey = await page.waitForFunction(name => {
            const row = Array.from(document.querySelectorAll('#ui-stack li.selectable')).find(row => {
                if (!row.getClientRects().length) return false;
                const copy = row.cloneNode(true);
                copy.querySelectorAll('kbd').forEach(key => key.remove());
                return copy.textContent.trim().toLowerCase().endsWith(' - ' + name.toLowerCase());
            });
            return row?.dataset.menuKey;
        }, name);
        await key(await hotkey.jsonValue());
        await ready();
    };
    const changeSpecies = async name => {
        await wizard('r'); await prompt(name); await ready();
        await page.waitForFunction(name => window.crawl_party.state.members[0].species === name, name);
    };
    const createItem = async (spec, match) => {
        await wizard('%'); await prompt(spec); await ready(); await key('g'); await ready();
        await page.waitForFunction(match => window.crawl_party.state.members[0].inventory.some(item => item.name.includes(match)), match);
        return (await state()).members[0].inventory.find(item => item.name.includes(match));
    };
    try {
        await page.goto(url);
        const account = 'EquipMatrix' + Date.now().toString().slice(-7);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        const leader = page.locator('.party-slot-box[data-slot="0"]');
        await leader.locator('.party-slot-species').selectOption('Human');
        await leader.locator('.party-slot-job').selectOption('Fighter');
        for (let index = 1; index < 4; index++)
            await page.locator(`.party-slot-box[data-slot='${index}'] [data-mode='closed']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1, null, { timeout: 120000 });
        await ready();
        await key('&'); await prompt('wiz'); await key('\u001b'); await ready();
        await wizard('E'); await ready();

        const necklace = await createItem('macabre finger necklace pre_id', 'macabre finger');
        await menu(); await page.locator('#party_item_0_' + necklace.slot).click();
        await page.locator('.describe-item .actions button').filter({ hasText: /^Put on/ }).click();
        await ready(); await waitCapacity('ring', 3);
        await page.locator('#party_inspector_modal[open]').waitFor();
        await page.locator('[data-equip-slot="ring:2"]').click();
        await page.locator('[data-equip-slot="amulet:0"]').click();
        await page.locator('.describe-item .actions button').filter({ hasText: /^Remove/ }).click();
        await ready(); await waitCapacity('ring', 2);
        await page.locator('#party_inspector_modal[open]').waitFor();
        assert(await page.locator('#party_filter_slot').isHidden());
        assert(await page.locator('.folio-inventory-row:visible').count() > 0);
        cases.push('Native equip/remove grants and removes a ring socket, clearing its active filter');
        await close();

        await mutate('horns', 1); await menu();
        assert.equal(await page.locator('[data-equip-slot="head:0"]').count(), 1);
        assert.match(await page.locator('.paperdoll-restrictions').innerText(), /Hard helmets/);
        await close(); await mutate('horns', 2); await waitCapacity('head', 0);
        await mutate('claws', 3); await waitCapacity('hands', 0);
        await mutate('hooves', 3); await waitCapacity('feet', 0);
        await menu(); await shot('mutation-restrictions');
        assert.equal(await page.locator('[data-equip-slot="head:0"]').count(), 0);
        assert.match(await page.locator('.paperdoll-restrictions').innerText(), /No helmet|No gloves|No boots/);
        cases.push('Native horns, claws and hooves alter visible slots and restriction explanations');
        await close();
        for (const name of ['horns', 'claws', 'hooves']) await mutate(name, -3);
        await waitCapacity('head', 1); await waitCapacity('hands', 1); await waitCapacity('feet', 1);
        cases.push('Removing mutations restores native equipment capacity');

        await createItem('great sword pre_id', 'great sword');
        await transform('bat'); await menu();
        const bat = (await state()).members[0];
        const melded = bat.equipment_profile.slots.filter(slot => slot.state === 'melded');
        assert(melded.length > 0);
        for (const item of new Set(melded.map(slot => slot.inv_slot)))
            assert.match(await page.locator('[data-item-slot="' + item + '"] .folio-state').innerText(), /Melded.*inactive/);
        await shot('bat-melded'); await close();
        await transform('amphisbaena'); await waitCapacity('head', 2); await menu();
        assert.equal(await page.locator('[data-slot-type="head"]').count(), 2);
        await shot('serpent-two-heads'); await close();
        await transform('fortress crab'); await waitCapacity('twohander', 1); await menu();
        await page.locator('[data-equip-slot="twohander:0"]').click();
        assert.match(await page.locator('.folio-inventory-list').innerText(), /great sword/);
        await shot('fortress-crab-support'); await close();
        await transform('None');
        assert(!(await state()).members[0].equipment_profile.slots.some(slot => slot.state === 'melded'));
        cases.push('Native bat, serpent, fortress crab and normal-form transitions preserve accurate states and support-slot filtering');

        for (const [species, type, count] of [['Felid', 'weapon', 0], ['Naga', 'barding', 1],
            ['Octopode', 'ring', 8], ['Poltergeist', 'haunted_armour', 6], ['Coglin', 'weapon_offhand', 1]]) {
            await changeSpecies(species); await waitCapacity(type, count); await menu();
            if (species === 'Felid') {
                assert.equal(await page.locator('[data-slot-type="weapon"]').count(), 0);
                assert(await page.locator('.paperdoll-unarmed').isVisible());
            }
            const before = (await state()).world_aut_clock;
            await shot(species.toLowerCase() + '-transition'); await close();
            assert.equal((await state()).world_aut_clock, before);
            cases.push('Native species transition: ' + species);
        }
        assert.deepEqual(errors, []);
        const evidence = { passed: true, cases, errors, environment: 'disposable localhost wizard game' };
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ cases, errors, state: await state().catch(() => null) }, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
