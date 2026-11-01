/* Compare two immutable bloom modules in one browser; timings are synthetic. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {chromiumLaunchOptions} = require('./helpers/browser-launch.cjs');
const fixtures = require('./fixtures/bloom-golden.json');
const pixels = require('./helpers/bloom-fixture.cjs');
const [beforePath, afterPath, output] = process.argv.slice(2);
assert(beforePath && afterPath && output);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage();
        const result = await page.evaluate(({before, after, fixtures}) => {
            const load = source => {
                let result;
                new Function('define', source)((_deps, factory) => { result = factory(); });
                return result;
            };
            const modules = [load(before), load(after)];
            const cases = fixtures.map(f => {
                const source = new Uint8ClampedArray(f.pixels), original = source.slice();
                const outputs = modules.map(m => m.bloom(source, f.width, f.height, f.padding));
                if (!source.every((v, n) => v === original[n])) throw new Error('Source mutation: ' + f.name);
                for (let n = 0; n < outputs[0].data.length; n++) {
                    if (outputs[0].data[n] !== outputs[1].data[n]) throw new Error('Pixel difference: ' + f.name);
                }
                return {name: f.name, width: outputs[1].width, height: outputs[1].height,
                    data: Array.from(outputs[1].data)};
            });
            const fixture = fixtures.find(f => f.width === 32 && f.mode === 'noise');
            const input = new Uint8ClampedArray(fixture.pixels), samples = [[], []];
            let checksum = 0;
            function run(index, count) {
                const start = performance.now();
                for (let n = 0; n < count; n++) {
                    const image = modules[index].bloom(input, 32, 32, 8);
                    checksum += image.data[(n * 173) % image.data.length];
                }
                return (performance.now() - start) / count;
            }
            run(0, 20); run(1, 20);
            // Alternate first position to share clock, engine and thermal drift.
            for (let round = 0; round < 16; round++) {
                for (const index of round % 2 ? [1, 0] : [0, 1]) samples[index].push(run(index, 20));
            }
            const stats = values => {
                const sorted = values.slice().sort((a, b) => a - b);
                return {medianMs: sorted[8], p90Ms: sorted[14], samplesMs: values};
            };
            return {cases, before: stats(samples[0]), after: stats(samples[1]), checksum};
        }, {before: fs.readFileSync(beforePath, 'utf8'), after: fs.readFileSync(afterPath, 'utf8'),
            fixtures: fixtures.map(f => ({...f, pixels: Array.from(pixels(f))}))});
        for (const [index, item] of result.cases.entries()) {
            assert.equal(sha(new Uint8ClampedArray(item.data)), fixtures[index].outputSha256, item.name);
            delete item.data;
        }
        const report = {passed: true, browser: await browser.version(), cases: result.cases,
            before: result.before, after: result.after, checksum: result.checksum,
            beforeSha256: sha(fs.readFileSync(beforePath)), afterSha256: sha(fs.readFileSync(afterPath)),
            synthetic: true, nativeEngine: false, productionPerformance: false};
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({passed: true, cases: report.cases.length,
            before: report.before.medianMs, after: report.after.medianMs}));
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
