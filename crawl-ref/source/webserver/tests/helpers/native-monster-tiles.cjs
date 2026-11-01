/* Literal default tile declarations from the generated native monster table. */
const fs = require('node:fs');
const path = require('node:path');
function nativeMonsterTiles(sourcePath = path.resolve(__dirname, '../../../mon-data.h')) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const blocks = Array.from(source.matchAll(/^\{\r?\n\s*(MONS_[A-Z0-9_]+),/gm));
    const result = new Map();
    blocks.forEach((block, index) => {
        const body = source.slice(block.index, index + 1 < blocks.length ? blocks[index + 1].index : source.length);
        const tile = /\{\s*TILEP_(MONS_[A-Z0-9_]+)\s*\}/.exec(body);
        if (tile) result.set(block[1], tile[1]);
    });
    if (!result.size) throw new Error('Native monster tile declarations missing');
    return result;
}
module.exports = { nativeMonsterTiles };
