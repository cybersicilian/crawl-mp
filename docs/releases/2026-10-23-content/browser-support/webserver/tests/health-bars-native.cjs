const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Fresh disposable two-hero game; native wizard durations exercise real snapshots. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8907';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Use an isolated local QA server');
const output = process.env.HEALTH_NATIVE_PROOF_DIR || '/tmp/dcss-health-native-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const key = value => page.evaluate(value => require('comm').send_message('key', { keycode: value.codePointAt(0) }), value);
    async function text(value) {
        const input = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await input.fill(value); await input.press('Enter');
    }
    const snapshot = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const bar = slot => page.locator('#party_hp_' + slot);
    async function duration(name, amount, alreadyInWizard = false) {
        if (!alreadyInWizard) await key('&');
        await key('\u0004');
        const menu = page.locator('#ui-stack .menu:visible');
        // A hero with an existing duration gets an active-duration menu first.
        await page.waitForFunction(() => document.querySelector('#messages .game_message input, #input_dialog input')
            || document.getElementById('ui-stack').textContent.includes('other durations'));
        if (await menu.count() || await page.locator('#ui-stack').innerText().then(value => value.includes('other durations')))
            await key('*');
        await text(name); await text(String(amount));
        await key('\u0012');
    }
    try {
        await page.goto(url);
        const account = 'HealthQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_home [data-lobby-create]').click();
        const slot = index => page.locator('.party-slot-box[data-slot="' + index + '"]');
        await slot(0).locator('.party-slot-species').selectOption('Human');
        await slot(0).locator('.party-slot-job').selectOption('Fighter');
        await slot(1).locator('[data-mode="companion"]').click();
        await slot(1).locator('.party-slot-species').selectOption('Human');
        await slot(1).locator('.party-slot-job').selectOption('Fighter');
        for (const index of [2, 3]) await slot(index).locator('[data-mode="closed"]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
        const initial = await snapshot();
        for (const hero of initial.members) {
            assert.equal(hero.poison_survival, hero.hp);
            assert(Number.isFinite(hero.real_hp_max));
        }
        await key('&'); await text('wiz');
        await duration('poisoning', 8000, true);
        await page.waitForFunction(() => window.crawl_party.state.members[0].poison_survival < window.crawl_party.state.members[0].hp);
        const poisoned = await snapshot(), hero = poisoned.members[0];
        assert.match(await bar(0).getAttribute('data-health-effects'), /poison/);
        assert.equal(await bar(0).locator('.party-bar-label').textContent(), 'HP ' + hero.hp + '/' + hero.hp_max + ' → ' + hero.poison_survival);
        assert.equal(await bar(1).locator('.party-hp-poison').count(), 0, 'Poison must stay with its native hero');
        assert(!/poison/.test(await bar(1).getAttribute('data-health-effects')), 'Unaffected hero must not inherit poison status');
        assert.equal(poisoned.members[1].poison_survival, poisoned.members[1].hp);
        await page.screenshot({ path: path.join(output, 'native-poison.png'), fullPage: true });
        await duration('liquid fire', 30);
        await page.waitForFunction(() => document.querySelector('#party_hp_0').dataset.healthEffects.includes('burning'));
        assert.match(await bar(0).getAttribute('data-health-effects'), /poison/);
        assert(!/poison|burning/.test(await bar(1).getAttribute('data-health-effects')), 'Unaffected hero must not inherit fire or poison');
        await page.screenshot({ path: path.join(output, 'native-poison-and-fire.png'), fullPage: true });
        // Native healing clears poison and liquid fire without changing the other hero.
        await key('&'); await key('H'); await key('\u0012');
        await page.waitForFunction(() => !/poison|burning/.test(document.querySelector('#party_hp_0').dataset.healthEffects));
        assert(!/poison|burning/.test(await bar(0).getAttribute('data-health-effects')));
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ account, initial: initial.members,
            poisoned: poisoned.members, cleared: (await snapshot()).members, errors }, null, 2));
        console.log(JSON.stringify({ passed: true, nativePoison: true, nativeFire: true, nativeCure: true, heroIsolation: true, output }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
