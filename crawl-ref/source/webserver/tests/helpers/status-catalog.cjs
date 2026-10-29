/* All duration declarations, including hidden/legacy entries, for frame coverage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../../duration-data.h'), 'utf8');
const declarations = [...source.matchAll(/\{\s*(DUR_[A-Z_0-9]+),/g)];
module.exports = declarations.map((match, index) => {
    const block = source.slice(match.index + match[0].length, declarations[index + 1]?.index ?? source.length);
    const header = /^\s*(?:\/\/[^\n]*\n\s*)?([A-Z_0-9]+),\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"/.exec(block);
    assert(header, 'Unparsed native duration header: ' + match[1]);
    return { id: match[1], light: header[2], text: header[3] || header[2] || header[4],
        is_bad: /\bD_NEGATIVE\b/.test(block), dur: 7, desc: 'Native duration declaration: ' + match[1] };
});
