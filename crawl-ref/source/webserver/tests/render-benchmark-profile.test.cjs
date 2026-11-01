/* Profiling intervals must describe the measured frame, not setup or idle warming. */
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runScenario } = require('./render-benchmark.cjs');
function fixture(yieldBetweenFrames) {
    let now = 0;
    const window = { benchProf: {}, benchDraws: 0, benchYield: yieldBetweenFrames ? 1 : 0,
        benchModules: { './dungeon_renderer': { last_paint: { cells: 1 } }, './display': {}, './map_knowledge': {} },
        flushFrames() {} };
    const sandbox = { window, performance: { now: () => now },
        advance(ms) { now += ms; }, setTimeout(callback) {
            const entry = window.benchProf.idle || (window.benchProf.idle = { ms: 0, n: 0 });
            entry.ms += 1000; entry.n++; now += 1000; callback();
        } };
    return { evaluate: (callback, args) => vm.runInNewContext('(' + callback.toString() + ')', sandbox)(args) };
}
function preparedFrame(m, renderer, display, map, iteration) {
    const setup = window.benchProf.setup || (window.benchProf.setup = { ms: 0, n: 0 });
    setup.ms += 50; setup.n++; advance(50);
    return () => {
        const cost = iteration < 5 ? 100 : 5;
        const render = window.benchProf.render || (window.benchProf.render = { ms: 0, n: 0 });
        render.ms += cost; render.n++; advance(cost);
    };
}
test('stage totals and worst-frame attribution exclude setup, idle work and warmup', async () => {
    const result = await runScenario(fixture(true), 'controlled cost', preparedFrame, 3);
    assert.equal(result.median, 5); assert.equal(result.p90, 5); assert.equal(result.min, 5);
    assert.equal(result.prof.render, '5ms/1');
    assert.equal(result.prof.setup, undefined); assert.equal(result.prof.idle, undefined);
    assert.equal(result.worst.elapsed, 5); assert.equal(result.worst.top.render, '5ms/1');
    assert.equal(result.worst.top.setup, undefined); assert.equal(result.worst.top.idle, undefined);
});
test('attribution uses the same measured interval with no idle yield', async () => {
    const result = await runScenario(fixture(false), 'no idle', preparedFrame, 2);
    assert.equal(result.prof.render, '5ms/1'); assert.equal(result.prof.setup, undefined);
    assert.equal(result.worst.elapsed, result.median);
});
