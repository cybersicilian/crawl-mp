const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const stop = require('./helpers/stop-child.cjs');
test('owned-child cleanup recognizes signal exits and bounds ignored termination', async () => {
    for (const ignore of [false, true]) {
        const script = (ignore ? 'process.on("SIGTERM",()=>{});' : '')
            + 'process.stdout.write("ready");setInterval(()=>{},1000);';
        const child = spawn(process.execPath, ['-e', script]); await once(child.stdout, 'data');
        const result = await stop(child, 30); assert.equal(result.forced, ignore);
        assert(child.exitCode !== null || child.signalCode !== null);
        assert.equal((await stop(child, 30)).forced, false);
    }
});
