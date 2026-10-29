const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real turn input, authoritative response and next-frame timing in disposable games. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { chromium, webkit } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18993';
const endpoint = new URL(url);
const live = endpoint.hostname === 'dcss.iancaltabiano.com' && endpoint.protocol === 'https:';
assert(['localhost', '127.0.0.1'].includes(endpoint.hostname)
    || (live && process.env.TURN_LATENCY_ALLOW_LIVE === '1'));
const output = process.env.TURN_LATENCY_PROOF || '/tmp/dcss-turn-latency.json';
const count = Number(process.env.TURN_LATENCY_SAMPLES || 16);
const summary = values => {
    const sorted = values.toSorted((a, b) => a - b);
    return { count: values.length, median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))], max: sorted.at(-1) };
};
const evidence = { url, engine: process.env.TURN_LATENCY_ENGINE || 'chromium', errors: [], samples: [] };
let browser, page, profiler;

(async () => {
    browser = await (evidence.engine === 'webkit' ? webkit : chromium).launch({ headless: true,
        ...(evidence.engine === 'webkit' ? {} : { channel: 'chrome' }) });
    const context = await browser.newContext({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 2 });
    if (!process.env.TURN_LATENCY_COMPRESSION)
        await context.addCookies([{ name: 'no-compression', value: 'true', url }]);
    await context.addInitScript(() => {
        window.turnProof = { frames: [], stateFrames: [], handlers: {}, samples: [], pending: null, longTasks: [] };
        const NativeSocket = window.WebSocket;
        window.WebSocket = class extends NativeSocket {
            constructor(...args) {
                super(...args);
                this.addEventListener('message', event => {
                    window.turnProof.frames.push({ at: performance.now(),
                        bytes: typeof event.data === 'string' ? event.data.length : event.data.byteLength });
                    if (typeof event.data === 'string' && event.data.includes('state_frame')) {
                        const batch = JSON.parse(event.data);
                        for (const message of batch.msgs || [batch])
                            if (message.msg === 'state_frame') window.turnProof.stateFrames.push({
                                full: Boolean(message.state), bytes: JSON.stringify(message).length });
                    }
                });
            }
        };
        if (PerformanceObserver.supportedEntryTypes?.includes('longtask'))
            new PerformanceObserver(list => window.turnProof.longTasks.push(...list.getEntries()
                .map(entry => ({ at: entry.startTime, duration: entry.duration }))))
                .observe({ type: 'longtask' });
    });
    page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await signInTestAccount(page, 'TurnQA' + Date.now().toString(36), crypto.randomBytes(8).toString('hex'));
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await page.evaluate(() => {
        const comm = require('comm'), handle = comm.handle_message;
        comm.handle_message = function (message) {
            if (message.msg === 'record_identity') window.turnProof.identity = message;
            return handle(message);
        };
    });
    await page.locator('#lobby_home [data-lobby-create]').click();
    for (let slot = 1; slot < 4; slot++)
        await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
    await page.locator('#btn_launch_party_room').click();
    await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    console.log('Disposable party ready:', evidence.engine, url);
    if (process.env.TURN_LATENCY_TRACE) {
        profiler = await context.newCDPSession(page);
        await profiler.send('Profiler.enable'); await profiler.send('Profiler.start');
    }
    await page.evaluate(() => {
        const comm = require('comm'), handle = comm.handle_message, $ = require('jquery');
        comm.handle_message = function (message) {
            const start = performance.now(), result = handle(message);
            (window.turnProof.handlers[message.msg] ||= []).push(performance.now() - start);
            return result;
        };
        document.addEventListener('keydown', event => {
            if (window.turnProof.recording === false
                || !['.', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            const state = window.crawl_party.state;
            const member = state.members.find(hero => hero.slot === state.controlled_slot);
            window.turnProof.pending = { start: performance.now(), frame: window.turnProof.frames.length,
                clock: member.aut_clock, pos: member.pos, key: event.key };
        }, true);
        $(document).on('party_state_rendered.turnProof', function (event, state) {
            const proof = window.turnProof, pending = proof.pending;
            if (!pending) return;
            const hero = state.members.find(member => member.slot === state.controlled_slot);
            if (hero.aut_clock === pending.clock) return;
            proof.pending = null;
            const handled = performance.now();
            requestAnimationFrame(() => proof.samples.push({ key: pending.key,
                response: proof.frames[pending.frame]?.at - pending.start,
                handled: handled - pending.start, nextFrame: performance.now() - pending.start,
                frames: proof.frames.length - pending.frame,
                bytes: proof.frames.slice(pending.frame).reduce((total, frame) => total + frame.bytes, 0),
                beforeClock: pending.clock, afterClock: hero.aut_clock, beforePos: pending.pos, afterPos: hero.pos }));
        });
        proofReset();
        function proofReset() { window.turnProof.frames = []; window.turnProof.handlers = {}; window.turnProof.longTasks = []; }
    });
    for (let index = 0; index < count; index++) {
        await page.evaluate(() => document.activeElement.blur());
        const key = await page.evaluate(index => {
            if (index % 2) return '.';
            const modules = require.s.contexts._.defined;
            const named = suffix => require(Object.keys(modules).find(name => name.endsWith('/' + suffix)));
            const map = named('map_knowledge'), enums = named('enums'), state = window.crawl_party.state;
            const own = state.members.find(hero => hero.slot === state.controlled_slot).pos;
            const walkable = [enums.MF_FLOOR, enums.MF_ITEM, enums.MF_STAIR_UP, enums.MF_STAIR_DOWN];
            const directions = [[-1, 0, 'ArrowLeft'], [1, 0, 'ArrowRight'], [0, -1, 'ArrowUp'], [0, 1, 'ArrowDown']];
            for (const [dx, dy, key] of directions) {
                const x = own.x + dx, y = own.y + dy, cell = map.get(x, y);
                if (walkable.includes(cell.mf) && !cell.mon
                    && !state.members.some(member => member.pos?.x === x && member.pos?.y === y)) return key;
            }
            return '.';
        }, index);
        await page.keyboard.press(key);
        await page.waitForFunction(length => window.turnProof.samples.length >= length, index + 1);
    }
    if (profiler) fs.writeFileSync(process.env.TURN_LATENCY_TRACE, JSON.stringify((await profiler.send('Profiler.stop')).profile));
    Object.assign(evidence, await page.evaluate(() => window.turnProof));
    evidence.summary = Object.fromEntries(['response', 'handled', 'nextFrame', 'bytes', 'frames']
        .map(key => [key, summary(evidence.samples.map(sample => sample[key]))]));
    evidence.handlerSummary = Object.fromEntries(Object.entries(evidence.handlers)
        .map(([key, values]) => [key, summary(values)]));
    assert(evidence.samples.every(sample => sample.afterClock > sample.beforeClock), 'Every sample must spend a native turn');
    assert(evidence.samples.some(sample => sample.beforePos.x !== sample.afterPos.x
        || sample.beforePos.y !== sample.afterPos.y), 'The measurements must include actual movement');
    const burstBefore = await page.evaluate(() => {
        window.turnProof.recording = false;
        return window.crawl_party.state.members.map(hero => ({ slot: hero.slot, turns: hero.turns }));
    });
    const burstStart = performance.now();
    for (let index = 0; index < 8; index++) await page.keyboard.press('.');
    await page.waitForFunction(turns => window.crawl_party.state.members[0].turns >= turns + 8, burstBefore[0].turns);
    const burstAfter = await page.evaluate(() => window.crawl_party.state.members.map(hero => ({ slot: hero.slot, turns: hero.turns })));
    assert.equal(burstAfter[0].turns, burstBefore[0].turns + 8, 'Eight rapid keys must produce exactly eight native turns');
    assert.deepEqual(burstAfter.slice(1), burstBefore.slice(1), 'Rapid keys preserve hero ownership');
    evidence.burst = { milliseconds: performance.now() - burstStart, before: burstBefore, after: burstAfter, keys: 8 };
    if (process.env.TURN_LATENCY_OPTIMIZED) {
        await page.waitForFunction(() => /\d+ ms/.test(document.getElementById('connection_quality')?.textContent));
        assert(await page.locator('#connection_quality').isVisible(), 'The ping indicator must be visible during gameplay');
        evidence.connection = await page.evaluate(() => ({ protocol: window.socket.protocol, extensions: window.socket.extensions,
            ping: document.getElementById('connection_quality').textContent,
            description: document.getElementById('connection_quality').getAttribute('data-tip-body') }));
        if (process.env.TURN_LATENCY_COMPRESSION) {
            assert.equal(evidence.connection.protocol, 'native-deflate-v1');
            assert.match(evidence.connection.extensions, /permessage-deflate/);
        }
        assert(evidence.stateFrames.some(frame => !frame.full), 'Real turns must use delta frames');
        const before = await page.evaluate(() => ({ clock: window.crawl_party.state.world_aut_clock,
            full: window.turnProof.stateFrames.filter(frame => frame.full).length }));
        await page.evaluate(() => require('comm').handle_message({ msg: 'state_frame', channel: 'party_state',
            revision: 999999, base: 999998, changes: [] }));
        await page.waitForFunction(full => window.turnProof.stateFrames.filter(frame => frame.full).length > full, before.full);
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), before.clock,
            'Repairing a delta baseline must not spend turns');
        evidence.deltaResync = true;
        evidence.statePayload = { full: summary(evidence.stateFrames.filter(frame => frame.full).map(frame => frame.bytes)),
            delta: summary(evidence.stateFrames.filter(frame => !frame.full).map(frame => frame.bytes)) };
        await page.screenshot({ path: output.replace(/\.json$/, '') + '.png' });
    }
    if (live) {
        const id = evidence.identity.game_id;
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        await page.waitForFunction(async id => {
            const game = await (await fetch('/api/library/games/' + id)).json();
            return game.status === 'saved' && game.loadable === true;
        }, id);
        evidence.saved = { gameId: id, loadable: true };
    }
    assert.deepEqual(evidence.errors, []);
    console.log(JSON.stringify({ summary: evidence.summary, handlers: evidence.handlerSummary, burst: evidence.burst,
        connection: evidence.connection, statePayload: evidence.statePayload }, null, 2));
})().catch(async error => {
    evidence.failure = error.stack;
    if (page) evidence.failureText = await page.locator('body').innerText().catch(() => 'Page unavailable');
    console.error(error); process.exitCode = 1;
}).finally(async () => {
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
