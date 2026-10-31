/* Palette commands through real WebTiles and a disposable localhost game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { bindings } = require('./native-keymap.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18997';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.PALETTE_PROOF_DIR || '/tmp/dcss-palette-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(30000);
    const errors = [], evidence = { commands: [], layouts: [] };
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready() && !document.querySelector('#ui-stack > *');
    });
    const key = code => page.evaluate(keycode => require('comm').send_message('key', { keycode }), code);
    const clock = () => page.evaluate(() => window.crawl_party.state.world_aut_clock);
    async function closeNative() {
        for (let index = 0; index < 10; index++) {
            const input = page.locator('#message_pane input:visible');
            if (await input.count()) await input.press('Escape');
            else if (await page.locator('#ui-stack > *:visible').count()) await key(27);
            else break;
            await page.waitForTimeout(100);
        }
        await ready();
    }
    async function open(query) {
        await page.locator('#quickbar_more > summary').click();
        await page.locator('[data-quick-category="command"]').click();
        await page.locator('#quickbar_search').fill(query);
    }
    try {
        await page.goto(url);
        evidence.account = 'PaletteQA' + Date.now().toString().slice(-8);
        await page.waitForFunction(() => window.socket?.readyState === 1 && window.jQuery
            && window.jQuery._data(document.getElementById('login_form'), 'events')?.submit?.length);
        await page.evaluate(account => {
            document.getElementById('username').value = account;
            document.getElementById('password').value = 'crawl';
            document.getElementById('login_form').requestSubmit();
        }, evidence.account);
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length, null, { timeout: 240000 });
        await ready();
        const initialClock = await clock();
        await page.evaluate(() => {
            window.qaSentCommands = [];
            const comm = require('comm'), original = comm.send_message;
            comm.send_message = function (msg, data) {
                window.qaSentCommands.push({ msg, ...data });
                return original.apply(this, arguments);
            };
        });
        for (const [id, query, nativeCommand] of [
            ['find', 'Cmd+F', 'CMD_SEARCH_STASHES'], ['shopping', 'shopping', 'CMD_LIST_GOLD'],
            ['overview', 'dungeon overview', 'CMD_DISPLAY_OVERMAP'], ['knowledge', 'item knowledge', 'CMD_DISPLAY_KNOWN_OBJECTS'],
            ['messages', 'message history', 'CMD_REPLAY_MESSAGES'], ['help', 'keyboard help', 'CMD_DISPLAY_COMMANDS']
        ]) {
            await open(query);
            const button = page.locator('#quickbar_command_' + id);
            assert(await button.isVisible());
            await page.evaluate(() => { window.qaSentCommands = []; });
            await page.locator('#quickbar_search').press('Enter');
            await page.waitForFunction(() => !document.getElementById('quickbar_more').open);
            await page.waitForTimeout(150);
            const packets = await page.evaluate(() => window.qaSentCommands);
            const nativeCode = bindings.findLast(binding => binding.command === nativeCommand).code;
            assert.deepEqual(packets, [{ msg: 'key', keycode: nativeCode }], id + ' uses the engine binding exactly once');
            if (id === 'find') {
                await page.locator('#message_pane input:visible').waitFor();
                assert.match(await page.locator('#message_pane').innerText(), /search for what/i);
                await page.screenshot({ path: path.join(output, 'native-find.png') });
            } else if (id === 'shopping') {
                assert.match(await page.locator('#message_pane').innerText(), /gold|shopping/i,
                    'An empty shopping list reports native gold');
            }
            evidence.commands.push({ id, nativeCommand, keycode: nativeCode });
            await closeNative();
            assert.equal(await clock(), initialClock, id + ' spends no world time');
        }
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('Meta+f');
        await page.locator('#message_pane input:visible').waitFor();
        assert.match(await page.locator('#message_pane').innerText(), /search for what/i);
        await closeNative();
        evidence.cmdFind = true;
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            await open('shopping');
            const geometry = await page.locator('#quickbar_more_content').evaluate(element => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    overflow: element.scrollWidth > element.clientWidth + 1 };
            });
            assert(geometry.left >= 0 && geometry.right <= width + 1 && geometry.top >= 0 && geometry.bottom <= 801);
            assert.equal(geometry.overflow, false, 'Palette content fits at ' + width);
            await page.screenshot({ path: path.join(output, 'shopping-' + width + '.png') });
            evidence.layouts.push({ width, ...geometry });
            await page.locator('#quickbar_search').press('Escape');
        }
        assert.deepEqual(errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        console.error(error);
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => 'Page unavailable'));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
