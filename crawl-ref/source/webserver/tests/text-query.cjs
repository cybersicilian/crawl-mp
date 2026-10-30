/* Literal local-search contract; no browser or game runtime. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let query;
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../static/scripts/text-query.js'), 'utf8'), {
    define(factory) { query = factory(); }
});
for (const [terms, content, expected] of [
    ['Lyra D:3', 'Amber expedition D:3 · Turn 42 Lyra Human Fighter', true],
    ['d:3 LYRA', 'Lyra Human Fighter at D:3', true],
    ['cafe', 'Café expedition', true],
    ['   lyra  \n  Fighter ', 'Lyra · Human Fighter', true],
    ['[fire] +2', 'A +2 sword [fire]', true],
    ['.*', 'Amber expedition', false],
    ['Lyra D:4', 'Lyra at D:3', false],
    ['', '', true],
    ['  ', null, true]
]) assert.equal(query.compile(terms)(content), expected, JSON.stringify({ terms, content }));
console.log('Text query: independent terms, ordering, case, diacritics, whitespace, literal punctuation, missing facts and empty query passed.');
