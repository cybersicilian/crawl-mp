const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Fresh localhost expedition verifies native HP payment and mixed-party costs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8937';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.DJINNI_PROOF_DIR || '/tmp/dcss-djinni-native-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const open = (module, ...args) => page.evaluate(({ module, args }) => {
        const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/' + module));
        require(name).open(...args);
    }, { module, args });
    try {
        await page.goto(url);
        const account = 'DjinniQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_home [data-lobby-create]').click();
        const slot = index => page.locator('.party-slot-box[data-slot="' + index + '"]');
        await slot(0).locator('.party-slot-species').selectOption('Djinni');
        await slot(0).locator('.party-slot-job').selectOption('Fire Elementalist');
        await slot(1).locator('[data-mode="companion"]').click();
        await slot(1).locator('.party-slot-species').selectOption('Deep Elf');
        await slot(1).locator('.party-slot-job').selectOption('Conjurer');
        for (const index of [2, 3]) await slot(index).locator('[data-mode="closed"]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
            return name && require(name).ready();
        });
        const before = await state(), hero = before.members[0], elf = before.members[1];
        assert.equal(hero.mp_max, 0); assert.equal(hero.spell_resource, 'hp');
        assert.equal(elf.spell_resource, 'mp');
        assert(hero.spells.every(spell => spell.casting_cost.resource === 'hp'));
        assert(elf.spells.every(spell => spell.casting_cost.resource === 'mp'));
        const foxfire = hero.spells.find(spell => spell.name === 'Foxfire');
        assert(foxfire && foxfire.casting_cost.payable);
        await open('party-inspector', 0, 'abilities');
        const table = page.locator('#party_spells_heading + table');
        assert.match(await table.innerText(), /Lv 1 \/ 1 HP/);
        const cast = table.getByRole('button', { name: 'Cast Foxfire', exact: true });
        assert(await cast.isEnabled());
        await page.screenshot({ path: path.join(output, 'djinni-native-folio.png') });
        await cast.click();
        await page.waitForFunction(hp => window.crawl_party.state.members[0].hp < hp, hero.hp);
        const after = await state();
        assert.equal(after.members[0].hp, hero.hp - foxfire.casting_cost.amount);
        assert.equal(after.members[0].mp, 0);
        assert.equal(after.members[1].hp, elf.hp);
        assert.equal(after.members[1].mp, elf.mp);
        await open('power-picker', 'spell');
        assert.match(await page.locator('#power_picker_mp').innerText(), /HP$/);
        assert.equal(await page.locator('#power_picker_resource_filter').innerText(), 'Within HP');
        await page.screenshot({ path: path.join(output, 'djinni-native-picker.png') });
        await page.keyboard.press('Escape');
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ account, before, after, errors }, null, 2));
        console.log(JSON.stringify({ passed: true, nativeHpPayment: true, mixedPartyResources: true, output }));
    } catch (error) {
        console.error(error, errors);
        await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => ''));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
