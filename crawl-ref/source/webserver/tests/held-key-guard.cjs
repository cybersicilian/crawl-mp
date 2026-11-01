/* Key auto-repeat must not stack multiplayer actions behind a waiting hero. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handlers = {};
const jquery = () => ({
    on(events, handler) {
        events.split(' ').forEach(name => { handlers[name.split('.')[0]] = handler; });
        return this;
    }
});
const enums = { mouse_mode: { COMMAND: 1, TARGET: 2 } };
const model = { controlledSlot: state => state.controlled_slot };
const context = vm.createContext({ window: {}, document: {} });
let guard;
context.define = (dependencies, factory) => { guard = factory(jquery, enums, model); };
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game_data/static/held-key-guard.js'), 'utf8'), context);

const state = hero => ({ multiplayer: true, controlled_slot: 1, members: [{ slot: 0, can_act: false, queued_action: 'input' }, { slot: 1, ...hero }] });
assert.equal(guard.ignored(state({ can_act: false }), true, true), true, 'A recovering hero ignores auto-repeat');
assert.equal(guard.ignored(state({ can_act: true, queued_action: 'input' }), true, true), true, 'One queued action is enough');
assert.equal(guard.ignored(state({ can_act: true }), true, true), false, 'Free movement keeps repeating');
assert.equal(guard.ignored(state({ can_act: false }), false, true), false, 'A fresh press still queues');
assert.equal(guard.ignored(state({ can_act: false }), true, false), false, 'Menus keep key repeat for scrolling');
assert.equal(guard.ignored({ ...state({ can_act: false }), multiplayer: false }, true, true), false, 'Solo play is unchanged');
assert.equal(guard.ignored(null, true, true), false);

function press(repeat) {
    const event = { originalEvent: { repeat }, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    handlers.game_keydown(event);
    return event;
}
context.window.crawl_party = { state: state({ can_act: false }) };
assert.equal(press(true).stopped, false, 'Input mode starts unknown, so keys pass through');
handlers.game_input_changed({}, enums.mouse_mode.COMMAND);
const held = press(true);
assert.equal(held.prevented && held.stopped, true, 'The native key never leaves the browser');
assert.equal(press(false).stopped, false);
handlers.game_cleanup();
assert.equal(press(true).stopped, false);
console.log('Held keys cannot stack multiplayer actions.');
