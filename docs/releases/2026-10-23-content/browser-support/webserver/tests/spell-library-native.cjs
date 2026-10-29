/* Library counts from a fresh native party, then live memorisation and switching. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18987';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.SPELL_LIBRARY_PROOF_DIR || '/tmp/dcss-spell-library-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(25000);
    const errors = [], evidence = { layouts: [] };
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const label = page.locator('#hud_spell_library .hud-spell-library-counts');
    const expectCounts = async (total, memorisable) => {
        const text = `${total} ${total === 1 ? 'spell' : 'spells'} · ${memorisable} can memorize`;
        await page.waitForFunction(text => document.querySelector('.hud-spell-library-counts')?.textContent === text, text);
        assert.match(await page.locator('#hud_spell_library').getAttribute('aria-label'), new RegExp(text));
    };
    try {
        await page.goto(url);
        await page.locator('#reg_link').click();
        evidence.account = 'SpellQA' + Date.now().toString(36);
        await page.locator('#reg_username').fill(evidence.account);
        await page.locator('#reg_password').fill('spell-library-test');
        await page.locator('#reg_repeat_password').fill('spell-library-test');
        await page.locator('#reg_submit').click();
        await page.locator('#lobby_home [data-lobby-create]').click();
        const slot = index => page.locator(`.party-slot-box[data-slot="${index}"]`);
        await slot(0).locator('.party-slot-species').selectOption('Human');
        await slot(0).locator('.party-slot-job').selectOption('Conjurer');
        await slot(1).locator('[data-mode="companion"]').click();
        await slot(1).locator('.party-slot-species').selectOption('Human');
        await slot(1).locator('.party-slot-job').selectOption('Fire Elementalist');
        for (const index of [2, 3]) await slot(index).locator('[data-mode="closed"]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
        await page.locator('#loader').waitFor({ state: 'hidden' });
        await ready();
        evidence.initial = (await state()).members.map(hero => ({
            slot: hero.slot, job: hero.job, library: hero.spell_library, levels: hero.spell_levels_left
        }));
        assert.deepEqual(evidence.initial.map(hero => hero.library), [
            { total: 8, memorisable: 1 }, { total: 8, memorisable: 1 }
        ]);
        await expectCounts(8, 1);
        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            const geometry = await page.locator('#hud_spell_library').evaluate(button => {
                const panel = document.getElementById('hud_powers').getBoundingClientRect();
                const bounds = button.getBoundingClientRect();
                return { fits: bounds.left >= panel.left && bounds.right <= panel.right + 1,
                    overflow: button.scrollWidth > button.clientWidth + 1 };
            });
            assert(geometry.fits && !geometry.overflow, 'Counts fit the sidebar at ' + width);
            evidence.layouts.push({ width, ...geometry });
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('#hud_powers').screenshot({ path: path.join(output, 'library-counts.png') });
        const before = await state();
        await page.locator('#hud_spell_library').click();
        const foxfire = page.locator('#ui-stack li').filter({ hasText: 'Foxfire' });
        await foxfire.locator('[data-entry-action="primary"]').waitFor();
        assert.equal((await state()).world_aut_clock, before.world_aut_clock, 'Opening the library is free');
        await foxfire.locator('[data-entry-action="primary"]').click();
        await page.waitForFunction(() => document.body.textContent.includes('Memorise Foxfire, consuming'));
        await page.keyboard.press('y');
        await page.waitForFunction(() => window.crawl_party.state.members[0].spells.some(spell => spell.name === 'Foxfire'));
        await ready();
        await expectCounts(7, 0);
        evidence.afterLearning = (await state()).members[0].spell_library;
        await page.locator('#hud_powers').screenshot({ path: path.join(output, 'after-memorizing.png') });
        await page.evaluate(() => require('comm').send_message('switch_player', { slot: 1 }));
        await page.waitForFunction(() => window.crawl_party.state.controlled_slot === 1);
        await ready();
        await expectCounts(8, 1);
        evidence.switched = (await state()).members[1].spell_library;

        // Controlled rendering checks: old engines must not imply an empty library.
        await page.evaluate(() => {
            delete window.crawl_party.state.members[1].spell_library;
            window.jQuery(document).trigger('party_state_rendered');
        });
        await page.waitForFunction(() => document.querySelector('.hud-spell-library-counts').textContent === 'Counts unavailable');
        assert.equal(await label.innerText(), 'Counts unavailable');
        for (const total of [0, 1]) {
            await page.evaluate(total => {
                window.crawl_party.state.members[1].spell_library = { total, memorisable: 0 };
                window.jQuery(document).trigger('party_state_rendered');
            }, total);
            await expectCounts(total, 0);
        }
        assert.deepEqual(errors, []);
        Object.assign(evidence, { success: true, nativeLearning: true, heroSwitch: true,
            missingCounts: true, knownEmpty: true, errors });
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => ''));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
