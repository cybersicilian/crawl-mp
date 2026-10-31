const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Right-click input through an isolated live engine, including real pickup and drop. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:19018';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.CONTEXT_MENU_PROOF_DIR || '/tmp/dcss-context-menu-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = { url, account: 'Ctx' + Date.now().toString(36).slice(-6), checks: [] };
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(js|css)(\?|$)/.test(response.url())) errors.push(response.url());
    });
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    const ready = () => page.waitForFunction(() => {
        const id = Object.keys(require.s.contexts._.defined).find(id => id.endsWith('/workflow-actions'));
        return id && require(id).ready() && getComputedStyle(document.getElementById('loader')).display === 'none';
    });
    const menu = page.locator('.game-context-menu');
    const choose = name => menu.getByRole('menuitem', { name }).click();
    const native = page.locator('#ui-stack > *');
    const closeNative = async () => {
        for (let i = 0; i < 5 && await native.count(); i++) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(150);
        }
        await ready();
    };
    const check = text => { evidence.checks.push(text); console.log(text); };
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
        await page.evaluate(() => {
            window.contextModule = suffix => require(Object.keys(require.s.contexts._.defined).find(id => id.endsWith('/' + suffix)));
            window.contextSent = [];
            const comm = require('comm'), send = comm.send_message;
            comm.send_message = function (msg, fields) {
                if (['key', 'input', 'click_cell', 'inv_item_use', 'inv_item_describe', 'floor_item_action', 'skill_training'].includes(msg))
                    window.contextSent.push({ msg, ...fields });
                return send.apply(this, arguments);
            };
        });
        const initial = await state(), hero = initial.members[0];
        const trainingWeapon = hero.inventory.find(item => item.equipped && /weapon/i.test(item.kind_name));
        assert(trainingWeapon && trainingWeapon.training.length, 'Native weapon supplies related skills');
        const recommendation = trainingWeapon.training.find(entry => entry.target > 0);
        assert(recommendation, 'A starting weapon supplies a native minimum-delay target');
        const weaponSkill = hero.skills.find(skill => skill.id === recommendation.skill);
        const trainingItem = page.locator('#hud_item_0_' + trainingWeapon.slot);
        const openTraining = () => page.evaluate(() => window.crawl_party.open_inspector(0, 'skills'));
        const waitTraining = values => page.waitForFunction(({ id, values }) => {
            const skill = window.crawl_party.state.members[0].skills.find(skill => skill.id === id);
            return Object.entries(values).every(([key, value]) => skill[key] === value);
        }, { id: weaponSkill.id, values });
        await openTraining();
        await page.getByRole('button', { name: weaponSkill.name + ' training Off', exact: true }).click();
        await waitTraining({ train: 0 });
        await page.keyboard.press('Escape');
        await trainingItem.click({ button: 'right' });
        await page.screenshot({ path: path.join(out, 'item-training-menu.png') });
        await menu.getByRole('menuitem', { name: /^Train .* to / }).click();
        await waitTraining({ target: recommendation.target, target_base: false, train: 1 });
        await page.waitForFunction(() => document.getElementById('workflow_action_notice')?.textContent.includes('target set'));
        assert.equal((await state()).members[0].elapsed_aut, hero.elapsed_aut);
        check('Item target uses the native weapon recommendation, enables disabled training and spends no turn');

        await trainingItem.click({ button: 'right' });
        await choose(new RegExp('^Set ' + weaponSkill.name + ' target'));
        const targetField = page.getByRole('spinbutton', { name: weaponSkill.name + ' stop level', exact: true });
        assert(await targetField.evaluate(node => node === document.activeElement));
        await targetField.fill('12.5'); await targetField.press('Enter');
        await waitTraining({ target: 125, train: 1 });
        await page.getByRole('button', { name: weaponSkill.name + ' training Focus', exact: true }).click();
        await waitTraining({ train: 2 });
        await page.keyboard.press('Escape');
        await trainingItem.click({ button: 'right' });
        await menu.getByRole('menuitem', { name: /^Train .* to / }).click();
        await waitTraining({ target: recommendation.target, train: 2 });
        assert.equal((await state()).members[0].elapsed_aut, hero.elapsed_aut);
        await page.screenshot({ path: path.join(out, 'item-training-result.png') });
        check('Custom item action focuses the correct stop level; recommended targets preserve Focus');
        await page.evaluate(() => { window.contextSent = []; });
        const potion = hero.inventory.find(item => /potion/i.test(item.kind_name));
        assert(potion, 'A native Fighter starts with a potion');
        const item = page.locator('#hud_item_0_' + potion.slot);
        await item.click({ button: 'right' });
        await menu.waitFor();
        assert.deepEqual(await page.evaluate(() => window.contextSent), [], 'Right button-down cannot invoke an action');
        assert.equal((await state()).members[0].elapsed_aut, hero.elapsed_aut);
        assert.equal(await menu.getByRole('menuitem', { name: /^Quaff/ }).count(), 1);
        await page.screenshot({ path: path.join(out, 'inventory-context.png') });
        await page.keyboard.press('Escape');
        assert.equal(await native.count(), 0);
        assert.deepEqual(await page.evaluate(() => window.contextSent), []);
        await item.click({ button: 'right' });
        await page.mouse.click(600, 300);
        assert.equal(await menu.count(), 0);
        assert.deepEqual(await page.evaluate(() => window.contextSent), [], 'Outside dismissal cannot click through to the canvas');
        check('Opening and dismissing inventory actions sends no game input and uses no turn');

        await item.focus(); await page.keyboard.press('Shift+F10');
        await choose(/^Inspect/); await native.first().waitFor();
        assert.equal((await state()).members[0].elapsed_aut, hero.elapsed_aut);
        await closeNative();
        check('Keyboard context menu opens the native item description without spending time');

        await item.click({ button: 'right' }); await choose(/^Drop/);
        await page.waitForFunction(slot => !window.crawl_party.state.members[0].inventory.some(item => item.slot === slot), potion.slot);
        await ready();
        await page.waitForFunction(clock => window.crawl_party.state.members[0].elapsed_aut > clock, hero.elapsed_aut);
        const dropped = await state();
        const floor = page.locator('.floor-item').filter({ hasText: potion.name });
        await floor.waitFor();
        await floor.click({ button: 'right' }); await choose(/^Inspect/); await native.first().waitFor();
        assert.equal((await state()).members[0].elapsed_aut, dropped.members[0].elapsed_aut);
        await closeNative();
        await floor.click({ button: 'right' }); await choose(/^Pick up/);
        await page.waitForFunction(name => window.crawl_party.state.members[0].inventory.some(item => item.name === name), potion.name);
        await ready();
        await page.waitForFunction(clock => window.crawl_party.state.members[0].elapsed_aut > clock, dropped.members[0].elapsed_aut);
        check('Drop, ground inspect and pickup execute native actions with the correct time costs');

        const points = await page.evaluate(() => {
            const renderer = window.contextModule('dungeon_renderer'), map = window.contextModule('map_knowledge');
            const hero = window.crawl_party.state.members[0], bounds = renderer.element.getBoundingClientRect();
            function point(tile) {
                const at = renderer.canvas_coords(tile.x, tile.y);
                return { x: bounds.left + (at.x + at.width / 2) / devicePixelRatio,
                    y: bounds.top + (at.y + at.height / 2) / devicePixelRatio };
            }
            let move;
            for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
                const tile = { x: hero.pos.x + x, y: hero.pos.y + y }, cell = map.get(tile.x, tile.y);
                if ((x || y) && cell.t && map.visible(cell) && !cell.mon && /floor/i.test(cell.feature_name)) move = point(tile);
            }
            return { hero: point(hero.pos), move };
        });
        await page.evaluate(() => { window.contextSent = []; });
        const tileClock = (await state()).members[0].elapsed_aut;
        await page.mouse.click(points.hero.x, points.hero.y, { button: 'right' });
        await menu.waitFor();
        assert.deepEqual(await page.evaluate(() => window.contextSent), [], 'Dungeon mousedown cannot inspect before menu selection');
        await page.screenshot({ path: path.join(out, 'dungeon-context.png') });
        assert.equal(await menu.getByRole('menuitem', { name: 'Open character sheet' }).count(), 1);
        await choose(/^Inspect/); await native.first().waitFor(); await closeNative();
        assert.equal((await state()).members[0].elapsed_aut, tileClock);
        check('Actual canvas hit-testing opens a hero/tile menu, and inspection uses no turn');
        if (points.move) {
            const pos = (await state()).members[0].pos;
            await page.mouse.click(points.move.x, points.move.y, { button: 'right' });
            await choose(/^Move here/);
            await page.waitForFunction(pos => JSON.stringify(window.crawl_party.state.members[0].pos) !== JSON.stringify(pos), pos);
            await ready();
            check('Move here uses the native dungeon click path');
        }

        await page.evaluate(() => require('comm').send_message('key', { keycode: 105 }));
        await page.locator('#ui-stack li.selectable').first().waitFor();
        await page.locator('#ui-stack li.selectable').first().click({ button: 'right' });
        await menu.waitFor();
        assert(await menu.getByRole('menuitem', { name: /Select|Toggle selection/ }).count());
        await page.keyboard.press('Escape');
        assert(await native.count(), 'Escape preserves the underlying native inventory');
        await closeNative();
        check('Native inventory rows offer contextual selection and preserve their parent menu');

        const equippedState = await state();
        const weapon = equippedState.members[0].inventory.find(item => item.equipped && /weapon|stave|staff/i.test(item.kind_name));
        assert(weapon);
        await page.locator('#hud_item_0_' + weapon.slot).click({ button: 'right' });
        await choose(/^Unwield/);
        await page.waitForFunction(slot => window.crawl_party.state.members[0].inventory.some(item => item.slot === slot && !item.equipped), weapon.slot);
        await ready();
        assert.equal(await page.evaluate(() => window.contextSent.filter(packet => packet.msg === 'inv_item_use').at(-1).action), 'unequip');
        await page.waitForFunction(clock => window.crawl_party.state.members[0].elapsed_aut > clock, equippedState.members[0].elapsed_aut);
        check('Equipped-item menu sends explicit unequip and spends native time');
        await page.locator('#hud_item_0_' + weapon.slot).click({ button: 'right' });
        await choose(/^Drop/);
        await page.waitForFunction(slot => !window.crawl_party.state.members[0].inventory.some(item => item.slot === slot), weapon.slot);
        await ready();
        const groundWeapon = page.locator('.floor-item').filter({ hasText: weapon.name });
        await groundWeapon.waitFor();
        const groundClock = (await state()).members[0].elapsed_aut;
        await openTraining();
        const groundTarget = page.getByRole('spinbutton', { name: weaponSkill.name + ' stop level', exact: true });
        await groundTarget.fill(''); await groundTarget.press('Enter');
        await waitTraining({ target: 0 });
        await page.keyboard.press('Escape');
        await groundWeapon.click({ button: 'right' });
        await menu.getByRole('menuitem', { name: /^Train .* to / }).click();
        await waitTraining({ target: recommendation.target, train: 2 });
        assert.equal((await state()).members[0].elapsed_aut, groundClock);
        check('Ground weapons expose the same native skill target without pickup or extra turns');

        assert.deepEqual(errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(evidence, null, 2));
    } catch (error) {
        console.error({ pageErrors: errors });
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText().catch(() => ''));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
