const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Controlled-card density and preserved native controls in a disposable local game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8888';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.PLAYER_CARD_PROOF_DIR || '/tmp/dcss-player-card-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
        deviceScaleFactor: Number(process.env.HUD_DPR || 1), hasTouch: process.env.HUD_TOUCH === '1' });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const card = () => page.locator('.party-card.is-controlled-card');
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    async function capture(name) {
        await page.mouse.move(2, 2);
        await card().screenshot({ path: path.join(output, name + '.png') });
    }
    async function geometry() {
        return card().evaluate(node => {
            const rect = target => {
                const r = target.getBoundingClientRect();
                return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
            };
            const find = selector => rect(node.querySelector(selector));
            return { card: rect(node), portrait: find('.party-portrait'), stats: find('.party-self-details'),
                bars: find('.party-bars'), weapon: find('.party-member-equipment'), toolbar: find('.party-card-toolbar'),
                sections: find('.party-card-sections'),
                controls: [...node.querySelectorAll('.personal-stat-reading, .personal-stat-context > *, .party-card-actions button')]
                    .filter(control => control.offsetWidth).map(rect),
                overflow: node.scrollWidth > node.clientWidth,
                documentOverflow: document.documentElement.scrollWidth > innerWidth };
        });
    }
    try {
        await page.goto(url);
        evidence.account = 'CardQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator(".party-slot-box[data-slot='1'] .party-mode-btn[data-mode='companion']").click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2, null, { timeout: 120000 });
        await ready();
        await card().locator('.personal-stat-reading').first().waitFor();
        await page.evaluate(() => { window.originalNativeStats = document.getElementById('stats'); });
        const clock = (await state()).world_aut_clock;
        for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
            await page.setViewportSize({ width, height });
            const layout = await geometry();
            evidence[width + 'x' + height] = layout;
            assert.equal(layout.overflow, false);
            assert.equal(layout.documentOverflow, false);
            assert(layout.stats.x < layout.portrait.right, 'Readings reclaim the portrait column');
            assert(layout.stats.width > layout.bars.width, 'Stats use the full card width');
            assert(layout.stats.y >= layout.portrait.bottom, 'Readings begin below the portrait');
            assert(layout.weapon.width > layout.bars.width, 'Weapon uses both columns');
            assert(layout.toolbar.width > layout.bars.width, 'Actions and XP use both columns');
            assert(layout.controls.every(control => control.x >= layout.card.x && control.right <= layout.card.right), 'Controls fit the card');
            assert.equal(await card().locator('.personal-stat-reading').count(), 6);
            assert.equal(await card().locator('.party-def-badges').isVisible(), false);
            assert.equal(await page.locator('.party-card:not(.is-controlled-card) [data-reading="ac"]').isVisible(), true);
            await capture('player-card-' + width);
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await card().locator('.party-inspect-btn').click();
        await page.locator('#party_inspector_modal').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.locator('#party_inspector_modal').waitFor({ state: 'hidden' });
        await card().locator('.party-camera-btn').click();
        await card().locator('.party-wielded-item').first().press('Enter');
        await page.locator('#party_inspector_modal').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#party_insp_tab_equipment').getAttribute('aria-selected'), 'true');
        await page.locator('#party_inspector_close_btn').click();
        await page.locator('#party_inspector_modal').waitFor({ state: 'hidden' });
        assert.equal((await state()).world_aut_clock, clock, 'Layout and inspection consume no game time');
        await page.locator('.party-card:not(.is-controlled-card) .party-control-btn').click();
        await page.waitForFunction(() => Number(document.querySelector('.is-controlled-card').dataset.partySlot) === 1);
        await ready();
        assert.equal(await card().locator('.personal-stat-reading').count(), 6);
        assert(await page.evaluate(() => document.getElementById('stats') === window.originalNativeStats), 'Native stats survive a hero switch');
        await capture('switched-hero');
        // Controlled presentation stress case; no engine facts are changed.
        await page.evaluate(() => {
            const card = document.querySelector('.is-controlled-card');
            card.querySelector('.party-member-name').textContent = 'AlexandertheShieldBearer';
            card.querySelector('.party-wielded-item').setAttribute('aria-label', '+10 dagger of the Summoning Ancients. Inspect equipment');
            const status = card.querySelector('.party-card-status');
            const source = card.querySelector('.party-passive-strip .party-status-icon');
            if (source) for (let i = 0; i < 9; i++) status.appendChild(source.cloneNode(true));
        });
        await page.setViewportSize({ width: 1024, height: 768 });
        const stressed = await geometry();
        assert.equal(stressed.overflow, false);
        assert(stressed.controls.every(control => control.right <= stressed.card.right));
        evidence.stress = stressed;
        await capture('long-equipment-many-effects');
        assert.deepEqual(errors, []);
        evidence.nativeControls = true; evidence.nativeNodesPreserved = true; evidence.noInspectionTurns = true;
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ passed: true, viewports: 3, nativeControls: true, nativeNodesPreserved: true, output }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') });
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify(await page.evaluate(() => ({
            tabs: [...document.querySelectorAll('.party-insp-tab-btn')].map(tab => ({ id: tab.id, selected: tab.getAttribute('aria-selected') })),
            state: window.crawl_party && window.crawl_party.state
        })), null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
