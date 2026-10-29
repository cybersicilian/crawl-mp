/* Bursty native state events must render once from current state and cancel on cleanup. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let create, sequence = 0;
const frames = new Map();
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/frame-update.js'), 'utf8'), {
    define(deps, factory) { create = factory(); },
    window: {
        requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
        cancelAnimationFrame(id) { frames.delete(id); }
    }
});
function paint() {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback());
}
let state = 'busy';
const rendered = [];
const refresh = create(() => rendered.push(state));
refresh(); state = 'new hero'; refresh(); state = 'ready'; refresh();
assert.equal(frames.size, 1);
assert.deepEqual(rendered, []);
paint();
assert.deepEqual(rendered, ['ready'], 'A whole native turn uses the latest state without transient busy rebuilds');
refresh(); refresh.cancel(); paint();
assert.deepEqual(rendered, ['ready'], 'Cleanup discards stale work');
state = 'reconnected'; refresh(); paint();
assert.deepEqual(rendered, ['ready', 'reconnected']);
let calls = 0;
const reentrant = create(() => { if (++calls === 1) reentrant(); });
reentrant(); paint();
assert.equal(calls, 1);
assert.equal(frames.size, 1, 'A change during rendering gets a subsequent frame');
paint(); assert.equal(calls, 2);
const other = create(() => rendered.push('independent'));
refresh(); other(); refresh.cancel(); paint();
assert.equal(rendered.at(-1), 'independent', 'Cleanup of one surface preserves other scheduled surfaces');
console.log('Frame update coalescing, latest state, cleanup, reconnect and reentrancy passed');
