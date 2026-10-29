const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function fixture(blocked = false) {
    const values = new Map(), events = [], listeners = {}, handlers = {};
    const storage = { getItem(key) { if (blocked) throw new Error('Private mode'); return values.get(key); },
        setItem(key, value) { if (blocked) throw new Error('Private mode'); values.set(key, value); } };
    let pack;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/texture-pack.js'), 'utf8'), {
        document: { documentElement: { dataset: {} } }, window: { localStorage: storage,
            addEventListener(name, fn) { listeners[name] = fn; } },
        define(deps, factory) { pack = factory(() => ({ trigger(name, data) { events.push([name, data[0]]); } }),
            { register_handlers(next) { Object.assign(handlers, next); } }); }
    });
    return { pack, values, events, handlers, listeners };
}
test('texture pack defaults to Classic and switching accounts cannot inherit another profile', () => {
    const f = fixture(); assert.equal(f.pack.current(), 'classic');
    f.pack.bindUser('Aster'); f.pack.select('illustrated'); assert(f.pack.illustrated());
    f.pack.bindUser('Rowan'); assert.equal(f.pack.current(), 'classic');
    f.handlers.profile_appearance({ username: 'Aster', texture_pack: 'illustrated' });
    assert.equal(f.pack.current(), 'classic');
    f.pack.bindUser('Aster'); assert(f.pack.illustrated());
    f.pack.bindUser(null); assert.equal(f.pack.current(), 'classic');
});
test('authenticated state and storage events apply immediately, ignore invalid values and avoid duplicate redraws', () => {
    const f = fixture(); f.pack.bindUser('Aster');
    f.handlers.profile_appearance({ username: 'ASTER', texture_pack: 'illustrated' });
    assert(f.pack.illustrated()); const count = f.events.length;
    f.pack.select('illustrated'); assert.equal(f.events.length, count);
    assert.equal(f.pack.select('injected-pack'), false); assert(f.pack.illustrated());
    f.listeners.storage({ key: 'dcss:texture-pack:rowan', newValue: 'classic' }); assert(f.pack.illustrated());
    f.listeners.storage({ key: 'dcss:texture-pack:aster', newValue: 'classic' }); assert.equal(f.pack.current(), 'classic');
    f.values.set('dcss:texture-pack:rowan', 'invalid'); f.pack.bindUser('Rowan'); assert.equal(f.pack.current(), 'classic');
});
test('blocked local storage retains profile-driven selection without failing rendering', () => {
    const f = fixture(true); f.pack.bindUser('Aster'); assert(f.pack.select('illustrated'));
    f.handlers.profile_appearance({ username: 'Aster', texture_pack: 'classic', available: false });
    assert.equal(f.pack.current(), 'classic');
});
