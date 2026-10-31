/* Steady-state lobby and monster-list work is skipped when nothing changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scripts = path.join(__dirname, '../static/scripts');
const game = path.join(__dirname, '../game_data/static');

// Minimal chainable jQuery stand-in that counts list rebuilds and DOM writes.
function fakeJQuery(counters) {
    function wrap(selector) {
        if (selector && selector.api) return selector.api; // $(this) inside .each keeps identity
        const node = { selector, text: '' };
        const api = new Proxy({}, { get(_, name) {
            if (name === 'length') return 1;
            if (name === '0') return node;
            if (name === 'empty') return () => { counters.empty = (counters.empty || 0) + 1; return api; };
            if (name === 'text') return value => { if (value === undefined) return node.text; node.text = String(value); return api; };
            if (name === 'html') return value => { if (value === undefined) return node.text; counters.html = (counters.html || 0) + 1; node.text = value && value.text ? value.text() : String(value); return api; };
            if (name === 'data') return (key, value) => { if (value === undefined) return node['d_' + key]; node['d_' + key] = value; return api; };
            if (name === 'find' || name === 'closest') return () => api;
            if (name === 'each') return callback => { callback.call(node); return api; };
            if (name === 'toggle') return value => { counters.visible = value; return api; };
            return () => api;
        } });
        node.api = api;
        return api;
    }
    const $ = wrap; $.each = (values, callback) => values.forEach((value, i) => callback(i, value));
    return $;
}

// 1. Chronicle: identical data is not re-rendered; changed data is.
{
    const counters = {}; let chronicle;
    const state = { current_user: 'qa' };
    vm.runInNewContext(fs.readFileSync(path.join(scripts, 'client-chronicle.js'), 'utf8'), {
        JSON, String, Array, parseInt, Math, isNaN, document: { getElementById: () => null },
        define(deps, factory) { chronicle = factory(fakeJQuery(counters), { send_message() {} }, { decorate() {} })({}, state); }
    });
    const payload = { ghosts: [{ hero_name: 'Pilot' }], party_comps: [{ comp_name: 'Recipe', members: [] }], cool_items: [] };
    chronicle.handle_coop_chronicle(JSON.parse(JSON.stringify(payload)));
    assert.equal(counters.empty, 3, 'First render builds all three lists');
    chronicle.render_coop_chronicle();
    chronicle.handle_coop_chronicle(JSON.parse(JSON.stringify(payload)));
    assert.equal(counters.empty, 3, 'Identical rooms-frame and chronicle-frame renders do not rebuild the lists');
    state.current_user = null; chronicle.render_coop_chronicle(); state.current_user = 'qa'; chronicle.render_coop_chronicle();
    assert.equal(counters.empty, 3, 'Panel visibility changes alone do not rebuild the lists');
    chronicle.handle_coop_chronicle({ ...payload, cool_items: [{ item_name: 'Rune' }] });
    assert.equal(counters.empty, 6, 'New data rebuilds the lists');
}

// 2. Idle ticker: the label is rewritten only when its text changes.
{
    const counters = {}; let lobby;
    vm.runInNewContext(fs.readFileSync(path.join(scripts, 'client-lobby.js'), 'utf8'), {
        parseInt, Math, String, document: { getElementById: () => null }, setInterval: () => 0,
        define(deps, factory) { lobby = factory(fakeJQuery(counters), { send_message() {} }, () => {}, {}, { label: x => x }, {})({}, {}); }
    });
    const $ = fakeJQuery(counters);
    // Seed one cell at 300 s ("5m"); labels round to minutes, so the text
    // changes once at 330 s ("6m") and next at 390 s ("7m").
    const cellCounters = {}; const $cell = fakeJQuery(cellCounters)('.idle_time');
    $cell.data('time', 300); $cell.html(lobby.format_idle_time(300)); cellCounters.html = 0;
    // Drive update_lobby_idle_times against the seeded cell via a scoped jQuery.
    let ticker;
    vm.runInNewContext(fs.readFileSync(path.join(scripts, 'client-lobby.js'), 'utf8'), {
        parseInt, Math, String, document: { getElementById: () => null }, setInterval: () => 0,
        define(deps, factory) {
            const $scoped = selector => selector === '#player_list .idle_time' ? $cell : $(selector);
            $scoped.each = $.each;
            ticker = factory($scoped, { send_message() {} }, () => {}, {}, { label: x => x }, {})({}, {});
        }
    });
    for (let i = 0; i < 89; i++) ticker.update_lobby_idle_times();
    assert.equal(cellCounters.html, 1, 'Only the one real label change (5m -> 6m) rewrote the cell in 89 ticks');
    assert.equal($cell.text(), '6m');
    assert.equal($cell.data('time'), 389, 'The idle counter still advances every second');
    ticker.update_lobby_idle_times();
    assert.equal(cellCounters.html, 2, 'The label is rewritten when the text changes');
    assert.equal($cell.text(), '7m');
}

// 3. Lobby navigation ignores idle/milestone churn but not other mutations.
{
    let navigation;
    vm.runInNewContext(fs.readFileSync(path.join(scripts, 'lobby-navigation.js'), 'utf8'), {
        document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
        define(deps, factory) { navigation = factory(() => ({ ready() {} }), () => {}, {}, {}, {}); }
    });
    const idle = { nodeType: 1, closest: selector => selector.includes('.idle_time') ? idle : null };
    const text = { nodeType: 3, parentNode: idle };
    const row = { nodeType: 1, closest: () => null };
    assert.equal(navigation.ignores([{ target: idle }, { target: text }]), true);
    assert.equal(navigation.ignores([{ target: idle }, { target: row }]), false, 'Any other mutation still schedules an update');
    assert.equal(navigation.ignores([]), true);
}
console.log('Chronicle rebuilds, idle-cell rewrites and navigation wake-ups are limited to real changes.');
