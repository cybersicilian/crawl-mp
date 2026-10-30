/* Sidebar appearances follow the native equipment snapshot without rebuilding controls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.style = { setProperty() {} }; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    prepend(child) { child.parent = this; this.children.unshift(child); }
    replaceWith(child) { const siblings = this.parent.children; child.parent = this.parent; siblings[siblings.indexOf(this)] = child; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    querySelector(selector) {
        return this.children.find(child => (child.className || '').split(' ').includes(selector.slice(1))) || null;
    }
}
const card = new Element('div'); card.dataset.partySlot = '0';
const portraitContainer = new Element('div'); portraitContainer.className = 'party-portrait'; card.appendChild(portraitContainer);
// Card lookup in a browser searches descendants.
card.querySelector = function (selector) {
    return portraitContainer.querySelector(selector) || (selector === '.party-portrait' ? portraitContainer : null);
};
const document = {
    createElement(tag) { return new Element(tag); },
    querySelectorAll(selector) { return selector === '#party_hud .party-card' ? [card] : []; },
    getElementById() { return null; }
};
const catalog = { species: { Human: { tile: { src: '/human.png' } } } };
const icons = { icon() { const icon = new Element('span'); icon.className = 'tt-icon'; return icon; } };
let calls = 0;
const nativeArt = { create(data, label, className, fallback) {
    calls++; const frame = new Element('span'); frame.className = className;
    frame.data = data; frame.appendChild(fallback); return frame;
} };
const handlers = {};
function jquery() { return { on(event, callback) { handlers[event] = callback; } }; }
const hero = { slot: 0, name: 'Aster', species: 'New Species', job: 'New Class',
    equipment_profile: { portrait: { texture: 'player', layers: [{ sx: 1 }] } } };
const window = { crawl_party: { state: { members: [hero] } } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static/hud-polish.js'), 'utf8'), {
    document, window, WeakMap, JSON,
    define(deps, factory) { factory(jquery, catalog, icons, nativeArt); }
});
const render = handlers['party_state_rendered.hudPolish'];
render();
const button = card.querySelector('.hud-hero-medallion');
assert.ok(button);
assert.equal(button.querySelector('.hud-hero-appearance').data, hero.equipment_profile.portrait);
assert.equal(button.querySelector('.hud-hero-appearance').children[0].className, 'tt-icon');
assert.equal(calls, 1);
render(); assert.equal(calls, 1, 'unchanged snapshots do not repaint');
hero.equipment_profile.portrait = { texture: 'player', layers: [{ sx: 2 }] };
render();
assert.equal(card.querySelector('.hud-hero-medallion'), button, 'existing control and focus survive');
assert.equal(button.querySelector('.hud-hero-appearance').data.layers[0].sx, 2);
hero.species = 'Human'; delete hero.equipment_profile;
render();
assert.equal(button.querySelector('.hud-hero-appearance').children[0].src, '/human.png');
assert.equal(calls, 3);
handlers['texture_pack_changed.hudPolish']();
assert.equal(calls, 4, 'new atlas elements rebind existing portraits');
assert.equal(card.querySelector('.hud-hero-medallion'), button);
console.log('HUD portrait snapshot, refresh, and fallback checks passed');
