const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real pickup/drop quantities in a disposable localhost expedition. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8899';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.PICKUP_PROOF_DIR || '/tmp/dcss-pickup-enter-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(15000);
    const errors = [], evidence = { account: 'PickupQA' + Date.now().toString().slice(-8), cases: [] };
    page.on('pageerror', error => errors.push(error.message));
    const raw = key => page.evaluate(key => require('comm').send_message('key', { keycode: key.charCodeAt(0) }), key);
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const inventory = async () => (await state()).members[0].inventory;
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const row = name => page.locator('#ui-stack li.selectable').filter({ hasText: name }).first();
    const selected = async name => {
        await page.waitForFunction(name => [...document.querySelectorAll('#ui-stack li.selectable')]
            .some(element => element.textContent.includes(name)
                && window.jQuery(element).data('item').selected_qty > 0
                && element.getAttribute('aria-pressed') === 'true'), name);
        assert.equal(await row(name).locator('.workflow-selection-mark').innerText(), '✓');
        assert(await row(name).locator('.workflow-selection-state').isVisible());
        return true;
    };
    async function waitQuantity(name, qty) {
        await page.waitForFunction(({ name, qty }) => {
            const items = window.crawl_party.state.members[0].inventory;
            return (items.find(item => item.name.includes(name))?.qty || 0) === qty;
        }, { name, qty });
    }
    async function confirm(pointer = false) {
        if (pointer) await page.locator('.workflow-selection-tools button').click();
        else await page.keyboard.press('Enter');
        await page.locator('#ui-stack > *').waitFor({ state: 'detached' });
        await ready();
    }
    let stacks;
    async function dropStacks() {
        const items = await inventory();
        await raw('d');
        await page.locator('.menu_inventory').waitFor();
        for (const stack of stacks) {
            const item = items.find(item => item.name.includes(stack.name));
            assert(item);
            await raw(item.letter);
            assert(await selected(stack.name));
        }
        await page.evaluate(() => document.activeElement.blur());
        await confirm();
        for (const stack of stacks) await waitQuantity(stack.name, 0);
    }
    async function pickup() {
        await raw('g');
        await page.locator('.menu_pickup').waitFor();
    }
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('.party-slot-box[data-slot="0"] .party-slot-job').selectOption('Brigand');
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='closed']`).click();
        await page.waitForFunction(() => /1 hero\b/.test(document.getElementById('btn_launch_party_room').textContent));
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1, null, { timeout: 120000 });
        await ready();
        const initial = await inventory();
        evidence.initialInventory = initial;
        stacks = ['poison', 'curare'].map(name =>
            ({ name, qty: initial.find(item => item.name.includes(name))?.qty }));
        assert(stacks.every(stack => stack.qty), JSON.stringify(initial));
        evidence.stacks = stacks;
        await dropStacks();
        await pickup();

        // A click selects a stack; Enter must accept it when its row has focus.
        assert.equal(await row(stacks[0].name).getAttribute('aria-pressed'), 'false');
        await row(stacks[0].name).click();
        assert(await selected(stacks[0].name));
        assert(await row(stacks[0].name).evaluate(element => element === document.activeElement));
        // Selection survives focus moving to a different row and clears on a second click.
        await row(stacks[1].name).focus();
        assert.equal(await row(stacks[0].name).getAttribute('aria-pressed'), 'true');
        await row(stacks[0].name).click();
        await page.waitForFunction(name => [...document.querySelectorAll('#ui-stack li.selectable')]
            .some(element => element.textContent.includes(name)
                && element.getAttribute('aria-pressed') === 'false'), stacks[0].name);
        assert.equal(await row(stacks[0].name).locator('.workflow-selection-state').count(), 0);
        await row(stacks[0].name).click();
        assert(await selected(stacks[0].name));
        assert.equal(await page.locator('.workflow-selection-summary').innerText(),
            stacks[0].qty + ' items in 1 stack selected');
        await page.screenshot({ path: path.join(out, 'selected-pickup.png') });
        await confirm(true);
        await waitQuantity(stacks[0].name, stacks[0].qty);
        await waitQuantity(stacks[1].name, 0);
        evidence.cases.push('visible pointer confirmation picks only the selected stack');
        await raw('g'); await ready(); // One remaining stack uses native direct pickup.
        await waitQuantity(stacks[1].name, stacks[1].qty);

        await dropStacks(); await pickup();
        const clock = (await state()).world_aut_clock;
        await row(stacks[0].name).focus();
        await page.keyboard.press('Space');
        assert(await selected(stacks[0].name));
        await page.keyboard.press('Escape'); await ready();
        for (const stack of stacks) await waitQuantity(stack.name, 0);
        assert.equal((await state()).world_aut_clock, clock, 'Cancellation spends no turn');
        evidence.cases.push('Space selects; Escape cancels without picking up or spending a turn');

        await pickup();
        await row(stacks[0].name).focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        assert.equal(await page.locator('.menu_pickup').count(), 1, 'Empty Enter keeps native no-selection behavior');
        assert.equal((await state()).world_aut_clock, clock);
        for (const stack of stacks) {
            await row(stack.name).focus(); await page.keyboard.press('Space');
            assert(await selected(stack.name));
        }
        await row(stacks[1].name).focus();
        await confirm();
        for (const stack of stacks) await waitQuantity(stack.name, stack.qty);
        evidence.cases.push('focused Space and Enter preserve all selected stacks');

        await dropStacks(); await pickup();
        await page.evaluate(() => document.activeElement.blur());
        const firstLetter = await row(stacks[0].name).getAttribute('data-menu-key');
        const secondLetter = await row(stacks[1].name).getAttribute('data-menu-key');
        await page.keyboard.type('2' + firstLetter + secondLetter);
        assert(await selected(stacks[0].name));
        assert(await selected(stacks[1].name));
        assert.equal(await row(stacks[0].name).locator('.workflow-selection-state').innerText(),
            '2 of ' + stacks[0].qty + ' selected');
        await page.screenshot({ path: path.join(out, 'multiple-partial-pickup.png') });
        await page.locator('.menu_pickup').screenshot({ path: path.join(out, 'selected-rows.png') });
        for (const width of [390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            for (const stack of stacks) {
                const bounds = await row(stack.name).boundingBox();
                assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Selected row fits at ' + width);
                assert(await row(stack.name).evaluate(element => element.scrollWidth <= element.clientWidth + 1),
                    'Selection details fit inside their row at ' + width);
                assert(await row(stack.name).locator('.workflow-selection-state').isVisible());
            }
            await page.screenshot({ path: path.join(out, 'selected-rows-' + width + '.png') });
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        await row(stacks[1].name).focus(); await confirm();
        await waitQuantity(stacks[0].name, 2);
        await waitQuantity(stacks[1].name, stacks[1].qty);
        evidence.cases.push('native quantity prefix and letters keep partial and multiple selections');
        assert.deepEqual(errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
