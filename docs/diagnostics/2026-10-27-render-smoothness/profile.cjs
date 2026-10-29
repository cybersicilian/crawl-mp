/* Actual native movement at Retina resolution, with isolated test accounts. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const { signInTestAccount } = require(path.join(root, 'crawl-ref/source/webserver/tests/helpers/test-account.cjs'));
const { ready } = require(path.join(root, 'crawl-ref/source/webserver/tests/multiplayer-native-client.cjs'));
const engine = process.env.QA_ENGINE || 'chromium';
const label = process.env.QA_LABEL || 'baseline';
const out = path.join(__dirname, label + '-' + engine);
const summary = values => {
    const sorted = values.toSorted((a, b) => a - b);
    return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))], max: sorted.at(-1) };
};

(async () => {
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
        ...(engine === 'webkit' ? {} : { channel: 'chrome' }) });
    const page = await browser.newPage({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(30000);
    const proof = { passed: false, errors: [], scenarios: [] };
    page.on('pageerror', error => proof.errors.push(error.message));
    let cdp;
    try {
        await page.goto('http://127.0.0.1:19028');
        await signInTestAccount(page, 'Smooth' + Date.now().toString(36), 'crawl');
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let index = 0; index < 4; index++) {
            const slot = page.locator('.party-slot-box[data-slot="' + index + '"]');
            if (index) await slot.locator('[data-mode="companion"]').click();
            await slot.locator('.party-slot-species').selectOption('Human');
            await slot.locator('.party-slot-job').selectOption('Fighter');
        }
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4);
        await ready(page);
        await page.mouse.move(1, 1);
        await page.evaluate(() => {
            const names = Object.keys(require.s.contexts._.defined);
            const get = suffix => require(names.find(name => name.endsWith('/' + suffix)));
            const stats = window.smoothProof = { handlers: {}, renders: [], frames: [], samples: [],
                rebuilds: 0, events: {}, timings: {}, last: null, running: true };
            const renderer = get('dungeon_renderer');
            const wrap = (object, method, key) => {
                const original = object[method];
                object[method] = function () {
                    const start = performance.now();
                    try { return original.apply(this, arguments); }
                    finally { (stats.timings[key] ||= []).push(performance.now() - start); }
                };
            };
            for (const [mod, method] of [['premium-light-field', 'forView'], ['premium-terrain', 'frame'],
                ['minimap', 'update_overlay'], ['minimap', 'fit_to'], ['monster_list', 'update']]) {
                try { wrap(get(mod), method, mod + '.' + method); } catch (ignored) {}
            }
            const render = renderer.render_view;
            renderer.render_view = function () {
                const start = performance.now(), result = render.apply(this, arguments);
                stats.renders.push({ ms: performance.now() - start, ...this.last_paint });
                return result;
            };
            const comm = require('comm'), handle = comm.handle_message;
            comm.handle_message = function (message) {
                const start = performance.now(), result = handle.apply(this, arguments);
                (stats.handlers[message.msg] ||= []).push(performance.now() - start);
                return result;
            };
            const $ = require('jquery');
            $(document).on('party_cards_rebuilding.smoothProof', () => stats.rebuilds++);
            for (const name of ['party_state_rendered', 'map_knowledge_changed', 'dungeon_tiles_changed'])
                $(document).on(name + '.smoothProof', () => stats.events[name] = (stats.events[name] || 0) + 1);
            document.addEventListener('keydown', event => {
                if (!['h', 'j', 'k', 'l', '.'].includes(event.key)) return;
                stats.pending = { start: performance.now(), turns: window.crawl_party.state.members[0].turns };
            }, true);
            $(document).on('party_state_rendered.smoothLatency', () => {
                if (!stats.pending || window.crawl_party.state.members[0].turns <= stats.pending.turns) return;
                const pending = stats.pending; stats.pending = null;
                requestAnimationFrame(() => stats.samples.push(performance.now() - pending.start));
            });
            function frame(time) {
                if (!stats.running) return;
                if (stats.last !== null) stats.frames.push(time - stats.last);
                stats.last = time; requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
            stats.environment = { canvas: [renderer.element.width, renderer.element.height],
                tiles: [renderer.cols, renderer.rows], dpr: devicePixelRatio };
        });
        if (engine === 'chromium') {
            cdp = await page.context().newCDPSession(page);
            await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
        }
        const direction = await page.evaluate(() => {
            const names = Object.keys(require.s.contexts._.defined);
            const get = suffix => require(names.find(name => name.endsWith('/' + suffix)));
            const map = get('map_knowledge'), enums = get('enums'), state = window.crawl_party.state;
            const own = state.members[0].pos;
            return [[-1, 0, 'h', 'l'], [1, 0, 'l', 'h'], [0, -1, 'k', 'j'], [0, 1, 'j', 'k']]
                .find(([dx, dy]) => { const cell = map.get(own.x + dx, own.y + dy);
                    return [enums.MF_FLOOR, enums.MF_ITEM].includes(cell.mf) && !cell.mon
                        && !state.members.some(hero => hero.pos?.x === own.x + dx && hero.pos?.y === own.y + dy);
                })?.slice(2) || ['.', '.'];
        });
        for (const mode of ['classic', 'premium']) {
            await page.evaluate(mode => require('visual-presentation').select(mode), mode);
            await page.waitForTimeout(500);
            const before = await page.evaluate(() => window.crawl_party.state.members[0].turns);
            for (let i = 0; i < 12; i++) {
                await page.locator('#dungeon').focus();
                const turns = await page.evaluate(() => window.crawl_party.state.members[0].turns);
                await page.keyboard.press(direction[i % 2]);
                await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, turns);
                await ready(page);
            }
            await page.waitForTimeout(1000);
            const captured = await page.evaluate(() => {
                const stats = window.smoothProof;
                const result = JSON.parse(JSON.stringify(stats));
                stats.renders = []; stats.handlers = {}; stats.frames = []; stats.samples = [];
                stats.rebuilds = 0; stats.events = {}; stats.timings = {}; stats.last = null;
                return result;
            });
            const after = await page.evaluate(() => window.crawl_party.state.members[0].turns);
            assert.equal(after, before + 12);
            proof.scenarios.push({ mode, before, after, ...captured });
        }
        const turns = await page.evaluate(() => window.crawl_party.state.members[0].turns);
        await page.locator('#dock_common_hotkeys').click();
        await page.locator('dialog[open]').waitFor();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        assert.equal(await page.evaluate(() => window.crawl_party.state.members[0].turns), turns);
        if (cdp) {
            const { profile } = await cdp.send('Profiler.stop');
            fs.writeFileSync(out + '.cpuprofile', JSON.stringify(profile));
        }
        await page.screenshot({ path: out + '.png' });
        await page.evaluate(() => window.smoothProof.running = false);
        assert.deepEqual(proof.errors, []);
        proof.passed = true;
    } catch (error) {
        proof.error = String(error.stack);
        await page.screenshot({ path: out + '-failure.png' }).catch(() => {});
        throw error;
    } finally {
        fs.writeFileSync(out + '.json', JSON.stringify(proof, null, 2));
        for (const scenario of proof.scenarios) console.log(JSON.stringify({ mode: scenario.mode,
            render: summary(scenario.renders.map(entry => entry.ms)), frames: summary(scenario.frames),
            input: summary(scenario.samples), rebuilds: scenario.rebuilds,
            handlers: Object.fromEntries(Object.entries(scenario.handlers).map(([key, values]) => [key, summary(values)])) }));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
