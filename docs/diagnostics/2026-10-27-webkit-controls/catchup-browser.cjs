/* Compare the actual transport on both engines under a bounded update backlog. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const native = require('./native-candidate.cjs');
const out = __dirname;
const baseline = JSON.parse(fs.readFileSync(path.join(out, 'production-baseline.json'), 'utf8'));
const before = baseline.files['webserver/static/scripts/client-transport.js'].text;
const after = fs.readFileSync(path.join(out, '../../../crawl-ref/source/webserver/static/scripts/client-transport.js'), 'utf8');
const proof = { passed: false, comparisons: [] };

async function measure(browser, source) {
    const page = await browser.newPage();
    try {
        await page.setContent('<button>Native control</button>');
        return await page.evaluate(source => new Promise(resolve => {
            let create, listener, client, timerAt, frameAt;
            const received = [], start = performance.now();
            const jquery = () => ({});
            const comm = {
                register_handlers() {}, register_send_listener(callback) { listener = callback; },
                handle_message_immediately() { return false; },
                handle_message(message) {
                    if (message.msg === 'delay') { client.delay(message.t); return; }
                    if (message.msg === 'complete') {
                        setTimeout(() => resolve({ sendMs, timerMs: timerAt - start,
                            frameMs: frameAt - start, received, totalMs: performance.now() - start }), 25);
                        return;
                    }
                    received.push(message.sequence);
                    // Model the measured per-update browser work without relying
                    // on an unstable host speed or a particular graphics profile.
                    const until = performance.now() + 3;
                    while (performance.now() < until) { /* bounded UI work */ }
                }
            };
            window.requirejs = {};
            window.define = (deps, factory) => create = factory(jquery, comm, { cancel() {} },
                () => ({}), () => ({ reset() {} }), () => {});
            (0, eval)(source);
            client = create({}, {});
            const messages = [{ msg: 'delay', t: 1000 }];
            for (let sequence = 0; sequence < 96; sequence++) {
                messages.push({ msg: 'work', sequence });
                if (sequence % 8 === 0) messages.push({ msg: 'delay', t: 1000 });
            }
            messages.push({ msg: 'complete' });
            client.enqueue_messages(JSON.stringify({ msgs: messages }));
            setTimeout(() => timerAt = performance.now(), 0);
            requestAnimationFrame(() => frameAt = performance.now());
            const sendStart = performance.now(); listener('key');
            const sendMs = performance.now() - sendStart;
        }), source);
    } finally { await page.close(); }
}

(async () => {
    for (const engine of ['webkit', 'chromium']) {
        const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
            ...(engine === 'webkit' ? {} : { channel: 'chrome' }) });
        try {
            const old = await measure(browser, before), current = await measure(browser, after);
            const expected = Array.from({ length: 96 }, (_, index) => index);
            assert.deepEqual(old.received, expected); assert.deepEqual(current.received, expected);
            assert(old.sendMs > 200, 'The previous catch-up path must reproduce the blocking work');
            assert(current.sendMs < 50 && current.sendMs < old.sendMs / 4,
                'Input must regain control after one bounded slice');
            assert(current.timerMs < 100 && current.frameMs < old.frameMs,
                'Browser events and paints must run during catch-up');
            proof.comparisons.push({ engine, before: old, after: current });
            console.log(engine, JSON.stringify({ before: old.sendMs, after: current.sendMs,
                firstTimerBefore: old.timerMs, firstTimerAfter: current.timerMs }));
            if (engine === 'webkit') proof.native = await native(browser, after);
        } finally { await browser.close(); }
    }
    proof.passed = true;
})().catch(error => { proof.error = String(error.stack); console.error(error); process.exitCode = 1; })
    .finally(() => fs.writeFileSync(path.join(out, 'catchup-result.json'), JSON.stringify(proof, null, 2)));
