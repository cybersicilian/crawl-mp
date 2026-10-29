const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture() {
    let now = 0, module, serial = 0, normal = 0;
    const events = new Map(), timers = new Map(), calls = [], redraws = [];
    const document = { hidden: false };
    const motion = { matches: false, addEventListener(name, callback) { this.change = callback; } };
    const window = { performance: { now: () => now }, matchMedia: () => motion,
        clearTimeout: id => timers.delete(id),
        setTimeout(callback) { timers.set(++serial, callback); return serial; } };
    function $(element) {
        assert.equal(element, document);
        return { on(name, handler) { events.set(name, handler); return this; } };
    }
    const context = {};
    for (const name of ['save', 'restore', 'translate', 'rotate', 'scale', 'drawImage'])
        context[name] = (...args) => calls.push([name, ...args]);
    const renderer = { ctx: context, in_view: x => x >= 0 && x < 10,
        render_loc: (...args) => redraws.push(args), scaled_size: () => ({ width: 64, height: 64 }) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,
        '../game_data/static/shell-animation.js'), 'utf8'), {
        document, window, Image: class { complete = true; naturalWidth = 32; },
        define(deps, factory) { module = factory($, { toUrl: value => value },
            { get: (x, y) => ({ x, y }), visible: cell => cell.x !== 9 }); }
    });
    module.attach(renderer);
    const hero = (retracted, extra = {}) => ({ slot: 0, pos: { x: 2, y: 3 },
        statuses: retracted ? [{ light: 'Shell' }] : [], ...extra });
    return { module, events, timers, calls, redraws, motion, document, renderer, hero,
        now: value => { now = value; },
        sync: members => events.get('party_state_rendered.shellAnimation')({}, { floor: 'D:1', members }),
        draw: (x = 2, y = 3) => module.draw(renderer, x, y, x * 64, y * 64, () => normal++),
        normal: () => normal };
}

test('native shell stance drives tuck, idle shell, and emerge animations', () => {
    const f = fixture();
    f.events.get('game_init.shellAnimation')();
    f.sync([f.hero(false)]);
    assert.equal(f.draw(), false);
    f.now(100);
    f.sync([f.hero(true)]);
    assert.equal(f.draw(), true);
    assert.equal(f.normal(), 1, 'tucking compresses the ordinary doll before replacing it');
    f.now(250);
    assert.equal(f.draw(), true);
    assert(f.calls.some(call => call[0] === 'drawImage'), 'retracted pose uses the shell sprite');
    assert.equal(f.module.draw(f.renderer, 2, 3, 128, 192, () => {}, false), false,
        'a stale party pose cannot draw a shell after the native actor has left the tile');
    assert(f.timers.size > 0, 'idle shell motion has a bounded redraw timer');
    f.sync([f.hero(false)]);
    assert.equal(f.draw(), true, 'emergence scales the ordinary doll back in');
    f.now(600);
    assert.equal(f.draw(), false);
    f.events.get('game_cleanup.shellAnimation')();
    assert.equal(f.timers.size, 0);
    assert.equal(f.draw(), false);
});

test('save-loaded poses and reduced motion render a still, fully retracted shell', () => {
    const f = fixture();
    f.events.get('game_init.shellAnimation')();
    f.motion.matches = true;
    f.sync([f.hero(true)]);
    assert.equal(f.draw(), true);
    assert.equal(f.normal(), 0);
    assert.equal(f.timers.size, 0);
    assert(f.calls.some(call => call[0] === 'rotate' && call[1] === 0));
    f.sync([f.hero(true, { pos: { x: 9, y: 3 } })]);
    assert.equal(f.draw(9, 3), false, 'unseen heroes never gain a visual shell');
    f.sync([f.hero(true, { on_same_level: false })]);
    assert.equal(f.draw(), false);
});

test('a dash hides the destination doll until the rolling shell arrives', () => {
    const f = fixture();
    f.events.get('game_init.shellAnimation')();
    f.sync([f.hero(true)]);
    f.module.roll(0, 300);
    f.sync([f.hero(false)]);
    f.now(100);
    assert.equal(f.draw(), true);
    assert.equal(f.normal(), 0);
    f.now(301);
    f.events.get('visibilitychange.shellAnimation')();
    assert.equal(f.draw(), true);
    assert.equal(f.normal(), 1, 'native auto-emergence appears once the roll finishes');
    f.document.hidden = true;
    f.events.get('visibilitychange.shellAnimation')();
    assert.equal(f.timers.size, 0);
});
