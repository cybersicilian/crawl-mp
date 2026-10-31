const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../game_data/static');
function fixture() {
    const events = [], timers = new Map(), sent = [], filters = [], modules = {};
    let sequence = 0, clickTools, watching = false, mode = 1;
    const member = { slot: 0, name: 'Hero', alive: true, place: 'D:1', pos: { x: 1, y: 1 },
        turns: 0, hp: 20, can_act: true, region_combat: true };
    const state = { controlled_slot: 0, combat_locked: true, plan_acknowledgements: true, members: [member], enemy_initiative: [] };
    const window = { crawl_party: { state } }, document = { getElementById: () => null };
    function emit(name, args = []) {
        for (const event of events.slice()) if (event.name.split('.')[0] === name) event.fn({}, ...args);
    }
    function $(target) {
        return { length: 0, remove() {}, appendTo() { return this; },
            on(names, selector, callback) {
                if (callback) { clickTools = callback; return this; }
                for (const name of names.split(' ')) events.push({ name, fn: selector }); return this;
            }, trigger(name, args) { emit(name, args); return this; } };
    }
    const comm = { register_send_filter(fn) { filters.push(fn); }, send_message(msg, packet) {
        if (filters.some(fn => fn(msg, packet) === false)) return false;
        sent.push({ msg, ...packet }); return true;
    } };
    const blocked = new Set();
    const map = { get(x, y) { return x >= 0 && y >= 0 && x < 80 && y < 80
        ? { t: {}, route_safe: !blocked.has(x + ',' + y) } : {}; }, visible: () => true };
    Object.assign(modules, { jquery: $, comm, client: { is_watching: () => watching }, key_conversion: { codes: {} },
        './game-context': { get_ui_state: () => 0, get_input_mode: () => mode },
        './enums': { ui: { NORMAL: 0 }, mouse_mode: { COMMAND: 1 }, prepare_bg_flags: value => value || {} },
        './party-model': { controlledSlot: data => data.controlled_slot,
            inCombat: (data, hero) => data.multiplayer && typeof hero.region_combat === 'boolean'
                ? hero.region_combat : Boolean(data.combat_locked) }, './map_knowledge': map,
        './workflow-actions': { reason: hero => hero.can_act ? '' : 'Recovery', setPlanning() {} } });
    for (const name of ['route-plan', 'tactical-planner']) {
        vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            window, document, console, setTimeout(fn) { timers.set(++sequence, fn); return sequence; },
            clearTimeout(id) { timers.delete(id); },
            define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    emit('game_init');
    const planner = modules['./tactical-planner'];
    return { planner, member, state, sent, blocked, comm, emit,
        tool(operation) { clickTools.call({ dataset: { plan: operation } }); },
        click(x, y, shiftKey = true) { return planner.click({ which: 1, shiftKey, cell: { x, y }, preventDefault() {} }); },
        acknowledge(x, y) { const id = sent.at(-1).plan_id; member.turns++; member.pos = { x, y };
            emit('party_state_rendered'); emit('game_command_boundary', [id, member.turns]); },
        set watching(value) { watching = value; }, set mode(value) { mode = value; } };
}
{
    const f = fixture();
    f.click(4, 1);
    assert.equal(f.sent.length, 0, 'Shift-click plans without spending a turn');
    assert.equal(f.planner.view().entries.length, 3);
    f.member.can_act = false; f.tool('run');
    assert.equal(f.sent.length, 0, 'Recovery holds the complete visible queue');
    f.member.can_act = true; f.emit('party_state_rendered');
    assert.equal(f.sent.length, 1, 'Exactly one action is sent');
    f.emit('party_state_rendered'); assert.equal(f.sent.length, 1, 'Unchanged snapshots cannot acknowledge input');
    f.emit('game_command_boundary', [999, 1]); assert.equal(f.sent.length, 1, 'Foreign or stale acknowledgements cannot release a planned action');
    f.acknowledge(2, 1); assert.equal(f.sent.length, 2);
    f.acknowledge(3, 1); assert.equal(f.sent.length, 3);
    f.acknowledge(4, 1);
    assert.equal(f.planner.view().entries.length, 0);
    assert.equal(f.planner.view().pending, null);
}
{
    const f = fixture(); f.member.cooldown_remaining_ms = 500;
    f.click(2, 1); f.tool('run');
    assert.equal(f.sent.length, 1, 'Server pacing is not duplicated by a timer restarted from a stale snapshot');
}
{
    const f = fixture(); f.click(4, 1); f.tool('run');
    f.blocked.add('3,1'); f.acknowledge(2, 1);
    assert.equal(f.sent.length, 1, 'A new obstacle pauses before another action');
    assert.match(f.planner.view().status, /Route changed/);
}
{
    const f = fixture(); f.click(4, 1); f.tool('run'); f.acknowledge(1, 2);
    assert.equal(f.sent.length, 1, 'Unexpected displacement invalidates the route');
    assert.equal(f.planner.view().entries.length, 0);
}
{
    const f = fixture(); f.tool('toggle');
    f.comm.send_message('input', { text: 'l' }); f.comm.send_message('input', { data: [46] });
    f.comm.send_message('power_action', { expected_slot: 0, id: 1, letter: 'a', kind: 'spell' });
    assert.equal(f.sent.length, 0);
    assert.equal(f.planner.view().entries.length, 3, 'Moves, waits and powers compose in order');
    f.tool('run'); f.acknowledge(2, 1); f.acknowledge(2, 1);
    assert.deepEqual(f.sent.map(entry => entry.msg), ['key', 'key', 'power_action']);
    f.emit('game_command_boundary', [f.sent.at(-1).plan_id, f.member.turns]);
    assert.equal(f.planner.view().pending, null, 'A canceled zero-turn spell does not strand the queue');
}
for (const interrupt of ['floor', 'control', 'damage', 'disconnect', 'error', 'new-enemy']) {
    const f = fixture(); f.click(4, 1); f.tool('run');
    if (interrupt === 'floor') f.member.place = 'D:2';
    if (interrupt === 'control') f.state.controlled_slot = 1;
    if (interrupt === 'damage') { f.member.hp--; f.member.turns++; f.member.pos = { x: 2, y: 1 }; }
    if (interrupt === 'new-enemy') f.state.enemy_initiative.push({ id: 4, name: 'Orc' });
    f.emit(interrupt === 'disconnect' ? 'game_connection_lost' : interrupt === 'error' ? 'game_action_error' : 'party_state_rendered');
    assert.equal(f.sent.length, 1, interrupt + ' never executes another queued action');
    assert.equal(f.planner.view().running, false);
}
{
    const f = fixture(); f.tool('toggle');
    for (let index = 0; index < 35; index++) f.comm.send_message('key', { keycode: 46 });
    assert.equal(f.planner.view().entries.length, 32);
    f.comm.send_message('key', { keycode: 27 });
    assert.equal(f.planner.view().entries.length, 0);
    assert.equal(f.sent[0].keycode, 27, 'Escape still reaches native prompts');
    f.watching = true;
    assert.equal(f.click(3, 1), false);
}
{
    const f = fixture();
    f.state.multiplayer = true;
    f.member.region_combat = false;
    assert.equal(f.click(5, 1, false), false, 'A safe outsider keeps native click-to-travel during another encounter');
    assert.equal(f.planner.view().entries.length, 0);
    f.member.region_combat = true;
    f.state.combat_locked = false;
    assert.equal(f.click(5, 1, false), true, 'Personal combat still enables the tactical click path');
    assert.equal(f.sent.length, 1);
}
console.log('Planning, FIFO dispatch, native recovery/prompt boundaries, interruption, ownership, limits and cancellation passed.');
