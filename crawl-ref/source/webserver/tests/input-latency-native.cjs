const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real keypress -> native response -> next UI frame in disposable localhost games. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18989';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.INPUT_LATENCY_PROOF || '/tmp/dcss-input-latency.json';
const count = Number(process.env.INPUT_LATENCY_SAMPLES || 12);
const summary = values => {
    const sorted = values.toSorted((a, b) => a - b);
    return { median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))],
        max: sorted.at(-1) };
};

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (!process.env.INPUT_LATENCY_COMPRESSION)
        await context.addCookies([{ name: 'no-compression', value: 'true', url }]);
    await context.addInitScript(() => {
        window.inputProof = { frames: [], samples: [], handlers: {}, bytes: 0 };
        const NativeSocket = window.WebSocket;
        window.WebSocket = class extends NativeSocket {
            constructor(...args) {
                super(...args);
                this.addEventListener('message', event => {
                    window.inputProof.frames.push(performance.now());
                    window.inputProof.bytes += typeof event.data === 'string' ? event.data.length : event.data.byteLength;
                });
            }
        };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    try {
        await page.goto(url);
        await signInTestAccount(page, 'InputQA' + Date.now().toString().slice(-9), 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] [data-mode='companion']`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return name && require(name).ready();
        });
        await page.evaluate(() => {
            const comm = require('comm'), handle = comm.handle_message;
            comm.handle_message = function (message) {
                const start = performance.now(), type = message.msg;
                const result = handle(message);
                (window.inputProof.handlers[type] ||= []).push(performance.now() - start);
                return result;
            };
            document.addEventListener('keydown', event => {
                window.inputProof.start = performance.now();
                window.inputProof.frameStart = window.inputProof.frames.length;
                window.inputProof.expectOpen = event.key === 'i';
                window.inputProof.pending = true;
            }, true);
            new MutationObserver(() => {
                const proof = window.inputProof;
                if (!proof.pending || Boolean(document.querySelector('#ui-stack > *')) !== proof.expectOpen) return;
                proof.pending = false;
                requestAnimationFrame(() => proof.samples.push({
                    response: proof.frames[proof.frameStart] - proof.start,
                    nextFrame: performance.now() - proof.start
                }));
            }).observe(document.getElementById('ui-stack'), { childList: true });
            window.inputProof.clock = window.crawl_party.state.world_aut_clock;
            window.inputProof.startupBytes = window.inputProof.bytes;
            window.inputProof.bytes = 0;
        });
        for (let index = 0; index < count * 2; index++) {
            const opening = index % 2 === 0;
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press(opening ? 'i' : 'Escape');
            await page.waitForFunction(length => window.inputProof.samples.length >= length, index + 1);
        }
        const evidence = await page.evaluate(() => window.inputProof);
        assert.equal(await page.evaluate(() => window.crawl_party.state.world_aut_clock), evidence.clock,
            'Menu latency measurements must not spend game turns');
        evidence.summary = { responseMs: summary(evidence.samples.map(sample => sample.response)),
            nextFrameMs: summary(evidence.samples.map(sample => sample.nextFrame)),
            handlers: Object.fromEntries(Object.entries(evidence.handlers).map(([key, values]) =>
                [key, { count: values.length, ...summary(values) }])) };
        evidence.errors = errors;
        // Controlled animation wait in the real client, followed by a real
        // inventory key and native response. This must not wait a full second.
        await page.evaluate(() => require('client').delay(1000));
        await page.keyboard.press('i');
        await page.waitForFunction(() => Boolean(document.querySelector('#ui-stack > *')));
        evidence.animationInterruptMs = await page.evaluate(() => performance.now() - window.inputProof.start);
        if (!process.env.INPUT_LATENCY_BASELINE)
            assert(evidence.animationInterruptMs < 500, 'Input must interrupt the one-second animation wait');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#ui-stack > *'));
        assert.deepEqual(errors, []);
        fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ ...evidence.summary, bytes: evidence.bytes,
            animationInterruptMs: evidence.animationInterruptMs }, null, 2));
    } catch (error) {
        fs.writeFileSync(output + '.failure.txt', await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
