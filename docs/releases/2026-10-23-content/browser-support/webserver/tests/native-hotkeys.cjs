const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Every engine keyboard binding through the real web client; no probe reaches the engine. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { bindings, keys, values } = require('./native-keymap.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8899';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.HOTKEY_PROOF_DIR || '/tmp/dcss-hotkey-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = [], evidence = { account: 'HotkeyQA' + Date.now().toString().slice(-8) };
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    try {
        await page.goto(url);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await ready();
        const clock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        evidence.matrix = await page.evaluate(keys => {
            const nativeSend = window.socket.send, results = [];
            let packets = [];
            // Intercept the transport, including references cached by client-input.
            window.socket.send = function (payload) { packets.push(JSON.parse(payload)); };
            const close = () => {
                document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close('hotkey-probe'));
                document.activeElement.blur();
            };
            const routes = {
                m: { command: 'CMD_DISPLAY_SKILLS', section: 'skills' },
                A: { command: 'CMD_DISPLAY_MUTATIONS', section: 'mutations' },
                '%': { command: 'CMD_RESISTS_SCREEN', section: 'overview' },
                z: { command: 'CMD_CAST_SPELL', power: 'Spellcasting' },
                a: { command: 'CMD_USE_ABILITY', power: 'Abilities & invocations' }
            };
            try {
                for (const binding of keys) {
                    close(); packets = [];
                    const init = { bubbles: true, cancelable: true, ...binding.event,
                        which: binding.event.keyCode };
                    const down = new KeyboardEvent('keydown', init);
                    document.body.dispatchEvent(down);
                    const text = binding.event.text || (binding.expected === 13 ? '\r' : '');
                    if (!down.defaultPrevented && text) document.body.dispatchEvent(new KeyboardEvent('keypress', {
                        ...init, keyCode: text.codePointAt(0), charCode: text.codePointAt(0), which: text.codePointAt(0)
                    }));
                    const route = routes[binding.event.text];
                    const panel = route?.section
                        ? Boolean(document.querySelector('#party_inspector_modal[open]'))
                            && window.crawl_party.inspector_tab === route.section
                        : route?.power ? Boolean(document.querySelector('#power_picker_dialog[open]'))
                            && document.getElementById('power_picker_heading').textContent === route.power : false;
                    const input = packets.filter(packet => ['key', 'input', 'text_input'].includes(packet.msg));
                    const code = input.length !== 1 ? null : input[0].msg === 'key' ? input[0].keycode
                        : input[0].data?.length === 1 ? input[0].data[0] : input[0].text?.codePointAt(0);
                    results.push({ expression: binding.expression, command: binding.command, expected: binding.expected,
                        actual: code, webPanel: route ? panel : undefined,
                        pass: route ? panel && input.length === 0 && route.command === binding.command : code === binding.expected });
                }
            } finally { close(); window.socket.send = nativeSend; }
            return results;
        }, keys);
        const failures = evidence.matrix.filter(result => !result.pass);
        fs.writeFileSync(path.join(out, 'matrix.json'), JSON.stringify(evidence, null, 2));
        assert.deepEqual(failures, [], 'Every native binding must retain its code or matching web action');
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock,
            'The entire binding probe spends no game turns');

        // Real Chrome keyboard events exercise translation independently of synthetic probes.
        await page.evaluate(() => {
            window.qaHotkeyPackets = []; window.qaNativeSend = window.socket.send;
            window.socket.send = payload => window.qaHotkeyPackets.push(JSON.parse(payload));
        });
        evidence.physical = [];
        for (const [key, expected] of [['i', 105], ['I', 73], ['Enter', 13], ['Space', 32], ['Tab', 9],
            ['ArrowUp', values.CK_UP], ['Shift+ArrowUp', values.CK_SHIFT_UP],
            ['Control+ArrowLeft', values.CK_CTRL_LEFT], ['Shift+Tab', values.CK_SHIFT_TAB],
            ['Control+r', 18], ['Control+v', 22], ['Control+z', 26],
            ['F1', -265], ['F2', -266], ['F3', -267], ['F4', -268],
            ['Numpad1', -1001], ['Numpad5', -1005], ['Shift+Numpad5', values.CK_SHIFT_CLEAR],
            ['Control+Numpad5', values.CK_CTRL_CLEAR]]) {
            await page.evaluate(() => { window.qaHotkeyPackets = []; document.activeElement.blur(); });
            await page.keyboard.press(key);
            const packets = await page.evaluate(() => window.qaHotkeyPackets.filter(packet => ['key', 'input'].includes(packet.msg)));
            assert.equal(packets.length, 1, key + ': one native input');
            const packet = packets[0], actual = packet.keycode ?? packet.data?.[0] ?? packet.text?.codePointAt(0);
            assert.equal(actual, expected, key);
            evidence.physical.push(key);
        }
        await page.evaluate(() => { window.socket.send = window.qaNativeSend; });

        // I really opens native spell browsing, then a web description; F1 opens the game menu.
        const caster = await page.evaluate(() => window.crawl_party.state.members.find(member => member.spells.length));
        assert(caster);
        await page.evaluate(slot => require('comm').send_message('switch_player', { slot }), caster.slot);
        await page.waitForFunction(slot => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/party-model'));
            return require(name).controlledSlot(window.crawl_party.state) === slot;
        }, caster.slot);
        await ready(); await page.keyboard.press('I');
        await page.locator('.menu_spell li.selectable').first().waitFor();
        await page.locator('.menu_spell li.selectable').first().focus(); await page.keyboard.press('Enter');
        await page.locator('.describe-spell.workflow-surface').waitFor();
        await page.screenshot({ path: path.join(out, 'spell-browsing-web-panel.png') });
        for (let index = 0; index < 5 && await page.locator('#ui-stack > *').count(); index++) {
            await page.keyboard.press('Escape'); await page.waitForTimeout(80);
        }
        await ready(); await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('F1');
        await page.locator('#ui-stack .workflow-surface').waitFor();
        assert.equal(await page.locator('#party_inspector_modal[open]').count(), 0);
        await page.screenshot({ path: path.join(out, 'native-game-menu-web-panel.png') });
        await page.keyboard.press('Escape'); await ready();
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock);

        // Assigned top-row digits override native input through the same
        // authoritative action routes as pointer use. Probe transport only.
        const quickBindings = await page.evaluate(() => {
            const names = Object.keys(require.s.contexts._.defined), state = window.crawl_party.state;
            const hero = state.members.find(member => member.slot === state.controlled_slot);
            const actions = require(names.find(name => name.endsWith('/workflow-actions')));
            const entries = [];
            if (hero.inventory[0]) entries.push({ kind: 'item', id: hero.inventory[0].slot,
                expected: { msg: 'inv_item_use', slot: hero.inventory[0].slot, expected_slot: hero.slot,
                    expected_name: hero.inventory[0].name } });
            for (const kind of ['spell', 'ability']) {
                const power = hero[kind === 'spell' ? 'spells' : 'abilities'].find(entry => !actions.powerReason(hero, entry, kind));
                if (power) entries.push({ kind, id: power.id, expected: { msg: 'power_action', expected_slot: hero.slot,
                    id: power.id, kind, letter: kind === 'spell' ? power.letter : power.hotkey } });
            }
            return entries;
        });
        assert(quickBindings.some(entry => entry.kind === 'item'));
        assert(quickBindings.some(entry => entry.kind === 'spell'));
        for (let index = 0; index < 10; index++) {
            const binding = quickBindings[index % quickBindings.length];
            await page.locator('#quickbar_slot_' + index).click();
            await page.locator('[data-quick-category="' + binding.kind + '"]').click();
            await page.locator('#quickbar_entry_' + binding.kind + '_' + binding.id).click();
        }
        assert.deepEqual(await page.locator('.quickbar-key').allTextContents(), Array.from('1234567890'));
        await page.evaluate(() => {
            window.qaHotkeyPackets = [];
            window.socket.send = payload => window.qaHotkeyPackets.push(JSON.parse(payload));
        });
        evidence.assignedQuickKeys = [];
        try {
            for (const [index, key] of Array.from('1234567890').entries()) {
                await page.evaluate(() => { window.qaHotkeyPackets = []; document.activeElement.blur(); });
                await page.keyboard.press(key);
                assert.deepEqual(await page.evaluate(() => window.qaHotkeyPackets),
                    [quickBindings[index % quickBindings.length].expected], key + ': assigned quick action only');
                evidence.assignedQuickKeys.push(key);
            }
        } finally { await page.evaluate(() => { window.socket.send = window.qaNativeSend; }); }
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock);
        await page.locator('#dcss_quick_dock').screenshot({ path: path.join(out, 'ten-slot-shortcuts.png') });
        assert.deepEqual(errors, []);
        evidence.success = true;
        evidence.engineBindings = bindings.length;
        evidence.uniqueKeyProbes = keys.length;
        evidence.webPanelsPreserved = ['skills', 'traits', 'resistances', 'casting', 'abilities'];
        fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, engineBindings: bindings.length, uniqueKeyProbes: keys.length,
            physicalKeys: evidence.physical.length, assignedQuickKeys: evidence.assignedQuickKeys,
            webPanelsPreserved: evidence.webPanelsPreserved }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
