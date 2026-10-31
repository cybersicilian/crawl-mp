const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.join(__dirname, '../game_data/static');
function load(name, dependencies = {}, globals = {}) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
        ...globals, define(names, factory) {
            if (typeof names === 'function') { factory = names; names = []; }
            result = factory(...names.map(key => dependencies[key]));
        }
    });
    return result;
}
const enums = load('enums');
function fixture() {
    const cells = new Map(), pos = (x = 2, y = 3) => ({ x, y });
    const get = (x, y) => cells.get(x + ':' + y) || { visible: false };
    const tracker = load('encounter-feedback-model', { './enums': enums }).create({ get, visible: cell => cell.visible });
    const set = (x, y, extra = {}) => {
        const cell = { x, y, visible: true, flc: 0, mon: { id: 7, type: 10 }, t: { fg: 1 }, ...extra };
        cells.set(x + ':' + y, cell); return cell;
    };
    return { tracker, cells, set, pos, update: (...positions) => tracker.update(positions) };
}
const kinds = events => Array.from(events, event => event.kind);

test('native wound flags and flash colors drive qualitative impacts after a baseline', () => {
    const f = fixture(), cell = f.set(2, 3);
    assert.deepEqual(kinds(f.update(f.pos())), []);
    cell.t.fg = [0xc0000001, 0]; cell.flc = 12;
    const events = f.update(f.pos());
    assert.deepEqual(kinds(events), ['strike', 'magic']);
    assert.equal(events[0].strength, 3);
    assert.equal(events[0].amount, undefined, 'wound bands are never converted to exact damage');
    assert.equal(events[1].colour, 12);
    assert.deepEqual(kinds(f.update(f.pos(), f.pos())), [], 'repeated cells/packets do not replay cues');
    cell.flc = 0; f.update(f.pos()); cell.flc = 12;
    assert.deepEqual(kinds(f.update(f.pos())), ['magic'], 'a later native flash can reuse its color');
});

test('monster identity follows movement in either cell order without aliasing packet objects', () => {
    for (const reversed of [false, true]) {
        const f = fixture(); f.set(2, 3); f.update(f.pos());
        f.set(2, 3, { mon: null }); f.set(3, 3, { t: { fg: [0x80000001, 0] } });
        const cells = [f.pos(), f.pos(3, 3)]; if (reversed) cells.reverse();
        const events = f.tracker.update(cells);
        assert.deepEqual(kinds(events), ['strike']);
        assert.equal(events[0].pos.x, 3);
        f.set(3, 3, { mon: { id: 7, type: 11 }, t: { fg: [0xc0000001, 1] } });
        assert.deepEqual(kinds(f.update(f.pos(3, 3))), [], 'shape changes establish a new identity baseline');
    }
});

test('hidden cells, new encounters, removals and unknown identities never invent hits or deaths', () => {
    const f = fixture();
    const cell = f.set(2, 3, { visible: false }); f.update(f.pos());
    cell.visible = true; cell.flc = 12; cell.t.fg = [0xc0000001, 1];
    assert.deepEqual(kinds(f.update(f.pos())), []);
    cell.visible = false; cell.t.fg = 1; cell.flc = 0; f.update(f.pos());
    cell.visible = true; cell.t.fg = [0xc0000001, 1]; cell.flc = 15;
    assert.deepEqual(kinds(f.update(f.pos())), [], 'returning visibility starts fresh');
    cell.mon = null;
    assert.deepEqual(kinds(f.update(f.pos())), [], 'disappearance is not proof of a kill');
    cell.mon = { id: 0, type: 10 }; cell.t.fg = 1; f.update(f.pos());
    cell.t.fg = [0xc0000001, 1];
    assert.deepEqual(kinds(f.update(f.pos())), []);
});

test('clears and bounded snapshot storage establish new baselines', () => {
    const f = fixture(); f.set(2, 3); f.update(f.pos()); f.tracker.reset();
    f.set(2, 3, { flc: 12, t: { fg: [0xc0000001, 1] } });
    assert.deepEqual(kinds(f.update(f.pos())), []);
    for (let x = 10; x < 16400; x++) {
        f.set(x, 3, { mon: null }); f.update(f.pos(x, 3));
    }
    f.set(2, 3, { flc: 15, t: { fg: [0xc0000001, 1] } });
    assert.deepEqual(kinds(f.update(f.pos())), [], 'evicted memory cannot manufacture a transition');
    assert.deepEqual(kinds(f.update(null, {}, { x: '2', y: 3 })), []);
});

test('target feedback uses the native cursor event and only targeting mode; cleanup is immediate', () => {
    const events = new Map(), played = [], removed = [];
    let enabled = false, targeting = false, clears = 0;
    const document = { hidden: false }, motion = { addEventListener(type, fn) { this.change = fn; } };
    const layer = { attach() {}, clear() { clears++; }, allowed: () => enabled,
        setEnabled(value) { enabled = value; }, play: values => played.push(...values), remove: key => removed.push(key) };
    const $ = () => ({ on(names, callback) {
        for (const name of names.split(' ')) events.set(name, callback);
        return this;
    } });
    load('encounter-feedback', { jquery: $, './enums': enums,
        './map_knowledge': { get: (x, y) => ({ x, y }), visible: cell => cell.x !== 9 },
        './game-context': { can_target: () => targeting }, './map-effect-layer': { create: () => layer },
        './encounter-feedback-model': { create: () => ({ reset() {}, update: () => [] }),
            position: pos => pos && Number.isInteger(pos.x) && Number.isInteger(pos.y) },
        './encounter-feedback-paint': () => {} }, { document, window: { matchMedia: () => motion } });
    const cursor = loc => events.get('map_cursor_changed.encounterFeedback')({}, { type: enums.CURSOR_MOUSE, loc });
    events.get('game_init.encounterFeedback')(); cursor({ x: 2, y: 3 });
    assert.equal(played.length, 0, 'ordinary hovering does not animate');
    targeting = true; cursor({ x: 2, y: 3 }); cursor({ x: 2, y: 3 });
    assert.equal(played.length, 1);
    assert.equal(played[0].kind, 'target');
    cursor(null); assert.equal(removed.at(-1), 'target');
    cursor({ x: 9, y: 3 }); assert.equal(played.length, 1);
    events.get('map_knowledge_cleared.encounterFeedback')();
    events.get('game_cleanup.encounterFeedback')();
    assert.equal(enabled, false); assert(clears >= 3);
});
