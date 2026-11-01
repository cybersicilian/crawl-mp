/* Deferred AMD controls execute the real workspace with an in-memory view. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = process.env.WORKSPACE_SOURCE_PATH || path.join(__dirname,
    '../game_data/static/first-person-workspace.js');

class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.listeners = {}; this.isConnected = true; }
    setAttribute() {}
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    querySelector() { return null; }
    remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    click() { (this.listeners.click || []).forEach(listener => listener({ stopPropagation() {} })); }
}

function fixture() {
    const state = { eligible: true, world: 'world-a', hero: 'hero-a', floor: 'D:1', revision: 0 };
    const calls = [], events = [], notices = [];
    let opens = 0, closes = 0, exported;
    const menu = {
        inputContext: () => state.eligible ? JSON.stringify([state.world, state.hero, state.floor, state.revision]) : null,
        open() { state.revision++; },
        close() { closes++; state.revision++; events.push('menu-close'); },
        isOpen: () => false, destroy() { events.push('menu-destroy'); }
    };
    const settings = { open() { opens++; events.push('settings-open'); } };
    const dependencies = {
        require(names, resolve, reject) { assert.deepEqual(Array.from(names), ['settings-dialog']); calls.push({ resolve, reject }); },
        './first-person-menu': { create(_host, options) { options.tools(new Element('section')); return menu; } },
        './workflow-actions': { notice(message) { notices.push(message); } }
    };
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
        document: { createElement: tag => new Element(tag) },
        define(names, factory) { exported = factory(...names.map(name => dependencies[name])); }
    }, { filename: source });
    const host = new Element('div'), toolbar = new Element('nav');
    const workspace = exported.create(host, toolbar, () => {}, () => {});
    const launchers = host.children.find(node => node.className === 'first-person-menu-launchers');
    const button = launchers.children.find(node => node.textContent === 'Settings');
    return { state, calls, events, notices, host, workspace, menu,
        click: () => button.click(), resolve: (index = 0) => calls[index].resolve(settings),
        reject: (index = 0) => calls[index].reject(new Error('fixture load failure')),
        counts: () => ({ opens, closes }) };
}

test('a successful deferred open closes inventory before using canonical Settings', () => {
    const f = fixture(); f.click();
    assert.deepEqual(f.counts(), { opens: 0, closes: 0 });
    f.resolve();
    assert.deepEqual(f.events, ['menu-close', 'settings-open']);
});

test('pending clicks coalesce and old completions cannot reopen or consume a newer request', () => {
    const f = fixture(); f.click(); f.click();
    assert.equal(f.calls.length, 1);
    f.resolve(); // The user subsequently closes Settings.
    f.resolve();
    assert.equal(f.counts().opens, 1);
    f.click(); assert.equal(f.calls.length, 2);
    f.resolve(0); assert.equal(f.counts().opens, 1);
    f.resolve(1); assert.equal(f.counts().opens, 2);
});

test('destroy invalidates a pending completion and stale button clicks', () => {
    const f = fixture(); f.click(); f.workspace.destroy(); f.resolve(); f.click();
    assert.deepEqual(f.counts(), { opens: 0, closes: 0 });
    assert.equal(f.calls.length, 1);
});

test('a detached view cannot request or finish opening Settings', () => {
    const before = fixture(); before.host.isConnected = false; before.click();
    assert.equal(before.calls.length, 0);
    const after = fixture(); after.click(); after.host.isConnected = false; after.resolve();
    assert.deepEqual(after.counts(), { opens: 0, closes: 0 });
});

test('foreign dialog, native popup or changed game eligibility prevents late open', () => {
    for (const reason of ['foreign-modal', 'native-popup', 'game-input-ineligible']) {
        const f = fixture(); f.click(); f.state.eligible = false; f.resolve();
        assert.deepEqual(f.counts(), { opens: 0, closes: 0 }, reason);
    }
});

test('world, hero, floor and user menu changes invalidate the captured context', () => {
    for (const change of [{ world: 'world-b' }, { hero: 'hero-b' }, { floor: 'D:2' }, { revision: 1 }]) {
        const f = fixture(); f.click(); Object.assign(f.state, change); f.resolve();
        assert.deepEqual(f.counts(), { opens: 0, closes: 0 }, JSON.stringify(change));
    }
});

test('unchanged eligibility does not cancel because an unrelated snapshot field changes', () => {
    const f = fixture(); f.click(); f.state.currentHealth = 20; f.resolve();
    assert.deepEqual(f.counts(), { opens: 1, closes: 1 });
});

test('an ineligible click does not start a module request', () => {
    const f = fixture(); f.state.eligible = false; f.click();
    assert.equal(f.calls.length, 0);
});

test('failed loading releases the request and allows a user retry', () => {
    const f = fixture(); f.click(); f.reject();
    assert.equal(f.notices.length, 1);
    assert.deepEqual(f.counts(), { opens: 0, closes: 0 });
    f.click(); assert.equal(f.calls.length, 2); f.resolve(1);
    assert.equal(f.counts().opens, 1);
});

test('a late failure cannot report into a destroyed or changed context', () => {
    const destroyed = fixture(); destroyed.click(); destroyed.workspace.destroy(); destroyed.reject();
    assert.equal(destroyed.notices.length, 0);
    const changed = fixture(); changed.click(); changed.state.world = 'world-b'; changed.reject();
    assert.equal(changed.notices.length, 0);
});
