/* Select both added roster entries through their visible pickers, then launch. */
const fs = require('node:fs');
const path = require('node:path');
const { assert, chromium, client, send, state, ready } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18996';
const origin = new URL(url).origin;
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname)
    || (origin === 'https://dcss.iancaltabiano.com'
        && process.env.WEBTILES_PUBLIC_QA_ORIGIN === origin));
const output = process.env.ROSTER_PROOF_DIR || '/tmp/dcss-roster-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : { headless: true, channel: 'chrome' });
    const errors = [];
    let page;
    try {
        ({ page } = await client(browser, url, 'R', errors));
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (const [kind, value] of [['species', 'Tortle'], ['job', 'Blood Liturgist']]) {
            await page.locator(`#party_slot_${kind}_0_picker`).click();
            await page.locator('.choice-picker-search').fill(value.toLowerCase());
            await page.locator('.choice-picker').getByRole('option', { name: value, exact: true }).click();
            await page.waitForFunction(({ kind, value }) =>
                document.querySelector(`#party_slot_${kind}_0`).value === value, { kind, value });
        }
        const hero = page.locator('.party-slot-box[data-slot="0"]');
        await hero.locator('.party-slot-weapon').selectOption('hand axe');
        for (const slot of [1, 2, 3])
            await page.locator(`.party-slot-box[data-slot="${slot}"] [data-mode="closed"]`).click();
        await hero.scrollIntoViewIfNeeded();
        await page.mouse.move(15, 15);
        await hero.screenshot({ path: path.join(output, 'tortle-blood-liturgist-selection.png') });
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.[0]?.species === 'Tortle',
            null, { timeout: 120000 });
        await ready(page);
        const initial = (await state(page)).members[0];
        assert.equal(initial.job, 'Blood Liturgist');
        assert.equal(initial.god, 'Vorr');
        assert.equal(initial.piety_rank, 1);
        assert(initial.abilities.some(ability => ability.name === 'Rupture'));
        assert(initial.ac >= 6, 'The Tortle must receive its native shell');
        assert(initial.spells.some(spell => spell.name === 'Kindled Veins'));
        assert(initial.inventory.some(item => item.equipped && item.name.includes('hand axe')));
        assert(initial.inventory.some(item => item.equipped && item.name.includes('hand axe') && /\(vamp\)|vampiric|vampirism/.test(item.name)));
        await page.screenshot({ path: path.join(output, 'tortle-blood-liturgist-dungeon.png') });
        await send(page, 'record_save', { exit: true });
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        assert.deepEqual(errors, []);
        const evidence = { passed: true, species: initial.species, job: initial.job, god: initial.god,
            piety_rank: initial.piety_rank,
            ac: initial.ac, spells: initial.spells.map(spell => spell.name), errors };
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
        throw error;
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
