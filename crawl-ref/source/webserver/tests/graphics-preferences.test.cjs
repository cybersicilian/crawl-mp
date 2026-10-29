const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'static/graphics-settings.json')));
function load(name, deps, globals = {}) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'static/scripts', name + '.js'), 'utf8'), {
        ...globals, define(names, factory) { result = factory(...names.map(key => deps[key])); }
    }); return result;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); }
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
    const handlers = new Map(), windowHandlers = {}, writes = [], reads = [], accounts = new Map();
    const model = load('graphics-settings-model', {}); assert(model.configure(schema));
    const state = name => {
        if (!accounts.has(name)) accounts.set(name, { username: name, revision: 0, settings: model.defaults(), schema, available: true });
        return plain(accounts.get(name));
    };
    let currentUser = 'Aster', failWrite = false, holdWrite = false, release;
    const document = { cookie: '_xsrf=fixture', hidden: false, documentElement: { dataset: {} }, addEventListener() {} };
    const $ = () => ({ on(names, fn) {
        names.split(' ').forEach(name => {
            const key = name.split('.')[0]; handlers.set(key, [...(handlers.get(key) || []), fn]);
        }); return this;
    }, trigger(name, args = []) { (handlers.get(name) || []).forEach(fn => fn({}, ...args)); } });
    const window = { localStorage: { getItem() { return 'premium'; }, setItem() {} },
        addEventListener(name, fn) { windowHandlers[name] = fn; } };
    const globals = { document, window, fetch(url, options = {}) {
        if (options.method !== 'POST') { reads.push(currentUser); return Promise.resolve({ ok: true, json: async () => state(currentUser) }); }
        const patch = JSON.parse(options.body).changes, owner = options.headers['X-Profile-User']; writes.push({ owner, patch });
        const finish = () => {
            if (failWrite) return Promise.reject(new Error('Controlled network failure'));
            if (owner !== currentUser) return Promise.resolve({ ok: false });
            const before = state(owner), result = { ...before, settings: { ...before.settings, ...patch }, revision: before.revision + 1 };
            accounts.set(owner, result); return Promise.resolve({ ok: true, json: async () => plain(result) });
        };
        if (holdWrite) { holdWrite = false; return new Promise(resolve => { release = () => finish().then(resolve); }); }
        return finish();
    } };
    const comm = { register_handlers(value) { this.handlers = value; } };
    const theme = load('ui-theme', {}, globals);
    const prefs = load('graphics-preferences', { jquery: $, comm, 'graphics-settings-model': model, 'ui-theme': theme }, globals);
    const presentation = load('visual-presentation', { jquery: $, 'graphics-preferences': prefs, 'graphics-settings-model': model }, globals);
    return { prefs, presentation, model, state, writes, reads, comm, document,
        account(name) { currentUser = name; }, fail() { failWrite = true; },
        hold() { holdWrite = true; }, release() { release(); }, accounts, windowHandlers };
}
test('canonical schema validates presets and rejects unknown keys and invalid values', () => {
    const f = fixture();
    for (const preset of schema.presets) {
        const value = f.model.preset(preset.id); assert.deepEqual(plain(f.model.validate(value)), plain(value));
        assert.equal(f.model.matching(value), preset.id);
    }
    assert.equal(f.model.validate({ lighting: 1 }), null);
    assert.equal(f.model.validate({ motion: 'unlimited' }), null);
    assert.equal(f.model.validate({ ui_theme: 'unknown' }), null);
    assert.equal(f.model.validate({ username: 'Rowan' }), null);
    assert.equal(f.model.validate({ toString: 'invalid' }), null);
    assert.equal(f.model.validate([]), null);
});
test('UI themes persist separately from renderer presets and motion', async () => {
    const f = fixture(); f.prefs.bindUser('Aster', f.state('Aster')); await settle();
    assert.equal(f.document.documentElement.dataset.uiTheme, 'folio');
    assert(f.prefs.change({ ui_theme: 'dungeon', motion: 'reduced' })); await settle();
    assert.equal(f.presentation.current(), 'classic');
    assert.equal(f.model.matching(f.prefs.snapshot().settings), 'classic');
    for (const preset of schema.presets) {
        assert(f.presentation.select(preset.id)); await settle();
        assert.equal(f.document.documentElement.dataset.uiTheme, 'dungeon');
        assert.equal(f.prefs.snapshot().settings.motion, 'reduced');
        assert.equal(f.model.matching(f.prefs.snapshot().settings), preset.id);
    }
    assert.equal(f.state('Aster').settings.ui_theme, 'dungeon');
    assert.equal(f.state('Rowan').settings.ui_theme, 'folio');
    f.prefs.bindUser(null); assert.equal(f.document.documentElement.dataset.uiTheme, 'folio');
});
test('an unsaved theme rolls back and malformed theme identifiers fall back safely', async () => {
    const f = fixture(); f.prefs.bindUser('Aster', f.state('Aster')); await settle();
    assert(f.prefs.change({ ui_theme: 'contrast' })); await settle();
    assert.equal(f.document.documentElement.dataset.uiTheme, 'contrast');
    f.fail(); f.prefs.change({ ui_theme: 'dungeon' });
    assert.equal(f.document.documentElement.dataset.uiTheme, 'dungeon'); await settle();
    assert.equal(f.document.documentElement.dataset.uiTheme, 'contrast');
    assert(f.prefs.snapshot().error);
    assert.equal(f.model.normalize({ ui_theme: '<style>' }).ui_theme, 'folio');
});
test('Classic is the default; the former browser-only Premium preference cannot enable it', async () => {
    const f = fixture(); assert.equal(f.presentation.current(), 'classic');
    assert.equal(f.presentation.select('premium'), false);
    f.prefs.bindUser('Aster', f.state('Aster')); await settle();
    assert.equal(f.presentation.current(), 'classic');
    assert.equal(f.presentation.select('premium'), true); await settle();
    assert.equal(f.presentation.current(), 'premium'); assert(f.presentation.enabled('lighting'));
    assert.equal(f.state('Rowan').settings.mode, 'classic');
});
test('rapid edits apply immediately, serialize and persist the final choice', async () => {
    const f = fixture(); f.prefs.bindUser('Aster', f.state('Aster')); await settle();
    f.hold(); f.prefs.change({ mode: 'premium', lighting: true }); await settle();
    f.prefs.change({ mode: 'classic', lighting: false });
    assert.equal(f.presentation.current(), 'classic'); assert.equal(f.writes.length, 1);
    f.release(); await settle();
    assert.equal(f.writes.length, 2); assert.equal(f.state('Aster').settings.lighting, false);
    assert.equal(f.prefs.snapshot().saving, false);
});
test('failed save restores confirmed graphics rather than leaving an unsaved Premium state', async () => {
    const f = fixture(); f.prefs.bindUser('Aster', f.state('Aster')); await settle(); f.fail();
    f.prefs.change({ lighting: true, mode: 'premium' }); assert(f.presentation.enabled('lighting'));
    await settle(); assert.equal(f.presentation.current(), 'classic');
    assert(f.prefs.snapshot().error.startsWith('Could not save'));
});
test('sign-out and account switches clear graphics and reject late responses for a previous owner', async () => {
    const f = fixture(); f.prefs.bindUser('Aster', f.state('Aster')); await settle();
    f.hold(); f.presentation.select('premium'); await settle();
    f.account('Rowan'); f.prefs.bindUser('Rowan', f.state('Rowan')); f.release(); await settle();
    assert.equal(f.prefs.snapshot().username, 'Rowan'); assert.equal(f.presentation.current(), 'classic');
    assert.equal(f.prefs.receive({ ...f.state('Aster'), revision: 100 }), false);
    f.prefs.bindUser(null); assert.equal(f.presentation.current(), 'classic');
    assert.equal(f.prefs.change({ lighting: true }), false);
});
test('socket updates follow revision order and reduced motion is independent of the preset', async () => {
    const f = fixture(); f.prefs.bindUser('Aster', f.state('Aster')); await settle();
    const newer = { ...f.state('Aster'), revision: 3, settings: { ...f.model.preset('premium'), motion: 'reduced' } };
    f.comm.handlers.profile_graphics(newer);
    assert.equal(f.presentation.current(), 'premium'); assert.equal(f.presentation.animated(), false);
    f.comm.handlers.profile_graphics(f.state('Aster')); assert.equal(f.presentation.current(), 'premium');
    assert.equal(f.model.matching(newer.settings), 'premium');
});
