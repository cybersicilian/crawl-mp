const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Fresh native clocks plus controlled presentation cases, in a disposable local game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8888';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.MONSTER_TIMING_PROOF_DIR || '/tmp/dcss-monster-timing-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
        deviceScaleFactor: Number(process.env.HUD_DPR || 1), hasTouch: process.env.HUD_TOUCH === '1' });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const tracker = page.locator('#party_progress_monsters');
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const shot = async name => {
        await page.mouse.move(2, 2);
        await page.locator('#party_progress').screenshot({ path: path.join(output, name + '.png') });
    };
    const render = data => page.evaluate(data => window.renderMonsterFixture(data), data);
    try {
        await page.goto(url);
        await signInTestAccount(page, 'MonsterQA' + Date.now().toString().slice(-8), 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator(".party-slot-box[data-slot='1'] .party-mode-btn[data-mode='companion']").click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
        await ready(); await tracker.waitFor({ state: 'attached' });
        evidence.initial = await state();
        assert.equal(evidence.initial.multiplayer, false);
        assert.equal(await tracker.isVisible(), false);
        assert.equal(await page.locator('#party_yield_btn').isVisible(), false);
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('.');
        await page.waitForFunction(before => window.crawl_party.state.members.some(member =>
            member.aut_clock > before.members.find(previous => previous.slot === member.slot).aut_clock), evidence.initial);
        await ready();
        if ((await state()).world_aut_clock === evidence.initial.world_aut_clock) {
            await page.locator('.party-card:not(.is-controlled-card) .party-control-btn').click();
            await page.waitForFunction(() => window.crawl_party.state.controlled_slot === 1);
            await ready();
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press('.');
        }
        await page.waitForFunction(clock => window.crawl_party.state.world_aut_clock > clock, evidence.initial.world_aut_clock);
        await ready();
        evidence.afterNativeWait = await state();
        assert.equal(await tracker.isVisible(), false, 'Native solo companion actions keep monster timing hidden');
        await shot('native-monster-timing');
        await page.screenshot({ path: path.join(output, 'native-hud.png') });
        await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/party'));
            window.renderMonsterFixture = data => require(name).state(data);
            window.monsterPackets = [];
            const comm = require('comm'); window.originalMonsterSend = comm.send_message;
            comm.send_message = (msg, fields) => window.monsterPackets.push({ msg, ...fields });
        });
        const fixture = structuredClone(evidence.afterNativeWait);
        fixture.multiplayer = true;
        fixture.world_aut_clock = 100;
        fixture.members.forEach((member, i) => Object.assign(member, {
            aut_clock: 100 + i * 10, alive: true, ghost_haunting: false, on_same_level: true
        }));
        await render(fixture);
        assert.match(await tracker.textContent(), /C:10 D:0 aut/);
        assert.equal(await tracker.locator('.tt-icon').count(), 1);
        assert.equal(await tracker.locator('.initiative-bank i').evaluate(node => node.style.width), '50%');
        await tracker.focus();
        await page.waitForFunction(() => document.querySelector('#dcss_rich_tooltip')?.textContent.includes('10 aut credit'));
        await page.evaluate(() => { window.originalMonsterTracker = document.activeElement; });
        const changed = structuredClone(fixture); changed.members[1].aut_clock = 140;
        await render(changed);
        assert(await page.evaluate(() => document.activeElement === window.originalMonsterTracker));
        assert.match(await page.locator('#dcss_rich_tooltip').textContent(), /40 aut credit/);
        assert.equal(await tracker.locator('.initiative-bank i').evaluate(node => node.style.width), '100%');
        await tracker.press('Enter'); await tracker.press('ArrowRight'); await tracker.click();
        assert.deepEqual(await page.evaluate(() => window.monsterPackets), [], 'Reading the world timing sends no native commands');
        await page.evaluate(() => document.activeElement.blur());
        for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
            await page.setViewportSize({ width, height });
            const geometry = await page.locator('#party_progress').evaluate(root => {
                const r = root.getBoundingClientRect(), parent = root.parentElement.getBoundingClientRect();
                return { x: r.x, y: r.y, right: r.right, bottom: r.bottom,
                    parentRight: parent.right, overflow: root.scrollWidth > root.clientWidth,
                    documentOverflow: document.documentElement.scrollWidth > innerWidth };
            });
            assert(geometry.x >= 0 && geometry.right <= geometry.parentRight);
            assert.equal(geometry.overflow, false); assert.equal(geometry.documentOverflow, false);
            evidence[width + 'x' + height] = geometry;
            await shot('controlled-credit-' + width);
        }
        const debt = structuredClone(fixture); debt.world_aut_clock = 125;
        await render(debt);
        assert.equal(await tracker.getAttribute('data-timing-state'), 'debt');
        assert.match(await tracker.textContent(), /C:0 D:15 aut/);
        assert.equal(await tracker.locator('.initiative-debt i').evaluate(node => node.style.width), '50%',
            'The 15-aut debt shares the heroes\' expanded 30-aut scale');
        await shot('controlled-debt');
        const unknown = structuredClone(fixture); delete unknown.world_aut_clock;
        await render(unknown);
        assert.equal(await tracker.getAttribute('data-timing-state'), 'unknown');
        assert.match(await tracker.textContent(), /C:\? D:\? aut/);
        await shot('controlled-unavailable');
        await render(evidence.afterNativeWait);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ passed: true, nativeClockAdvance: true, controlledCreditDebtUnknown: true,
            liveTooltipAndFocus: true, noInspectionCommands: true, viewports: 3, output }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') }); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
