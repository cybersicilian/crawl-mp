const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); }
function fixture() {
    const handlers = new Map(), requests = [], accounts = new Map([['Aster', 'classic'], ['Rowan', 'classic']]);
    let user = 'Aster', selected = 'classic', hold = false, release, fail = false, preferences;
    const $ = () => ({ on(names, fn) {
        names.split(' ').forEach(name => {
            const key = name.split('.')[0]; handlers.set(key, [...(handlers.get(key) || []), fn]);
        });
    }, trigger(name, args = []) { (handlers.get(name) || []).forEach(fn => fn({}, ...args)); } });
    const document = { cookie: '_xsrf=fixture', addEventListener() {} };
    const pack = { bindUser() { selected = 'classic'; }, select(value) { selected = value; }, preview(value) { selected = value; } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/scripts/appearance-preferences.js'), 'utf8'), {
        document, window: { addEventListener() {} }, fetch(url, options = {}) {
            if (!options.method) return Promise.resolve({ ok: true, json: async () => ({ username: user, texture_pack: accounts.get(user) }) });
            const owner = options.headers['X-Profile-User'], value = JSON.parse(options.body).texture_pack;
            requests.push({ owner, value });
            const finish = () => {
                if (fail || owner !== user) return { ok: false };
                accounts.set(owner, value);
                return { ok: true, json: async () => ({ username: owner, texture_pack: value }) };
            };
            if (hold) { hold = false; return new Promise(resolve => { release = () => resolve(finish()); }); }
            return Promise.resolve(finish());
        }, define(deps, factory) {
            const modules = { jquery: $, 'texture-pack': pack, 'graphics-preferences': { snapshot: () => ({ username: null }) } };
            preferences = factory(...deps.map(key => modules[key]));
        }
    });
    return { preferences, requests, accounts, selected: () => selected,
        hold() { hold = true; }, release() { release(); }, fail() { fail = true; }, user(value) { user = value; },
        socket(data) { $(document).trigger('profile_appearance_received', [data]); } };
}
test('tilesets persist independently of effect settings and rapid changes keep the final choice', async () => {
    const f = fixture(), p = f.preferences;
    p.bindUser('Aster'); await settle();
    assert.equal(p.snapshot().selected, 'classic'); assert.equal(p.change('premium'), false);
    f.hold(); assert(p.change('illustrated')); await settle();
    assert.equal(f.selected(), 'illustrated'); assert.equal(p.snapshot().saving, true);
    assert(p.change('classic'));
    f.socket({ username: 'Aster', texture_pack: 'illustrated' });
    assert.equal(f.selected(), 'classic');
    f.release(); await settle();
    assert.equal(f.accounts.get('Aster'), 'classic'); assert.equal(p.snapshot().saving, false);
    assert.deepEqual(f.requests, [{ owner: 'Aster', value: 'illustrated' }, { owner: 'Aster', value: 'classic' }]);
});
test('a failed save restores the confirmed tileset and exposes an error', async () => {
    const f = fixture(), p = f.preferences;
    p.bindUser('Aster'); await settle(); p.change('illustrated'); await settle();
    f.fail(); p.change('classic'); assert.equal(f.selected(), 'classic'); await settle();
    assert.equal(f.selected(), 'illustrated'); assert.equal(p.snapshot().selected, 'illustrated');
    assert.match(p.snapshot().error, /^Could not save/);
});
test('account changes reject late saves and socket updates from the previous account', async () => {
    const f = fixture(), p = f.preferences;
    p.bindUser('Aster'); await settle(); f.hold(); p.change('illustrated'); await settle();
    f.user('Rowan'); p.bindUser('Rowan'); await settle(); f.release(); await settle();
    f.socket({ username: 'Aster', texture_pack: 'illustrated' });
    assert.equal(p.snapshot().username, 'Rowan'); assert.equal(f.selected(), 'classic');
    assert.equal(f.accounts.get('Rowan'), 'classic');
    p.bindUser(null); assert.equal(p.change('illustrated'), false);
});
test('unavailable account state disables edits and never leaves premium art enabled', async () => {
    const f = fixture(), p = f.preferences;
    p.bindUser('Aster'); await settle(); p.change('illustrated'); await settle();
    f.socket({ username: 'Aster', texture_pack: 'classic', available: false });
    assert.equal(p.snapshot().available, false); assert.equal(p.change('illustrated'), false);
    assert.equal(f.selected(), 'classic');
});
