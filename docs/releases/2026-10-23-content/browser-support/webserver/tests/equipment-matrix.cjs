/* Validate native-produced species, mutation, form and special-item profiles. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const nativeRoot = process.env.EQUIPMENT_NATIVE_ROOT || '/tmp/dcss-equipment-validation/source';
const input = process.env.EQUIPMENT_MATRIX || '/tmp/dcss-equipment-validation/matrix.jsonl';
const speciesFile = process.env.EQUIPMENT_SPECIES || '/tmp/dcss-equipment-validation/species.json';
const out = process.env.EQUIPMENT_PROOF_DIR || '/tmp/dcss-equipment-validation/browser';
const cases = Object.fromEntries(fs.readFileSync(input, 'utf8').trim().split('\n').map((line, index) => {
    const hero = JSON.parse(line);
    return [hero.case_group + ':' + index + ':' + hero.name, hero];
}));
for (const [name, hero] of Object.entries(JSON.parse(fs.readFileSync(speciesFile))))
    cases['starting:' + name] = { ...hero, case_group: 'starting' };
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = [], issues = [], results = [], screenshots = new Set();
    page.on('pageerror', error => errors.push(error.message));
    const keys = Object.keys(cases);
    const open = async key => {
        await page.evaluate(index => {
            window.crawl_party.state.controlled_slot = index;
            window.crawl_party.state.active_slot = index;
            window.modules.inspector.open(index, 'equipment');
        }, keys.indexOf(key));
        await page.waitForFunction(() => document.querySelector('.paperdoll-hero-art')?.dataset.art === 'ready');
    };
    const check = (condition, label, detail) => { if (!condition) issues.push({ label, detail }); };
    try {
        await require('./helpers/equipment-fixture.cjs').install(page, cases, nativeRoot);
        // These fixtures cover many cases, but a game has at most four heroes.
        // Hide the fixture selector rail to avoid measuring dozens of fake tabs.
        await page.addStyleTag({ content: '#party_insp_hero_bar { display:none; }' });
        for (const [key, hero] of Object.entries(cases)) {
            await page.setViewportSize({ width: 1280, height: 900 });
            await open(key);
            const profile = hero.equipment_profile;
            const expectedSlots = profile.slots.filter(slot => slot.capacity > 0);
            const rendered = await page.locator('[data-equip-slot]').evaluateAll(slots => slots.map(slot => ({
                key: slot.dataset.equipSlot, state: slot.dataset.state, label: slot.getAttribute('aria-label')
            })));
            check(JSON.stringify(rendered.map(slot => slot.key).sort()) === JSON.stringify(expectedSlots.map(slot => slot.key).sort()),
                key, 'Displayed sockets differ from native capacity');
            for (const slot of expectedSlots) {
                const actual = rendered.find(entry => entry.key === slot.key);
                check(actual?.state === slot.state, key, slot.key + ': state differs');
                check(actual?.label.includes(slot.label), key, slot.key + ': native label missing');
                if (slot.reason) check(actual?.label.includes(slot.reason), key, slot.key + ': native reason missing');
            }
            for (const item of hero.inventory) {
                const owners = profile.slots.filter(slot => slot.inv_slot === item.slot);
                if (owners.some(slot => slot.state === 'melded')) {
                    const text = await page.locator('[data-item-slot="' + item.slot + '"] .folio-state').innerText();
                    check(text.includes('Melded'), key, item.name + ': backpack fails to identify melded gear');
                }
            }
            await page.locator('#party_filter_gear').click();
            const gear = await page.locator('.folio-inventory-row:visible').evaluateAll(rows => rows.map(row => Number(row.dataset.itemSlot)).sort((a, b) => a - b));
            const nativeGear = profile.items.filter(item => item.equipment).map(item => item.inv_slot).sort((a, b) => a - b);
            check(JSON.stringify(gear) === JSON.stringify(nativeGear), key, 'Gear filter differs from native equipment classification');
            await page.locator('#party_filter_all').click();
            const weapon = profile.slots.find(slot => slot.type === 'weapon');
            if (weapon?.capacity === 0 && profile.unarmed_attack)
                check((await page.locator('.equipment-paperdoll').innerText()).includes(profile.unarmed_attack), key, 'Unarmed attack missing without weapon slot');
            const empty = expectedSlots.find(slot => slot.state === 'empty' && slot.support_only)
                || expectedSlots.find(slot => slot.state === 'empty');
            if (empty) {
                await page.locator('[data-equip-slot="' + empty.key + '"]').click();
                const visible = await page.locator('.folio-inventory-row:visible').evaluateAll(rows => rows.map(row => Number(row.dataset.itemSlot)).sort((a, b) => a - b));
                const wanted = profile.items.filter(item => item.equipment && (item.slot_types.includes(empty.type)
                    || empty.support_only && item.required_slots.some(group => group.includes(empty.type))))
                    .map(item => item.inv_slot).sort((a, b) => a - b);
                check(JSON.stringify(visible) === JSON.stringify(wanted), key, 'Slot filter loses native-compatible target items');
                await page.locator('#party_filter_slot').click();
            }
            for (const width of [1280, 768, 390, 320]) {
                await page.setViewportSize({ width, height: 900 });
                const fits = await page.locator('#party_insp_body').evaluate(node => node.scrollWidth <= node.clientWidth + 1);
                check(fits, key, 'Horizontal overflow at ' + width);
            }
            const snapshot = hero.case_group === 'special' || /felid|sphinx|serpent|crab/i.test(key);
            if (snapshot && !screenshots.has(hero.name)) {
                await page.setViewportSize({ width: 1280, height: 1000 });
                await page.locator('#party_insp_body').evaluate(node => { node.scrollTop = 0; });
                await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'case-' + keys.indexOf(key) + '.png') });
                screenshots.add(hero.name);
            }
            results.push({ key, group: hero.case_group, slots: expectedSlots.length, checked: true });
        }

        // Losing a granted slot must clear its filter and retain keyboard focus.
        const expanded = keys.find(key => cases[key].name === 'Combined slot grants');
        const baseline = keys.find(key => cases[key].case_group === 'species' && cases[key].species === 'Human');
        assert(expanded && baseline);
        await open(expanded);
        await page.locator('[data-equip-slot="ring:4"]').click();
        await page.evaluate(baseline => {
            const index = window.crawl_party.inspector_slot;
            const replacement = structuredClone(baseline);
            replacement.slot = index;
            window.crawl_party.state.members[index] = replacement;
            window.modules.inspector.render();
        }, cases[baseline]);
        check(await page.locator('#party_filter_slot').isHidden(), 'slot loss', 'Removed slot filter remains active');
        check(await page.evaluate(() => document.activeElement.id === 'party_inventory_search'), 'slot loss', 'Keyboard focus is lost when a socket disappears');
        check(await page.locator('.folio-inventory-row:visible').count() === cases[baseline].inventory.length,
            'slot loss', 'Removed slot leaves the pack filtered');

        const evidence = { passed: !issues.length && !errors.length, counts: results.reduce((counts, result) => {
            counts[result.group] = (counts[result.group] || 0) + 1; return counts;
        }, {}), cases: results.length, widths: [1280, 768, 390, 320], issues, errors, results };
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        assert.deepEqual(errors, []);
        assert.deepEqual(issues, []);
        console.log(JSON.stringify({ passed: true, cases: evidence.cases, counts: evidence.counts, widths: evidence.widths, out }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ issues, errors, completed: results.length }, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
