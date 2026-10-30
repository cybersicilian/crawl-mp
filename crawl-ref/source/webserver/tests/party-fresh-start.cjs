/* Saved-party actions use one guarded room command and preserve Resume. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../static/scripts/party-lobby-tools.js'), 'utf8');

function fixture() {
    let tools, accepted = true;
    const nodes = new Map(), sent = [], confirmations = [];
    class Element {
        constructor() { this.children = []; this.dataset = {}; this.events = {}; this.value = ''; }
        set id(value) { nodes.set(value, this); }
        get firstChild() { return this.children[0]; }
        append(...children) { this.children.push(...children); }
        appendChild(child) { this.append(child); }
        replaceChildren(...children) { this.children = children; }
        setAttribute() {}
        addEventListener(name, callback) { this.events[name] = callback; }
        after() {}
        click() { this.events.click(); }
    }
    nodes.set('party_room_view', { classList: { toggle() {} } });
    const document = {
        createElement() { return new Element(); },
        querySelectorAll() { return []; },
        querySelector() { return new Element(); },
        getElementById(id) { return nodes.get(id); },
        addEventListener() {}
    };
    vm.runInNewContext(source, {
        document, window: { addEventListener() {}, confirm(message) { confirmations.push(message); return accepted; } },
        define(dependencies, factory) {
            tools = factory({ register_handlers() {}, send_message(msg, data) {
                sent.push({ msg, ...JSON.parse(JSON.stringify(data)) }); return true;
            } }, { url() { return 'https://example.invalid/#lobby-room-Host'; } });
        }
    });
    const room = { room_id: 'room-Host', host: 'Host', status: 'staging', resume_id: 'saved-id', visibility: 'private',
        slots: [{ username: 'Host' }, { username: '' }] };
    return { tools, room, sent, confirmations, nodes, reject() { accepted = false; },
        button() { return nodes.get('party_new_expedition'); } };
}

test('host starts a fresh party in one action while retaining the exact checkpoint identity', () => {
    const f = fixture(); f.tools.render(f.room, 'hOsT');
    assert.equal(f.button().hidden, false);
    assert.equal(f.button().textContent, 'New expedition');
    f.button().click();
    assert.deepEqual(f.sent, [{ msg: 'party_room_create', room_id: 'room-Host', replace_save: 'saved-id',
        hero_name: 'hOsT', visibility: 'private', friendly_fire: true }]);
    assert.equal(f.confirmations.length, 0, 'An unoccupied lobby needs no confirmation');
    assert.equal(f.room.resume_id, 'saved-id', 'The client waits for authoritative replacement');
});

test('releasing friends requires confirmation and cancellation sends nothing', () => {
    const f = fixture(); f.room.slots[1].username = 'Guest'; f.tools.render(f.room, 'Host');
    f.reject(); f.button().click();
    assert.equal(f.confirmations.length, 1); assert.deepEqual(f.sent, []);
    assert.match(f.confirmations[0], /saved expedition will remain in Saved/);
});

test('confirmed replacement sends one command without a separate leave or save deletion', () => {
    const f = fixture(); f.room.slots[1].username = 'Guest'; f.tools.render(f.room, 'Host');
    f.button().click(); assert.equal(f.confirmations.length, 1); assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].msg, 'party_room_create');
});

test('guests cannot use the host action', () => {
    const f = fixture(); f.tools.render(f.room, 'Guest');
    assert.equal(f.button().hidden, true); f.button().click(); assert.deepEqual(f.sent, []);
});

test('fresh and active rooms do not offer checkpoint replacement', () => {
    for (const changes of [{ resume_id: undefined }, { status: 'launching' }, { status: 'launched' }]) {
        const f = fixture(); Object.assign(f.room, changes); f.tools.render(f.room, 'Host');
        assert.equal(f.button().hidden, true); f.button().click(); assert.deepEqual(f.sent, []);
    }
});

test('leaving a saved room clears its available action', () => {
    const f = fixture(); f.tools.render(f.room, 'Host'); f.tools.render(null, 'Host');
    assert.equal(f.button().hidden, true); f.button().click(); assert.deepEqual(f.sent, []);
});
