const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../game_data/static');
function fixture() {
    const sent = [], drawn = [], timers = new Map(), documentEvents = [], dungeonEvents = {}, handlers = {};
    let sequence = 0, mode = 1, enabled = true, walker = 'engine', planned = null;
    const text = {}, hero = { slot: 0, pos: { x: 5, y: 5 } };
    window = { crawl_party: { state: { members: [hero] } } };
    function chain(selector) {
        return { length: selector.startsWith('<') || text.mounted ? 1 : 0, attr() { return this; }, prop() { return this; },
            find(inner) { return chain(inner); }, appendTo() { text.mounted = true; return this; },
            off() { return this; }, on(names, callback) {
                for (const name of names.split(' ')) {
                    const event = name.split('.')[0];
                    if (selector === 'document') documentEvents.push({ event, callback });
                    else dungeonEvents[event] = callback;
                } return this;
            }, text(value) { text[selector] = value; return this; } };
    }
    const $ = target => chain(target === documentNode ? 'document' : target);
    $.noop = () => {};
    const documentNode = { getElementById: () => ({}) };
    const modules = { jquery: $,
        comm: { send_message(msg, packet) { sent.push({ msg, ...packet }); return true; },
            register_handlers(entries) { Object.assign(handlers, entries); } },
        './map_knowledge': { get: (x, y) => ({ t: {}, feature_name: 'floor' }), visible: () => true },
        './workflow-actions': { reason: () => '', controlledSlot: () => 0 },
        './game-context': { can_target: () => false, get_input_mode: () => mode },
        './tactical-planner': { walker: () => mode === 1 ? walker : null, preview: () => planned },
        './route-plan': { equal: (a, b) => a && b && a.x === b.x && a.y === b.y },
        './planned-route': { preview(points) { drawn.push(points); } },
        './creature-roster-model': { harmless: () => false },
        'visual-presentation': { preference: () => enabled },
        './enums': { mouse_mode: { COMMAND: 1 } } };
    for (const name of ['travel-route', 'pointer-intent-model', 'pointer-intent']) {
        vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            window, document: documentNode, console, Math, Number, Boolean, String,
            setTimeout(fn) { timers.set(++sequence, fn); return sequence; },
            clearTimeout(id) { timers.delete(id); },
            define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    modules['./pointer-intent'].init();
    return { sent, drawn, text, hero, handlers,
        hover(x, y) { dungeonEvents.cell_hover({ cell: { x, y } }); },
        reply(id, route, one_step = false) { handlers.travel_route({ id, route, one_step }); },
        emit(name) { documentEvents.filter(entry => entry.event === name).forEach(entry => entry.callback()); },
        expire() { const pending = Array.from(timers.values()); timers.clear(); pending.forEach(fn => fn()); },
        set enabled(value) { enabled = value; }, set walker(value) { walker = value; },
        set planned(value) { planned = value; }, set mode(value) { mode = value; } };
}
const plain = value => JSON.parse(JSON.stringify(value));
{
    const f = fixture(); f.hover(8, 5);
    assert.deepEqual(f.sent.map(entry => [entry.msg, entry.x, entry.y]), [['travel_route', 8, 5]]);
    const before = f.drawn.length;
    f.reply(f.sent[0].id, [6, 6, 7, 6, 8, 5]);
    assert.deepEqual(plain(f.drawn.at(-1)), [{ x: 5, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 5 }],
        'The line is the engine route, not a line of its own');
    assert.equal(f.drawn.length, before + 1, 'The readout and line change once, on the answer');
    assert.equal(f.text['.pointer-left'], 'Walk here · 3 moves');
}
{
    const f = fixture(); f.enabled = false; f.hover(8, 5);
    assert.equal(f.sent.length, 0, 'With the setting off nothing is asked of the engine');
    assert.equal(f.drawn.at(-1), null);
    assert.equal(f.text['.pointer-left'], 'Walk here');
    f.enabled = true; f.emit('graphics_settings_changed');
    assert.equal(f.sent.length, 1, 'Turning it on applies under a still pointer');
    f.enabled = false; f.reply(f.sent[0].id, [6, 5]); f.emit('graphics_settings_changed');
    assert.equal(f.drawn.at(-1), null, 'Turning it off clears the line at once');
}
{
    const f = fixture(); f.walker = 'planner'; f.planned = [{ point: { x: 6, y: 6 } }, { point: { x: 7, y: 6 } }];
    f.hover(7, 6);
    assert.equal(f.sent.length, 0, 'A combat click is walked by the queue, so its route is what shows');
    assert.deepEqual(plain(f.drawn.at(-1)), [{ x: 5, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 6 }]);
}
{
    const f = fixture(); f.hover(6, 5); f.hover(7, 5); f.hover(8, 5);
    assert.equal(f.sent.length, 1, 'One question in flight at a time');
    f.reply(f.sent[0].id, [6, 5]);
    assert.equal(f.sent.length, 2);
    assert.equal(f.sent[1].x, 8, 'Tiles the pointer already left are skipped');
    assert.equal(f.drawn.filter(Boolean).length, 0, 'A stale answer is never drawn');
    f.reply(f.sent[1].id, [6, 5, 7, 5, 8, 5]);
    assert.equal(f.drawn.at(-1).length, 4);
}
{
    const f = fixture(); f.hover(8, 5); const first = f.sent[0].id;
    f.hero.pos = { x: 6, y: 5 }; f.emit('party_state_rendered');
    f.reply(first, [6, 5, 7, 5, 8, 5]); assert.equal(f.sent.length, 2, 'A moved hero asks again');
    f.reply(f.sent[1].id, [7, 5, 8, 5]);
    assert.deepEqual(plain(f.drawn.at(-1)), [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }]);
}
{
    const f = fixture(); f.hover(8, 5); f.expire();
    assert.equal(f.drawn.at(-1), null, 'Silence clears the line instead of leaving it wrong');
    f.emit('party_state_rendered');
    assert.equal(f.sent.length, 2, 'A dropped question is asked again when the game moves on');
}
{
    const f = fixture(); f.hover(8, 5); f.reply(f.sent[0].id, []);
    assert.equal(f.text['.pointer-left'], 'No known route');
    assert.equal(f.drawn.at(-1), null);
}
{
    const f = fixture(); f.hover(8, 5); f.reply(f.sent[0].id, [6, 5, 7, 5, 8, 5], true);
    assert.equal(f.text['.pointer-left'], 'Step toward here · 3 moves');
}
{
    const f = fixture(); f.mode = 0; f.hover(8, 5);
    assert.equal(f.sent.length, 0, 'Nothing is asked while the hero is already moving');
    f.mode = 1; f.emit('game_input_changed');
    assert.equal(f.sent.length, 1, 'The route returns under a still pointer when the hero stops');
}
{
    const f = fixture(); f.hover(8, 5); f.reply(f.sent[0].id, [6, 5, 7, 5, 8, 5]);
    f.emit('map_knowledge_changed');
    assert.equal(f.sent.length, 2, 'Discovery replans under a still pointer without moving the hero');
    f.reply(f.sent[1].id, [6, 6, 7, 6, 8, 5]);
    assert.deepEqual(plain(f.drawn.at(-1))[1], { x: 6, y: 6 });
    f.emit('map_knowledge_changed');
    const pending = f.sent.at(-1).id;
    f.emit('map_knowledge_cleared');
    assert.equal(f.drawn.at(-1), null, 'Changing levels clears the old route');
    f.reply(pending, [6, 5, 7, 5, 8, 5]);
    assert.equal(f.drawn.at(-1), null, 'An answer for a cleared map cannot restore its old route');
}
console.log('Hover routes follow the engine, current knowledge, the setting, and only the newest question.');
