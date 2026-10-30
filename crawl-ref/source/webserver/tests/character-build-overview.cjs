const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.textContent = ''; }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    text() { return [this.textContent, ...this.children.map(child => child.text())].join(' '); }
}
let overview;
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../static/scripts/character-build-overview.js'), 'utf8'), {
    define(factory) { overview = factory(); }, document: { createElement: tag => new Node(tag) }
});
let panel;
const fields = { before(node) { panel = node; } };
const card = { querySelector(selector) { return selector === '.build-overview' ? panel : fields; } };
const build = { species: { name: 'Eldritch', abbr: 'Ed', traits: ['Can profane altars.'], recommended: ['Fighter'] },
    job: { name: 'Fighter', abbr: 'Fi', recommended: [] } };
overview.refresh(card, build, { key: 'a', status: 'loading' });
assert.match(panel.text(), /Preparing the native starting sheet/);
assert.match(panel.text(), /Recommended pairing/);
const snapshot = { hp: 20, mp: 2, ac: 4, ev: 9, sh: 3, str: 12, int: 8, dex: 10,
    skills: { Fighting: 3 }, skill_details: { Fighting: { aptitude: 1 } },
    inventory: [{ name: 'war axe' }], memorized: [] };
overview.refresh(card, build, { key: 'a', status: 'ready', snapshot });
assert.match(panel.text(), /HP\s+20\s+MP\s+2/);
assert.match(panel.text(), /Can profane altars/);
assert.match(panel.text(), /Fighting 3 \(apt \+1\)/);
assert.match(panel.text(), /war axe/);
assert.doesNotMatch(panel.text(), /Preparing/);
overview.refresh(card, build, { key: 'b', status: 'error' });
assert.match(panel.text(), /temporarily unavailable/);
assert.doesNotMatch(panel.text(), /HP\s+20\s+MP\s+2/);
console.log('Character overview reflects native preview state and selection.');
