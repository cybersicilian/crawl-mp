/* Isolated browser acceptance for the character decision components. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 900, height: 800 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><body><div id="lobby"><div class="party-slot-box" data-slot="0"><div class="party-character-fields"><label for="species">Species</label><select id="species" class="party-slot-species"><option>Eldritch</option><option>Minotaur</option></select><select class="party-slot-job"><option>Fighter</option><option>Shapeshifter</option></select></div></div></div></body></html>');
        await page.addStyleTag({ content: read('static/tabletop/tokens.css') + read('static/tabletop/party-setup.css') });
        await page.addScriptTag({ content: read('static/scripts/contrib/jquery.js') });
        await page.evaluate(() => { window.modules = { jquery: window.jQuery }; });
        for (const [name, file] of [
            ['character-catalog', 'static/scripts/character-catalog.js'],
            ['class-art', 'static/scripts/class-art.js'],
            ['traits', 'static/scripts/client-staging-traits.js'],
            ['overview', 'static/scripts/character-build-overview.js'],
            ['picker', 'static/scripts/searchable-select.js'],
            ['visual', 'static/scripts/character-choices.js']
        ]) {
            await page.evaluate(name => { window.define = (deps, factory) => {
                if (typeof deps === 'function') window.modules[name] = deps();
                else window.modules[name] = factory(...deps.map(dep => window.modules[dep]));
            }; }, name);
            await page.addScriptTag({ content: read(file) });
        }
        await page.evaluate(() => {
            const card = document.querySelector('.party-slot-box');
            const catalog = window.modules['character-catalog'];
            window.jQuery(card.querySelector('.party-character-fields')).append(window.modules.traits.create(0));
            window.modules.traits.refresh(card);
            const species = card.querySelector('.party-slot-species');
            Array.from(species.options).forEach(option => { option.dataset.choiceDescription = catalog.species[option.value].description; });
            window.modules.picker.recommend(species, ['Eldritch']);
            window.modules.visual.refresh(species, 'species', catalog.species);
            window.modules.overview.refresh(card, { species: catalog.species.Eldritch, job: catalog.jobs.Fighter },
                { key: 'preview', status: 'ready', snapshot: { hp: 20, mp: 2, ac: 4, ev: 9, sh: 3, str: 12, int: 8, dex: 10,
                    skills: { Fighting: 3 }, skill_details: { Fighting: { aptitude: 0 } }, inventory: [{ name: 'war axe' }], memorized: [] } });
        });
        await page.locator('.party-trait-guide summary').click();
        assert.match(await page.locator('[data-trait="mummy"]').innerText(), /cannot drink potions/i);
        assert.match(await page.locator('[data-trait="ghost"]').innerText(), /negative energy/i);
        await page.locator('.party-slot-job').selectOption('Shapeshifter');
        await page.evaluate(() => window.modules.traits.refresh(document.querySelector('.party-slot-box')));
        assert.match(await page.locator('[data-trait="mummy"] .party-trait-availability').innerText(), /incompatible/i);
        assert(await page.locator('.party-slot-trait option[value="mummy"]').isDisabled());
        assert.match(await page.locator('.build-overview').innerText(), /Fighting 3 \(apt 0\)/);
        assert.equal(await page.locator('#species_visual_choices [data-value="Eldritch"]').getAttribute('aria-pressed'), 'true');
        await page.locator('#species_visual_search').fill('mino');
        await page.locator('#species_visual_choices [data-value="Minotaur"]').click();
        assert.equal(await page.locator('#species').inputValue(), 'Minotaur');
        await page.setViewportSize({ width: 375, height: 800 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        console.log('Character choices, trait compatibility and native summary passed in an isolated browser.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
