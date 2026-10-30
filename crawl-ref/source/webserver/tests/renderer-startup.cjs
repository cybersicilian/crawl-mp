/* Native settings arrive after game_init; early browser events must be safe. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = process.env.RENDERER_STATIC_ROOT || path.join(__dirname, '../game_data/static');

function fixture() {
    const events = new Map(), handlers = {}, intervals = new Map(), errors = [];
    let serial = 0, reads = 0, fast = false;
    const document = {}, window = { performance: { now: () => 250 } };
    const canvas = { id: 'dungeon', parentElement: { id: 'dungeon_viewport' } };
    function $(target) {
        return { 0: target === '#dungeon' ? canvas : target,
            attr() { return this; }, off() { return this; },
            on(names, callback) {
                names.split(' ').forEach(name => {
                    const event = name.split('.')[0];
                    if (!events.has(event)) events.set(event, []);
                    events.get(event).push(callback);
                });
                return this;
            },
            trigger(name) { emit(name); return this; }
        };
    }
    $.extend = Object.assign;
    $.Callbacks = () => {
        const callbacks = [];
        return { add: callback => callbacks.push(callback), fire: () => callbacks.forEach(callback => callback()) };
    };
    function emit(name) { (events.get(name) || []).forEach(callback => callback({})); }
    function BaseRenderer() {}
    BaseRenderer.prototype.init = function (element) { this.element = element; };
    const attach = { attach() {} };
    const modules = { jquery: $, comm: { register_handlers: values => Object.assign(handlers, values) },
        './cell_renderer': { DungeonCellRenderer: BaseRenderer },
        './map_knowledge': { get() { reads++; return { t: {} }; }, visible: () => false },
        './premium-effects': { fast: () => fast },
        './party-hover': attach, './traversal-effects': attach, './chain-view': attach,
        './shell-animation': attach, './hero-feedback': attach, './encounter-feedback': attach,
        './premium-movement': attach, './planned-route': attach };
    for (const name of ['options', 'dungeon_renderer']) {
        vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            document, window, console: { error: message => errors.push(message) },
            setInterval(callback, ms) { intervals.set(++serial, { callback, ms }); return serial; },
            clearInterval(id) { intervals.delete(id); }, clearTimeout(id) { intervals.delete(id); },
            define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep] || {})); }
        });
    }
    const options = modules['./options'], renderer = modules['./dungeon_renderer'];
    return { emit, options, renderer, intervals, errors, reads: () => reads,
        settings(enabled) { handlers.options({ options: { tile_realtime_anim: enabled } }); },
        fast(value) { fast = value; emit('premium_animation_cadence_changed'); } };
}

test('initialization, presentation changes and early map/text events wait for native settings', () => {
    const f = fixture();
    f.emit('game_preinit'); f.emit('game_init');
    f.renderer.cols = f.renderer.rows = 1;
    for (const event of ['visibilitychange', 'game_ui_changed', 'visual_presentation_changed',
        'premium_animation_cadence_changed', 'text_update']) f.emit(event);
    f.renderer.animate();
    assert.deepEqual(f.errors, [], 'No option reads before the server options packet');
    assert.equal(f.reads(), 0, 'Early animation cannot touch an uninitialized map');
    assert.equal(f.intervals.size, 0);
    f.settings(true);
    assert.equal(f.intervals.size, 1, 'The native options packet starts animation');
    assert.equal([...f.intervals.values()][0].ms, 250);
    [...f.intervals.values()][0].callback();
    assert.equal(f.reads(), 1);
    f.fast(true);
    assert.equal(f.intervals.size, 1, 'Cadence changes replace the existing interval');
    assert.equal([...f.intervals.values()][0].ms, 100);
    f.options.set('tile_realtime_anim', false);
    assert.equal(f.intervals.size, 0, 'Disabling real-time animation stops the idle loop');
    f.renderer.animate();
    assert.equal(f.reads(), 2, 'Turn-driven animation still works with real-time animation disabled');
    assert.deepEqual(f.errors, []);
});

for (const event of ['game_preinit', 'game_cleanup', 'game_connection_lost']) {
    test(event + ' stops animation and the next expedition waits for its own settings', () => {
        const f = fixture();
        f.emit('game_init'); f.settings(true);
        assert.equal(f.intervals.size, 1);
        f.emit(event); f.options.clear();
        f.emit('visibilitychange'); f.emit('text_update');
        assert.equal(f.intervals.size, 0);
        assert.deepEqual(f.errors, []);
        f.emit('game_init');
        assert.equal(f.intervals.size, 0);
        f.settings(false);
        assert.equal(f.intervals.size, 0, 'The new expedition keeps its disabled preference');
        f.options.set('tile_realtime_anim', true);
        assert.equal(f.intervals.size, 1);
    });
}
