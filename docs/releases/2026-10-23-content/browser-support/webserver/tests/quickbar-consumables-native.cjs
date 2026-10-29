const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Assign and consume native potions/scrolls in disposable localhost expeditions. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8933';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.QUICKBAR_PROOF_DIR || '/tmp/dcss-consumable-hotbar-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const evidence = [];
    try {
        for (const [job, kind] of [['Fighter', 'Potion'], ['Hunter', 'Scroll']]) {
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            page.setDefaultTimeout(15000);
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const hero = () => page.evaluate(() => structuredClone(window.crawl_party.state.members[0]));
            const ready = () => page.waitForFunction(() => {
                const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
                const loader = document.getElementById('loader');
                return name && require(name).ready() && loader && getComputedStyle(loader).display === 'none';
            });
            try {
                await page.goto(url);
                await signInTestAccount(page, 'Pin' + job + Date.now().toString().slice(-8), 'crawl');
                await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
                await page.locator('#lobby_home [data-lobby-create]').click();
                const leader = page.locator('.party-slot-box[data-slot="0"]');
                await leader.locator('.party-slot-species').selectOption('Human');
                await leader.locator('.party-slot-job').selectOption(job);
                for (let slot = 1; slot < 4; slot++)
                    await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
                await page.locator('#btn_launch_party_room').click();
                await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1,
                    null, { timeout: 120000 });
                await ready();
                const before = await hero();
                const item = before.inventory.find(entry => entry.kind_name.toLowerCase().includes(kind.toLowerCase()));
                assert(item, job + ' starts with a native ' + kind);
                const clear = async () => {
                    await page.locator('#quickbar_slot_0').click({ button: 'right' });
                    await page.locator('.game-context-menu').getByRole('menuitem', { name: 'Clear quick slot', exact: true }).click();
                    assert.equal(await page.locator('.game-context-menu').count(), 0);
                };
                const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem('dcss.quickbar.v1.' + id)), before.player_id);
                const assigned = async () => { const value = (await stored())?.[0];
                    return value && { kind: value.kind, id: value.id }; };

                assert(item.slot >= 52, 'Native consumables live beyond the gear inventory');
                // The + picker, palette shortcuts and drag must all accept native IDs.
                await page.locator('#quickbar_slot_0').click();
                await page.locator('#quickbar_more_content').screenshot({ path: path.join(output, kind + '-picker.png') });
                await page.locator('#quickbar_entry_item_' + item.slot).click();
                assert.deepEqual(await assigned(), { kind: 'item', id: item.slot }, 'The + picker assigns a consumable');
                assert.equal((await stored())[0].last_item.name, item.name, 'Assignment saves the last item appearance');
                assert.equal((await hero()).elapsed_aut, before.elapsed_aut);
                await clear();
                await page.locator('#hud_item_0_' + item.slot).dragTo(page.locator('#quickbar_slot_0'));
                assert.deepEqual(await assigned(), { kind: 'item', id: item.slot }, 'Dragging assigns a consumable');
                await clear();
                await page.locator('#quickbar_more > summary').click();
                await page.locator('[data-quick-category="item"]').click();
                await page.locator('#quickbar_entry_item_' + item.slot).click({ modifiers: ['Shift'] });
                assert.deepEqual(await assigned(), { kind: 'item', id: item.slot }, 'Palette pinning assigns a consumable');
                await page.locator('#quickbar_search').press('Escape');
                assert.equal((await hero()).elapsed_aut, before.elapsed_aut, 'Assigning spends no native turn');
                assert.equal((await hero()).inventory.find(entry => entry.slot === item.slot).qty, item.qty);
                await page.reload(); await ready();
                assert.deepEqual(await assigned(), { kind: 'item', id: item.slot });
                await page.locator('#quickbar_slot_0').waitFor();
                const carriedArt = await page.locator('#quickbar_slot_0 canvas').evaluate(canvas => canvas.toDataURL());
                await page.locator('#quickbar_slot_0').click();
                await page.waitForFunction(({ slot, quantity }) => {
                    const item = window.crawl_party.state.members[0].inventory.find(entry => entry.slot === slot);
                    return !item || item.qty === quantity - 1;
                }, { slot: item.slot, quantity: item.qty });
                await ready();
                const after = await hero();
                assert(after.elapsed_aut > before.elapsed_aut, 'Using the quick slot spends native time');
                if (item.qty > 2) assert.equal(await page.locator('#quickbar_slot_0 .quickbar-item-quantity').innerText(), String(item.qty - 1));
                if (item.qty === 1) {
                    await page.waitForFunction(() => document.getElementById('quickbar_slot_0')?.getAttribute('aria-disabled') === 'true');
                    assert.match(await page.locator('#quickbar_slot_0').getAttribute('aria-label'), /0 remaining/);
                    assert.equal(await page.locator('#quickbar_slot_0').getAttribute('data-tip-title'), item.name);
                    assert.equal(await page.locator('#quickbar_slot_0 .quickbar-item-quantity').innerText(), '0');
                    assert.equal(await page.locator('#quickbar_slot_0 canvas').evaluate(canvas => canvas.toDataURL()), carriedArt);
                    await page.reload(); await ready();
                    assert.equal(await page.locator('#quickbar_slot_0').getAttribute('data-tip-title'), item.name);
                    assert.equal(await page.locator('#quickbar_slot_0 canvas').evaluate(canvas => canvas.toDataURL()), carriedArt,
                        'Exact native art survives reload after the last consumable');
                    assert.equal(await page.locator('#quickbar_slot_0 .quickbar-item-quantity').innerText(), '0');
                    const clock = after.elapsed_aut;
                    await page.locator('#quickbar_slot_0').press('1');
                    assert.equal((await hero()).elapsed_aut, clock, 'An exhausted consumable cannot trigger another native action');
                }
                await page.locator('#dcss_quick_dock').screenshot({ path: path.join(output, kind + '-used.png') });
                assert.deepEqual(errors, []);
                evidence.push({ kind, item: item.name, inventorySlot: item.slot, drag: true, picker: true,
                    palettePin: true, assignmentTakesNoTurn: true, reload: true, nativeConsumption: true,
                    depletedAppearance: item.qty === 1, depletedReload: item.qty === 1,
                    elapsedBefore: before.elapsed_aut, elapsedAfter: after.elapsed_aut });
            } catch (error) {
                await page.screenshot({ path: path.join(output, kind + '-failure.png') }).catch(() => {});
                fs.writeFileSync(path.join(output, kind + '-failure.json'), JSON.stringify({
                    error: String(error), hero: await hero().catch(() => null),
                    body: await page.locator('body').innerText().catch(() => '') }, null, 2));
                throw error;
            } finally { await page.close(); }
        }
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ passed: true, evidence, output }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
