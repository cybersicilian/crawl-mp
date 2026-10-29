const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real identified randart, immediate public URL and turn-free sharing surfaces. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:19136';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Disposable local wizard game only');
const out = process.env.SHARE_PROOF_DIR || '/tmp/dcss-randart-share-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
        permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [], evidence = { url, account: 'ShareQA' + Date.now().toString(36).slice(-6) };
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const key = value => page.evaluate(value => require('comm').send_message('key', { keycode: value.charCodeAt(0) }), value);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready() && getComputedStyle(document.getElementById('loader')).display === 'none';
    });
    const prompt = async value => {
        const input = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await input.fill(value); await input.press('Enter');
    };
    const openEquipment = () => page.evaluate(() => window.crawl_party.open_inspector(0, 'equipment'));
    const closeEquipment = () => page.locator('#party_inspector_close_btn').click();
    const describe = item => page.evaluate(item => require('comm').send_message('inv_item_describe', {
        slot: item.slot, expected_slot: 0, expected_name: item.name }), item);
    const copy = async selector => {
        await page.locator(selector + ' .share-link-copy').click();
        await page.locator(selector + ' .share-link-status').filter({ hasText: 'Link copied. Ready to paste.' }).waitFor();
        const contrast = await page.locator(selector + ' .share-link-copy').evaluate(node => {
            const style = getComputedStyle(node);
            const light = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
                value /= 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
            const foreground = light(style.color), background = light(style.backgroundColor);
            return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        });
        assert(contrast >= 4.5, 'Copy button text stays readable on hover');
        return page.evaluate(() => navigator.clipboard.readText());
    };
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        const leader = page.locator('.party-slot-box[data-slot="0"]');
        await leader.locator('.party-slot-species').selectOption('Human');
        await leader.locator('.party-slot-job').selectOption('Fighter');
        for (let slot = 1; slot < 4; slot++) await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1, null, { timeout: 120000 });
        await ready();
        const initial = await state();
        await describe(initial.members[0].inventory[0]);
        await page.locator('#ui-stack .describe-item').waitFor();
        assert.equal(await page.locator('#ui-stack .share-link-copy').count(), 0, 'Ordinary items have no randart URL');
        await key('\u001b'); await ready();
        await key('&'); await prompt('wiz'); await key('%'); await prompt('randart war axe'); await ready();
        await key('g'); await ready();
        await page.waitForFunction(count => window.crawl_party.state.members[0].inventory.length > count, initial.members[0].inventory.length);
        const unknown = (await state()).members[0].inventory.find(item => !initial.members[0].inventory.some(old => old.slot === item.slot));
        assert(unknown);
        if (!unknown.record_id) {
            await describe(unknown);
            await page.locator('#ui-stack .describe-item').waitFor();
            assert.equal(await page.locator('#ui-stack .share-link-copy').count(), 0, 'Unidentified randarts do not expose a record');
            await key('\u001b'); await ready();
        }
        await key('&'); await key('i');
        await page.waitForFunction(() => document.querySelector('#messages')?.textContent.includes('rush of knowledge'));
        await key('\u0012');
        await page.waitForFunction(() => window.crawl_party.state.members[0].inventory.some(item => item.record_id));
        await ready();
        const identified = await state(), hero = identified.members[0];
        const randart = hero.inventory.find(item => item.record_id);
        const expected = new URL('/randarts/' + randart.record_id, url).href;
        evidence.item = randart; evidence.expectedURL = expected;
        await openEquipment();
        const row = '.folio-inventory-row[data-item-slot="' + randart.slot + '"]';
        assert.equal(await copy(row), expected);
        assert(await page.locator('#party_inspector_modal').evaluate(node => node.open), 'Copy preserves the equipment panel');
        assert.equal((await state()).members[0].elapsed_aut, hero.elapsed_aut);
        await page.locator(row).screenshot({ path: path.join(out, 'equipment-copy-link.png') });
        // An unauthenticated visitor opens the copied URL while its finder is still playing.
        const visitor = await browser.newContext();
        const recordPage = await visitor.newPage();
        const response = await recordPage.goto(expected);
        assert.equal(response.status(), 200);
        assert((await recordPage.locator('h1').innerText()).length);
        assert((await recordPage.locator('.library-description').innerText()).trim());
        await recordPage.screenshot({ path: path.join(out, 'public-randart.png') });
        await visitor.close();
        await page.locator(row + ' .folio-item-open').click();
        await page.locator('#ui-stack .describe-item').waitFor();
        assert.equal(await copy('#ui-stack .describe-item'), expected);
        assert.equal((await state()).members[0].elapsed_aut, hero.elapsed_aut);
        assert.equal(await page.locator('#ui-stack .describe-item').count(), 1, 'Copy leaves item details open');
        await page.locator('#ui-stack .describe-item').screenshot({ path: path.join(out, 'item-details-copy-link.png') });
        await key('\u001b');
        await page.locator('#party_inspector_modal').waitFor({ state: 'visible' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator(row).scrollIntoViewIfNeeded();
        assert(await page.locator('#party_insp_body').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        assert.equal(await copy(row), expected);
        await page.locator(row).screenshot({ path: path.join(out, 'mobile-copy-link.png') });
        await closeEquipment();
        const record = await context.request.get(new URL('/api/library/randarts/' + randart.record_id, url).href);
        assert.equal(record.status(), 200);
        evidence.record = await record.json();
        assert.equal(evidence.record.id, randart.record_id);
        assert.deepEqual(errors, []);
        evidence.passed = true; evidence.turnFree = true; evidence.errors = errors;
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ passed: true, publicBeforeSave: true, equipment: true, itemDetails: true, mobile: true, turnFree: true, out }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error.stack || error), errors,
            state: await state().catch(() => null), messages: await page.locator('#messages').textContent().catch(() => '') }, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
