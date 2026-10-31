/* Action help and single-tile exclusions through the real browser and engine. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18998';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.ACTION_MENU_PROOF_DIR || '/tmp/dcss-action-menu-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(30000);
    const errors = [], evidence = { layouts: [] };
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready() && !document.querySelector('#ui-stack > *');
    });
    const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
    async function open(query = '') {
        if (await page.locator('#quickbar_more').getAttribute('open') === null)
            await page.locator('#quickbar_more > summary').click();
        await page.locator('[data-quick-category="command"]').click();
        await page.locator('#quickbar_search').fill(query);
    }
    async function arm() {
        await open('out of bounds');
        await page.locator('#quickbar_command_exclude').click();
        await page.locator('#workflow_exclusion_status').waitFor();
        assert.equal(await page.locator('#quickbar_more').getAttribute('open'), null);
    }
    async function pointer(tile, button = 'left') {
        const point = await page.evaluate(tile => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
            const renderer = require(name), bounds = document.getElementById('dungeon').getBoundingClientRect();
            return { x: bounds.left + (tile.x - renderer.view.x + 0.5) * renderer.cell_width,
                y: bounds.top + (tile.y - renderer.view.y + 0.5) * renderer.cell_height };
        }, tile);
        await page.mouse.click(point.x, point.y, { button });
    }
    async function marker(tile, expected) {
        await page.waitForFunction(({ tile, expected }) => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/map_knowledge'));
            const enums = require(Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/enums')));
            const cell = require(name).get(tile.x, tile.y);
            return Boolean(enums.prepare_bg_flags(cell.t.bg || 0).EXCL_CTR) === expected;
        }, { tile, expected });
    }
    try {
        await page.goto(url);
        const username = 'ActionQA' + Date.now().toString(36);
        await page.locator('#reg_link').click();
        await page.locator('#reg_username').fill(username);
        await page.locator('#reg_password').fill('action-menu-test');
        await page.locator('#reg_repeat_password').fill('action-menu-test');
        await page.locator('#reg_submit').click();
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length, null, { timeout: 240000 });
        await ready();
        evidence.account = username;
        assert.equal((await state()).tile_exclusions, true);
        await page.evaluate(() => {
            window.actionPackets = []; window.actionErrors = [];
            const comm = require('comm'), send = comm.send_message, receive = comm.handle_message;
            comm.send_message = function (msg, data) {
                window.actionPackets.push({ msg, ...data });
                return send.apply(this, arguments);
            };
            comm.handle_message = function (packet) {
                if (packet.msg === 'game_action_error') window.actionErrors.push(packet.message);
                return receive.apply(this, arguments);
            };
        });
        const initial = await state(), tile = initial.members[0].pos;
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            await open('out of bounds');
            await page.locator('#quickbar_command_exclude').hover();
            await page.waitForTimeout(500);
            assert.match(await page.locator('#quickbar_help').innerText(), /auto-explore/);
            assert.equal(await page.locator('#dcss_rich_tooltip').isVisible(), false, 'Palette help stays inline');
            assert.equal(await page.locator('#quickbar_help .dcss-tip-body').evaluate(element =>
                getComputedStyle(element).color), 'rgb(216, 205, 180)', 'Help uses readable text on the dark palette');
            const geometry = await page.locator('#quickbar_more_content').evaluate(element => {
                const help = document.getElementById('quickbar_help').getBoundingClientRect();
                const results = element.querySelector('.quickbar-picker-results').getBoundingClientRect();
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    overflow: element.scrollWidth > element.clientWidth + 1, helpClear: results.bottom <= help.top };
            });
            assert(geometry.left >= 0 && geometry.right <= width + 1 && geometry.top >= 0 && geometry.bottom <= 801);
            assert(!geometry.overflow && geometry.helpClear, 'Actions and help remain separate and fit');
            evidence.layouts.push({ width, ...geometry });
            await page.screenshot({ path: path.join(output, 'inline-help-' + width + '.png') });
            await page.locator('#quickbar_search').press('Escape');
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        await open();
        await page.locator('#quickbar_command_find').hover();
        assert.match(await page.locator('#quickbar_help').innerText(), /Find Items/);
        assert(await page.locator('.quickbar-picker-results').evaluate(element => element.clientHeight >= 140),
            'The full command menu leaves room for several actions beside the fixed help area');
        await page.screenshot({ path: path.join(output, 'all-commands.png') });
        await page.locator('[data-quick-category="item"]').click();
        await page.locator('.quickbar-catalog-action').first().hover();
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#dcss_rich_tooltip').isVisible(), false, 'Item descriptions also stay inline');
        await page.locator('#quickbar_help').click();
        assert(await page.locator('#quickbar_help .dcss-tip-title').innerText(), 'Item help remains while reading it');
        await page.screenshot({ path: path.join(output, 'item-help.png') });
        await page.locator('#quickbar_search').press('Escape');
        await arm();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#workflow_exclusion_status').count(), 0);
        await arm();
        await pointer(tile, 'right');
        assert.equal(await page.locator('#workflow_exclusion_status').count(), 0);
        assert.equal(await page.locator('#ui-stack > *').count(), 0, 'Right-click cancels without inspecting');
        assert.equal(await page.locator('.game-context-menu').count(), 0, 'Cancellation consumes the gesture before context actions');
        await arm();
        await page.evaluate(() => { window.actionPackets = []; });
        await pointer(tile);
        await marker(tile, true);
        const packets = await page.evaluate(() => window.actionPackets.filter(packet => packet.msg === 'click_cell'));
        assert.deepEqual(packets, [{ msg: 'click_cell', ...tile, button: 1, exclude: true,
            expected_slot: 0, expected_place: initial.members[0].place }]);
        // A neighbouring square must not become part of this single-tile exclusion.
        await page.evaluate(tile => {
            const named = suffix => require(Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/' + suffix)));
            const map = named('map_knowledge'), enums = named('enums');
            window.adjacentExclusions = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => {
                const cell = map.get(tile.x + dx, tile.y + dy);
                return cell.mf === enums.MF_EXCL || cell.mf === enums.MF_EXCL_ROOT;
            });
        }, tile);
        assert.deepEqual(await page.evaluate(() => window.adjacentExclusions), [false, false, false, false]);
        await page.screenshot({ path: path.join(output, 'tile-marked.png') });
        await arm(); await pointer(tile); await marker(tile, false);
        await page.screenshot({ path: path.join(output, 'tile-cleared.png') });
        const current = await state();
        assert.deepEqual(current.members.map(hero => hero.pos), initial.members.map(hero => hero.pos));
        assert.equal(current.world_aut_clock, initial.world_aut_clock, 'Exclusions never consume a turn');
        assert.equal(current.members[0].turns, initial.members[0].turns);
        // Stale requests must be rejected without falling through to travel.
        await page.evaluate(tile => require('comm').send_message('click_cell', {
            ...tile, button: 1, exclude: true, expected_slot: 0, expected_place: 'D:999'
        }), tile);
        await page.waitForFunction(() => window.actionErrors.length > 0);
        assert.match(await page.evaluate(() => window.actionErrors.at(-1)), /selection changed/i);
        await marker(tile, false);
        await page.evaluate(tile => require('comm').send_message('click_cell', {
            x: 9999, y: 9999, button: 1, exclude: true, expected_slot: 0,
            expected_place: window.crawl_party.state.members[0].place
        }), tile);
        await page.waitForFunction(() => window.actionErrors.length > 1);
        assert.match(await page.evaluate(() => window.actionErrors.at(-1)), /explored dungeon tile/i);
        await marker(tile, false);
        assert.deepEqual(errors, []);
        Object.assign(evidence, { success: true, inlineHelp: true, singleTile: true, toggles: true,
            cancellation: true, noMovementOrTurns: true, staleRequestRejected: true, unknownTileRejected: true });
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => 'Page unavailable'));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
