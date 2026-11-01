const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Eight native bindings, guarded UI input, responsive placement and a real move. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { bindings } = require('./native-keymap.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18987';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.DIRECTION_PAD_PROOF || '/tmp/dcss-direction-pad-proof';
fs.mkdirSync(output, { recursive: true });
const directions = [
    ['northwest', 'y', 7, 'UP_LEFT', -1, -1], ['north', 'k', 8, 'UP', 0, -1],
    ['northeast', 'u', 9, 'UP_RIGHT', 1, -1], ['west', 'h', 4, 'LEFT', -1, 0],
    ['east', 'l', 6, 'RIGHT', 1, 0], ['southwest', 'b', 1, 'DOWN_LEFT', -1, 1],
    ['south', 'j', 2, 'DOWN', 0, 1], ['southeast', 'n', 3, 'DOWN_RIGHT', 1, 1]
];
for (const [, letter, numpad, command] of directions) {
    assert(bindings.some(binding => binding.expression === "'" + letter + "'" && binding.command === 'CMD_MOVE_' + command));
    assert(bindings.some(binding => binding.expression === 'CK_NUMPAD_' + numpad && binding.command === 'CMD_MOVE_' + command));
}

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
        deviceScaleFactor: Number(process.env.DIRECTION_PAD_DPR || 1),
        hasTouch: process.env.DIRECTION_PAD_TOUCH === '1' });
    page.setDefaultTimeout(20000);
    const account = process.env.DIRECTION_PAD_ACCOUNT || 'DirectionQA' + Date.now().toString().slice(-9);
    assert(/^DirectionQA\d+$/.test(account), 'Only disposable direction-pad QA accounts may be resumed');
    const evidence = { account, errors: [], layouts: [], routes: [], guards: [] };
    page.on('pageerror', error => evidence.errors.push(error.message));
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const packets = () => page.evaluate(() => window.directionPackets.splice(0));
    try {
        await page.goto(url);
        await signInTestAccount(page, account, 'crawl');
        if (process.env.DIRECTION_PAD_RESUME_ID) {
            await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
            await page.evaluate(id => require('comm').send_message('library_load', { id }), process.env.DIRECTION_PAD_RESUME_ID);
        } else {
            await page.locator('#lobby_home [data-lobby-create]').click();
            for (let index = 0; index < 4; index++) {
                const slot = page.locator('.party-slot-box[data-slot="' + index + '"]');
                if (index) await slot.locator('[data-mode="companion"]').click();
                await slot.locator('.party-slot-species').selectOption('Human');
                await slot.locator('.party-slot-job').selectOption('Fighter');
            }
            await page.locator('#btn_launch_party_room').click();
        }
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 300000 });
        await ready();
        await page.locator('#direction_pad').waitFor();
        assert.equal(await page.locator('#direction_pad .direction-pad-button').count(), 8);
        const clock = await page.evaluate(() => window.crawl_party.state.world_aut_clock);
        await page.evaluate(() => {
            window.directionPackets = [];
            window.directionOriginalSend = window.socket.send;
            window.socket.send = payload => {
                const packet = JSON.parse(payload);
                if (['ping', 'pong', 'latency_probe'].includes(packet.msg))
                    window.directionOriginalSend.call(window.socket, payload);
                else window.directionPackets.push(packet);
            };
        });
        for (const [name, letter, numpad] of directions) {
            const button = page.locator('[data-direction="' + name + '"]');
            assert.deepEqual(await button.locator('kbd').allTextContents(), [letter, String(numpad)]);
            await button.click();
            assert.deepEqual(await packets(), [{ msg: 'key', keycode: -1000 - numpad }]);
            assert(!await button.evaluate(element => document.activeElement === element), 'Pointer activation returns keyboard input to the dungeon');
            evidence.routes.push(name);
        }
        for (const key of ['Enter', 'Space']) {
            await page.locator('[data-direction="north"]').focus();
            await page.keyboard.press(key);
            assert.deepEqual(await packets(), [{ msg: 'key', keycode: -1008 }], key + ' sends exactly one direction');
        }
        await page.keyboard.press('Tab');
        assert.deepEqual(await packets(), [], 'Tab navigates controls without auto-fighting');
        // Default key bindings remain native while the dungeon has focus.
        for (const [, letter, numpad] of directions) {
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press(letter);
            assert.deepEqual(await packets(), [{ msg: 'input', text: letter }]);
            await page.keyboard.press('Numpad' + numpad);
            assert.deepEqual(await packets(), [{ msg: 'key', keycode: -1000 - numpad }]);
        }
        // Exercise changed authoritative state between rendering and activation.
        evidence.guards = await page.evaluate(() => {
            const get = suffix => require(Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/' + suffix)));
            const state = window.crawl_party.state, hero = state.members.find(member => member.slot === state.controlled_slot);
            const original = { combat_locked: state.combat_locked, simultaneous_turns: state.simultaneous_turns,
                active_slot: state.active_slot, alive: hero.alive, ghost_haunting: hero.ghost_haunting };
            const enums = get('enums'), client = require('client'), watching = client.is_watching;
            const cases = [
                ['queued', () => Object.assign(state, { combat_locked: true, simultaneous_turns: false, active_slot: 1 })],
                ['downed', () => { hero.alive = false; }],
                ['ghost', () => { hero.ghost_haunting = true; }],
                ['spectator', () => { client.is_watching = () => true; }],
                ['targeting', () => jQuery(document).trigger('game_input_changed', [enums.mouse_mode.TARGET])],
                ['menu', () => jQuery('#ui-stack').append('<div id="direction_test_popup"></div>')]
            ];
            const results = [];
            try {
                for (const [name, change] of cases) {
                    change();
                    document.querySelector('[data-direction="north"]').click();
                    results.push({ name, blocked: document.querySelectorAll('#direction_pad .direction-pad-button:disabled').length === 8,
                        packets: window.directionPackets.splice(0) });
                    Object.assign(state, { combat_locked: original.combat_locked, simultaneous_turns: original.simultaneous_turns,
                        active_slot: original.active_slot });
                    Object.assign(hero, { alive: original.alive, ghost_haunting: original.ghost_haunting });
                    client.is_watching = watching;
                    jQuery('#direction_test_popup').remove();
                    jQuery(document).trigger('game_input_changed', [enums.mouse_mode.COMMAND]);
                    // The next case deliberately starts with an enabled stale rendering.
                    jQuery('#direction_pad .direction-pad-button').prop('disabled', false);
                }
            } finally { client.is_watching = watching; }
            return results;
        });
        assert(evidence.guards.every(result => result.blocked && result.packets.length === 0), JSON.stringify(evidence.guards));
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), clock, 'Binding and guard probes spend no turns');
        await page.evaluate(() => { window.socket.send = window.directionOriginalSend; });
        await ready(); await settle();
        for (const [width, height] of [[1440, 900], [1024, 768], [2670, 1664]]) {
            await page.setViewportSize({ width, height }); await settle();
            const layout = await page.evaluate(() => {
                const rect = id => {
                    const r = document.getElementById(id).getBoundingClientRect();
                    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
                };
                return { pad: rect('direction_pad'), canvas: rect('dungeon'), dock: rect('dcss_quick_dock'),
                    visible: getComputedStyle(document.getElementById('direction_pad')).visibility,
                    targets: [...document.querySelectorAll('#direction_pad .direction-pad-button')].map(element => {
                        const r = element.getBoundingClientRect(); return { width: r.width, height: r.height };
                    }) };
            });
            assert.equal(layout.visible, 'visible');
            assert(layout.pad.left >= layout.canvas.left && layout.pad.top >= layout.canvas.top);
            assert(Math.abs(layout.canvas.right - layout.pad.right - 10) < 2);
            assert(Math.abs(layout.canvas.bottom - layout.pad.bottom - 10) < 2);
            assert(layout.pad.bottom < layout.dock.top);
            assert(layout.targets.every(target => target.width >= 44 && target.height >= 44));
            evidence.layouts.push({ width, height, ...layout });
            await page.screenshot({ path: path.join(output, `direction-pad-${width}.png`) });
        }
        await page.setViewportSize({ width: 1440, height: 900 }); await settle();
        await page.locator('#direction_pad').screenshot({ path: path.join(output, 'direction-pad.png') });
        // Find a known adjacent native floor, avoiding monsters and other heroes.
        const destinationHandle = await page.waitForFunction(directions => {
            const get = suffix => require(Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/' + suffix)));
            const state = window.crawl_party.state, hero = state.members.find(member => member.slot === state.controlled_slot);
            const map = get('map_knowledge'), enums = get('enums');
            let door = null;
            for (const [name, , , , dx, dy] of directions) {
                const x = hero.pos.x + dx, y = hero.pos.y + dy, cell = map.get(x, y);
                const occupied = cell.mon || state.members.some(member => member.pos?.x === x && member.pos?.y === y);
                if ([enums.MF_FLOOR, enums.MF_ITEM, enums.MF_STAIR_UP, enums.MF_STAIR_DOWN].includes(cell.mf)
                    && !occupied)
                    return { name, x, y, slot: hero.slot, before: { ...hero.pos }, turns: hero.turns };
                if (cell.mf === enums.MF_DOOR && !occupied)
                    door = { name, x, y, slot: hero.slot, before: { ...hero.pos }, turns: hero.turns, door: true };
            }
            return door;
        }, directions);
        const destination = await destinationHandle.jsonValue(); await destinationHandle.dispose();
        await page.locator('[data-direction="' + destination.name + '"]').click();
        if (destination.door) {
            await page.waitForFunction(destination => window.crawl_party.state.members.find(member => member.slot === destination.slot)
                .turns > destination.turns, destination);
            await ready();
            const entered = await page.evaluate(destination => {
                const hero = window.crawl_party.state.members.find(member => member.slot === destination.slot);
                return hero.pos.x === destination.x && hero.pos.y === destination.y;
            }, destination);
            if (!entered) await page.locator('[data-direction="' + destination.name + '"]').click();
        }
        await page.waitForFunction(destination => {
            const hero = window.crawl_party.state.members.find(member => member.slot === destination.slot);
            return hero.pos.x === destination.x && hero.pos.y === destination.y && hero.turns > destination.turns;
        }, destination);
        evidence.movement = destination;
        await ready();
        // A native menu disables the pad; closing it restores play.
        await page.keyboard.press('i');
        await page.waitForFunction(() => document.querySelectorAll('#direction_pad .direction-pad-button:disabled').length === 8);
        await page.keyboard.press('Escape'); await ready();
        await page.waitForFunction(() => document.querySelectorAll('#direction_pad .direction-pad-button:enabled').length === 8);
        assert.deepEqual(evidence.errors, []);
        evidence.success = true;
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, directions: evidence.routes.length, guards: evidence.guards.length,
            layouts: evidence.layouts.length, movement: destination.name, output }));
    } catch (error) {
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify(evidence, null, 2));
        await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 20000 }).catch(() => {});
        throw error;
    } finally {
        await page.evaluate(() => {
            if (window.directionOriginalSend && window.socket) window.socket.send = window.directionOriginalSend;
            if (window.crawl_party?.state) require('comm').send_message('library_save', { exit: true });
        }).catch(() => {});
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
