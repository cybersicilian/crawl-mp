const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Fresh-account native integration check. Requires an updated disposable local WebTiles server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const out = process.env.POWER_PROOF_DIR || '/tmp/dcss-power-hover-proof';
const url = process.env.WEBTILES_URL || 'http://localhost:8888';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'Use a local QA server');
fs.mkdirSync(out, { recursive: true });
(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    try {
        await page.goto(url);
        const account = 'PowerQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        const slot = index => page.locator(`.party-slot-box[data-slot="${index}"]`);
        await slot(0).locator('.party-slot-species').selectOption('Human');
        await slot(0).locator('.party-slot-job').selectOption('Alchemist');
        await slot(1).locator('[data-mode="companion"]').click();
        await slot(1).locator('.party-slot-species').selectOption('Minotaur');
        await slot(1).locator('.party-slot-job').selectOption('Berserker');
        for (const index of [2, 3]) await slot(index).locator('[data-mode="closed"]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 2);
        await page.locator('#dock_codex_btn').waitFor({state: 'visible'});
        const members = await page.evaluate(() => window.crawl_party.state.members);
        fs.writeFileSync(path.join(out, 'native-snapshot.json'), JSON.stringify(members, null, 2));
        assert.equal(members[0].abilities.length, 0, 'The Alchemist must not inherit companion abilities');
        const spells = members[0].spells;
        assert(spells.find(spell => spell.name === 'Poisonous Vapours').desc.includes('Transmutes'));
        assert(spells.find(spell => spell.name === 'Fulsome Distillation').desc.includes('Extracts alchemical humours'));
        const ability = members[1].abilities.find(ability => ability.name === 'Berserk');
        assert(ability.desc.includes('Sends the user into a berserk rage'));
        assert(!/<\/?(light|dark|white|red|yellow)/.test(ability.desc));
        console.log('Native spell and ability description snapshots passed');

        await page.evaluate(() => window.crawl_party.open_inspector(0, 'abilities'));
        const rows = page.locator('#party_insp_panel_abilities .party-power-row');
        const tip = page.locator('#dcss_rich_tooltip');
        const before = await page.locator('#stats_time').textContent();
        await rows.filter({ hasText: 'Poisonous Vapours' }).locator('td').nth(1).hover();
        await tip.waitFor({ state: 'visible' });
        assert.match(await tip.innerText(), /Transmutes a small amount/);
        await page.screenshot({ path: path.join(out, 'native-spell-hover.png') });
        await rows.filter({ hasText: 'Fulsome Distillation' }).focus();
        assert.match(await tip.innerText(), /Extracts alchemical humours/);
        await page.keyboard.press('2');
        await rows.filter({ hasText: 'Berserk' }).hover();
        await tip.waitFor({ state: 'visible' });
        assert.match(await tip.innerText(), /Sends the user into a berserk rage/);
        await page.screenshot({ path: path.join(out, 'native-ability-hover.png') });
        assert.equal(await page.locator('#stats_time').textContent(), before, 'Reading cards consumes no turns');
        await page.keyboard.press('Escape');
        assert(await page.locator('#party_inspector_modal').evaluate(dialog => dialog.open));
        await page.keyboard.press('Escape');
        await page.locator('#stats_hpline').hover();
        await tip.waitFor({ state: 'visible' });
        const geometry = await page.evaluate(() => {
            const r = document.getElementById('dcss_rich_tooltip').getBoundingClientRect();
            const overlap = b => Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left))
                * Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
            return { inViewport: r.left >= 8 && r.top >= 8 && r.right <= innerWidth - 8 && r.bottom <= innerHeight - 8,
                protectedOverlap: ['right_column', 'party_turn_banner', 'dcss_quick_dock', 'message_pane']
                    .filter(id => overlap(document.getElementById(id).getBoundingClientRect()) > 0) };
        });
        assert(geometry.inViewport);
        assert.deepEqual(geometry.protectedOverlap, []);
        await page.screenshot({ path: path.join(out, 'native-hud-help.png') });
        await page.keyboard.press('Escape');
        const point = await page.evaluate(() => {
            const key = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
            const renderer = require(key), rect = renderer.element.getBoundingClientRect();
            const pos = window.crawl_party.state.members[0].pos;
            return { x: rect.x + (pos.x - renderer.view.x + 0.5) * renderer.cell_width,
                y: rect.y + (pos.y - renderer.view.y + 0.5) * renderer.cell_height };
        });
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(150);
        assert.equal(await page.locator('#tooltip').isVisible(), false, 'Map help shares the hover sleep');
        await page.locator('#tooltip').waitFor({ state: 'visible', timeout: 2000 });
        assert.equal(await tip.isVisible(), false, 'Map help replaces the HUD root');
        await page.screenshot({ path: path.join(out, 'native-map-hover.png') });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#tooltip').isVisible(), false);
        await page.waitForTimeout(450);
        assert.equal(await page.locator('#tooltip').isVisible(), false, 'A pending map event cannot reopen dismissed help');
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(out, 'native-evidence.json'), JSON.stringify({ account,
            spells: spells.map(({ name, desc }) => ({ name, desc })), ability,
            noTurnsConsumed: true, errors }, null, 2));
        console.log(JSON.stringify({ passed: true, nativeSnapshots: true, liveHoverCards: true, noTurnsConsumed: true }));
    } catch (error) {
        console.error(error);
        await page.screenshot({ path: path.join(out, 'native-failure.png') }).catch(() => {});
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
