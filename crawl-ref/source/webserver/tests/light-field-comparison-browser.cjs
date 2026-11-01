/* Exact complete-field comparison and interleaved CPU timing; no engine. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {chromiumLaunchOptions} = require('./helpers/browser-launch.cjs');
const fixture = require('./helpers/light-field-fixture.cjs');
const timing = require('./helpers/paired-timing.cjs');
const cases = require('./fixtures/light-field-golden.json');
const [beforePath, afterPath, output] = process.argv.slice(2);
assert(beforePath && afterPath && output);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage();
        const result = await page.evaluate(({before, after, inputs, benchmark, recordSource, timingSource}) => {
            const load = source => {
                let result;
                new Function('define', source)((_deps, factory) => {result = factory();});
                return result;
            };
            const modules = [load(before), load(after)];
            const record = eval('(' + recordSource + ')'), paired = eval('(' + timingSource + ')');
            const captured = inputs.map(input => {
                const map = new Map(input.cells.map(cell => [cell.x + ':' + cell.y, cell]));
                const original = JSON.stringify(input.cells);
                const outputs = modules.map(module => {
                    let reads = 0;
                    const field = module.create(input.view, (x, y) => {reads++; return map.get(x + ':' + y);}, input.limit);
                    if (reads !== input.cells.length) throw new Error('Read bounds changed');
                    return record(field, input.view);
                });
                if (outputs[0] !== outputs[1]) throw new Error('Field mismatch: ' + input.name);
                if (JSON.stringify(input.cells) !== original) throw new Error('Source mutation');
                return {name: input.name, field: outputs[1]};
            });
            const map = new Map(benchmark.cells.map(cell => [cell.x + ':' + cell.y, cell]));
            const operations = modules.map(module => () => {
                const field = module.create(benchmark.view, (x, y) => map.get(x + ':' + y), 32);
                return field.lights.length + field.lights.reduce((total, light) => total + light.receivers.length, 0);
            });
            return {captured, timing: paired(operations, 4, 12, 4)};
        }, {before: fs.readFileSync(beforePath, 'utf8'), after: fs.readFileSync(afterPath, 'utf8'),
            inputs: cases.map(item => ({...fixture.input(item), limit: item.limit, name: item.name})),
            benchmark: fixture.input({cols: 37, rows: 27, seed: 42, mode: 'walls'}),
            recordSource: fixture.record.toString(), timingSource: timing.toString()});
        result.captured.forEach((item, index) => {
            assert.equal(sha(item.field), cases[index].outputSha256, item.name);
            item.sha256 = sha(item.field); delete item.field;
        });
        const report = {passed: true, browser: await browser.version(), cases: result.captured,
            before: result.timing.results[0], after: result.timing.results[1], checksum: result.timing.checksum,
            beforeSha256: sha(fs.readFileSync(beforePath)), afterSha256: sha(fs.readFileSync(afterPath)),
            synthetic: true, nativeEngine: false, productionPerformance: false,
            benchmark: {cols: 37, rows: 27, limit: 32, seed: 42, mode: 'walls', samples: 12, batch: 4}};
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({passed: true, cases: report.cases.length,
            before: report.before.medianMs, after: report.after.medianMs}));
    } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
