const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Disposable localhost game: native background, costs, rite status and dismissal. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8937';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.BLOODCRAFT_PROOF_DIR || '/tmp/dcss-bloodcraft-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(25000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const key = value => page.evaluate(value => require('comm').send_message('key',
        { keycode: value.codePointAt(0) }), value);
    const snapshot = () => page.evaluate(() =>
        JSON.parse(JSON.stringify(window.crawl_party.state.members[0])));
    try {
        await page.goto(url);
        evidence.account = 'BloodQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_home [data-lobby-create]').click();
        const card = slot => page.locator(`.party-slot-box[data-slot="${slot}"]`);
        await card(0).locator('.party-slot-species').selectOption('Human');
        await card(0).locator('.party-slot-job').selectOption('Blood Liturgist');
        await card(0).locator('.party-slot-weapon').selectOption('falchion');
        for (const slot of [1, 2, 3])
            await card(slot).locator('[data-mode="closed"]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.[0]?.spells?.length);
        evidence.initial = await snapshot();
        assert.equal(evidence.initial.job, 'Blood Liturgist');
        assert.equal(evidence.initial.god, 'Vorr');
        assert(evidence.initial.abilities.some(ability => ability.name === 'Rupture'));
        assert.deepEqual(evidence.initial.spells.map(spell => spell.name), ['Kindled Veins']);
        const kit = evidence.initial.inventory;
        assert(kit.some(item => item.name.includes('falchion') && /\(vamp\)|vampiric|vampirism/.test(item.name) && item.equipped));
        assert(kit.some(item => item.name === '+0 leather armour' && item.equipped));
        assert.equal(kit.find(item => item.name === 'potion of curing')?.qty, 1);
        assert.equal(kit.find(item => item.name === 'scroll of fog')?.qty, 1);
        const initialSpell = evidence.initial.spells[0];
        assert.equal(initialSpell.level, 1);
        assert.equal(initialSpell.schools, 'Necromancy');
        assert.equal(initialSpell.activation_hp,
            Math.max(2, Math.ceil(evidence.initial.hp_max * 0.12)));

        // A real beginning character retains its normal spell failure chance.
        for (let attempt = 0; attempt < 4; ++attempt) {
            const before = await snapshot();
            if (before.spells[0].active) break;
            assert(before.mp > 0, 'Starting casts exhausted MP before the rite succeeded');
            await key('z'); await key(before.spells[0].letter);
            await page.waitForFunction(mp => {
                const hero = window.crawl_party.state.members[0];
                return hero.spells[0].active || hero.mp !== mp;
            }, before.mp);
        }
        evidence.active = await snapshot();
        assert(evidence.active.spells[0].active);
        assert.equal(evidence.active.hp_max,
            evidence.initial.hp_max - initialSpell.activation_hp);
        assert.equal(evidence.active.spells[0].reserved_hp, initialSpell.activation_hp);
        assert.match(evidence.active.spells[0].desc, /Current power: 1d/);
        const dismiss = evidence.active.abilities.find(ability => ability.name === 'Dismiss Rite');
        assert(dismiss, 'Active rites must expose a direct dismissal action');
        await page.screenshot({ path: path.join(output, 'active-rite.png'), fullPage: true });
        await key('a'); await key(dismiss.hotkey);
        await page.waitForFunction(() => !window.crawl_party.state.members[0].spells[0].active);
        evidence.dismissed = await snapshot();
        assert.equal(evidence.dismissed.hp_max, evidence.initial.hp_max);
        assert(evidence.dismissed.hp <= evidence.active.hp + 1,
            'Dismissal cannot heal; allow at most one point of ordinary regeneration');
        assert(!evidence.dismissed.abilities.some(ability => ability.name === 'Dismiss Rite'));
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log('Blood Liturgist creation, native rite cost, status and dismissal passed');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
