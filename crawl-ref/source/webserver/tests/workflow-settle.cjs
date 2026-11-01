/* The HUD shows busy only for a visible wait, while prompts and exact readiness stay immediate. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const NORMAL = 0, COMMAND = 1, TARGET = 2, MORE = 5;
const BUSY = 'Finish or cancel the current action first.';
const handlers = new Map();
let changes = 0, now = 0, timers = [], saveable = null;
const jquery = () => ({
    on(name, handler) { handlers.set(name, handler); return this; },
    trigger(name, values) {
        if (name === 'game_actions_changed') changes++;
        if (name === 'game_actions_settled') saveable = values[0];
        return this;
    },
    children() { return []; }
});
const advance = ms => {
    now += ms;
    timers.filter(timer => timer.at <= now).forEach(timer => { timers = timers.filter(entry => entry !== timer); timer.run(); });
};
const member = { slot: 0, alive: true };
let actions;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/workflow-actions.js'), 'utf8'), {
    document: { getElementById: () => null },
    window: { crawl_party: { state: { snapshot_version: 2, members: [member], active_slot: 0 } } },
    setTimeout(run, ms) { const timer = { run, at: now + ms }; timers.push(timer); return timer; },
    clearTimeout(timer) { timers = timers.filter(entry => entry !== timer); },
    define(_deps, factory) {
        actions = factory(jquery, { register_handlers() {} }, { is_watching: () => false },
            { mouse_mode: { NORMAL, COMMAND, TARGET, MORE } },
            { controlledSlot: () => 0, canControl: () => false, inCombat: () => false }, {}, {});
    }
});
const mode = value => handlers.get('game_input_changed.workflow')(null, value);

assert.equal(actions.reason(member), BUSY, 'Nothing is available before the first command prompt');
mode(COMMAND);
assert.equal(actions.reason(member), '');

// An auto-explore step: the mode drops and returns far faster than a viewer can read.
for (let step = 0; step < 50; step++) {
    mode(NORMAL);
    assert.equal(actions.ready(), false, 'Exact readiness still drops on every step');
    assert.equal(actions.reason(member), '', 'The HUD does not show a passing step as blocked');
    advance(40);
    mode(COMMAND);
    advance(40);
}
assert.equal(timers.length, 0, 'No pending dim survives the return to COMMAND');
assert.equal(saveable, true, 'Save buttons stay enabled through passing steps');

changes = 0;
mode(NORMAL);
advance(249);
assert.equal(actions.reason(member), '');
advance(1);
assert.equal(actions.reason(member), BUSY, 'A wait long enough to see does show as busy');
assert.equal(changes, 2, 'Refreshers hear both the mode change and the busy state');
assert.equal(saveable, false, 'Save buttons follow a visible wait');
mode(COMMAND);
assert.equal(actions.reason(member), '', 'Returning to COMMAND is immediate');

for (const prompt of [TARGET, MORE]) {
    mode(prompt);
    assert.equal(actions.reason(member), BUSY, 'Targeting and prompts block at once');
    mode(COMMAND);
}
mode(NORMAL);
mode(TARGET);
assert.equal(actions.reason(member), BUSY, 'A prompt during a passing step blocks at once');
assert.equal(timers.length, 0);
mode(COMMAND);

mode(NORMAL);
handlers.get('game_cleanup.workflow')();
assert.equal(actions.reason(member), BUSY, 'Cleanup ends the hold');
assert.equal(timers.length, 0, 'Cleanup leaves no timer behind');
console.log('Workflow settling hides passing steps and keeps prompts immediate.');
