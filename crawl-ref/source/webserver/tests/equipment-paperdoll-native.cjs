const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Fresh native gameplay, isolated localhost accounts and save directory only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8895';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.EQUIPMENT_LIVE_PROOF_DIR || '/tmp/dcss-equipment-live-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const key = code => page.evaluate(keycode => require('comm').send_message('key', { keycode }), code);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const shot = async name => {
        await page.mouse.move(5, 5);
        await page.evaluate(() => window.dcss_tooltips?.hide());
        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, name + '.png') });
    };
    try {
        await page.goto(url);
        const account = 'BodyQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        const species = process.env.EQUIPMENT_LIVE_SPECIES ? JSON.parse(process.env.EQUIPMENT_LIVE_SPECIES)
            : ['Minotaur', 'Octopode', 'Naga', 'Coglin'];
        assert.equal(species.length, 4);
        for (let slot = 0; slot < species.length; slot++) {
            const box = page.locator(`.party-slot-box[data-slot='${slot}']`);
            if (slot) await box.locator('[data-mode=companion]').click();
            await box.locator('.party-slot-species').selectOption(species[slot]);
            await box.locator('.party-slot-job').selectOption('Fighter');
        }
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await ready();
        const before = await state();
        assert(before.members.every(member => member.equipment_profile?.version === 1));
        assert(before.members.every(member => member.equipment_profile.species === member.species),
            'Every profile must use the inspected hero context');
        assert(before.members.every(member => member.equipment_profile.portrait.layers.length));
        for (let slot = 0; slot < species.length; slot++) {
            await page.evaluate(slot => window.crawl_party.open_inspector(slot, 'equipment'), slot);
            await page.waitForFunction(() => document.querySelector('.paperdoll-hero-art')?.dataset.art === 'ready');
            await shot(species[slot].toLowerCase() + '-native');
            if (species[slot] === 'Octopode') assert.equal(await page.locator('[data-equip-slot^="ring:"]').count(), 8);
            if (species[slot] === 'Naga') assert.equal(await page.locator('[data-equip-slot^="barding:"]').count(), 1);
            if (species[slot] === 'Coglin') assert.equal(await page.locator('[data-equip-slot^="weapon_offhand:"]').count(), 1);
            if (species[slot] === 'Poltergeist') assert.equal(await page.locator('[data-equip-slot^="haunted_armour:"]').count(), 6);
        }
        assert.equal((await state()).world_aut_clock, before.world_aut_clock, 'Reading anatomy consumes no world time');
        await page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
        const weapon = page.locator('[data-equip-slot="weapon:0"]');
        const focusId = await weapon.getAttribute('id');
        const originalArt = before.members[0].equipment_profile.portrait;
        await weapon.click();
        await page.locator('.describe-item:visible').waitFor();
        await key(27); await ready();
        await page.locator('#party_inspector_modal[open]').waitFor();
        await page.waitForFunction(id => document.activeElement.id === id, focusId);
        assert.equal((await state()).world_aut_clock, before.world_aut_clock);
        await weapon.click();
        await page.locator('.describe-item .actions button').filter({ hasText: /^Unwield/ }).click();
        await page.waitForFunction(() => window.crawl_party.state.members[0].equipment_profile.slots
            .find(slot => slot.type === 'weapon').state === 'empty');
        await page.locator('#party_inspector_modal[open]').waitFor();
        const unwielded = await state();
        assert.notDeepEqual(unwielded.members[0].equipment_profile.portrait, originalArt);
        assert(unwielded.members[0].aut_clock > before.members[0].aut_clock);
        const inventorySlot = before.members[0].equipment_profile.slots.find(slot => slot.type === 'weapon').inv_slot;
        await page.locator('#party_item_0_' + inventorySlot).click();
        await page.locator('.describe-item .actions button').filter({ hasText: /^Wield/ }).click();
        await page.waitForFunction(() => window.crawl_party.state.members[0].equipment_profile.slots
            .find(slot => slot.type === 'weapon').state === 'equipped');
        await page.locator('#party_inspector_modal[open]').waitFor();
        await shot('equipment-management-restored');
        assert.deepEqual(errors, []);
        const evidence = { passed: true, species, nativePortraits: true, turnFreeReads: true,
            focusRestored: true, nativeEquipmentActions: true, portraitUpdates: true, errors };
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
