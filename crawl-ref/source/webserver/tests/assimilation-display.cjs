/* Actual browser rendering of body memories, with explicit sample state. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent('<!doctype html><main id="party_hud_members">'
            + '<article class="party-card" data-party-slot="0"><div class="party-card-sections"></div></article></main>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaModules = {
                jquery: window.jQuery,
                './workflow-actions': { controlledSlot: () => 0, reason: () => '', powerReason: () => '', usePower() {} },
                './frame-update': callback => callback
            };
            window.define = (dependencies, factory) => {
                window.qaModules[window.qaName] = factory(...dependencies.map(name => window.qaModules[name]));
            };
        });
        for (const name of ['equipment-memory-ui', 'assimilation-panel']) {
            await page.evaluate(name => { window.qaName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        await page.evaluate(() => {
            const effects = ['Acrobat', 'Reach 2', 'Str +2'].map(label => ({
                label, source_label: label, family: 'Amulets', method: 'Assimilated', scope: 'body'
            }));
            const data = {
                version: 3, used: 1, capacity: 1, numeric_percent: 35, shapeshifting_tenths: 0,
                slots: [{ slot: 0, unlocked: true, next: true, memory: {
                    family: 'Amulets', source: 'sample source', method: 'Assimilated', scope: 'body', effects
                } }], body_properties: effects, unarmed_properties: effects,
                work: { remaining: 0 }, digesting: [{ name: 'sample item', progress: 10, remaining_aut: 2700 }]
            };
            window.qaData = data;
            window.crawl_party = { state: { members: [{ slot: 0, abilities: [{ name: 'Assimilate' }],
                equipment_profile: { assimilation: data } }] } };
            window.qaModules['./assimilation-panel'].mount();
        });
        assert.equal(await page.locator('.assimilation-inheritance').count(), 1);
        assert.match(await page.locator('.assimilation-inheritance').innerText(), /Body.*Absorbed/s);
        assert.match(await page.locator('.assimilation-quality').innerText(), /35%/);
        const tooltip = await page.locator('.assimilation-slot').getAttribute('data-tip-body');
        assert.match(tooltip, /Applies once to the ooze, independently of equipped items/);
        assert(!tooltip.includes('Applies to Amulets'));
        assert.equal(await page.locator('.assimilation-inheritance .equipment-memory-property').count(), 3);
        assert.equal(await page.locator('.assimilation-digestion').count(), 0);
        assert.match(await page.locator('.assimilation-rule').innerText(), /random empty slot/);
        await page.locator('#assimilation_start_0').focus();
        await page.evaluate(() => {
            window.qaData.numeric_percent = 36;
            window.qaModules['./assimilation-panel'].mount();
        });
        assert.equal(await page.locator('.assimilation-digestion').count(), 0);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'assimilation_start_0');
        await page.evaluate(() => {
            window.qaData.version = 2;
            window.qaModules['./assimilation-panel'].mount();
        });
        assert.equal(await page.locator('.assimilation-inheritance').count(), 2);
        await page.evaluate(() => {
            window.qaData.slots = [
                { slot: 0, unlocked: true, next: true },
                { slot: 1, unlocked: false, next: false, unlock_xl: 7 },
                { slot: 2, unlocked: true, next: true }
            ];
            window.qaModules['./assimilation-panel'].mount();
        });
        assert.deepEqual(await page.locator('.assimilation-next').allTextContents(), ['Open', 'Open']);
        assert.equal(await page.locator('.assimilation-slot[data-locked="true"] .assimilation-next').count(), 0);
        assert.match(await page.locator('.assimilation-slot').first().getAttribute('data-tip-body'), /random unlocked empty slot/);
        assert.deepEqual(errors, []);
        console.log('PASS: body display, 35% floor, native passive labels, legacy display, focus, random open-slot labels and no passive digestion');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
