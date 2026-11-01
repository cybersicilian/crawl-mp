/* Read the owning native tables; fixture offsets must not drift into guesses. */
const fs = require('node:fs');
const path = require('node:path');
function table(source, name) {
    const start = source.indexOf('bool mcache_monster::' + name + '(');
    if (start < 0) throw new Error('Missing native equipment table: ' + name);
    const end = source.indexOf('\n}\n', start);
    if (end < 0) throw new Error('Unterminated native equipment table: ' + name);
    const result = new Map();
    for (const group of source.slice(start, end).split(/\bbreak\s*;/)) {
        const x = /\*ofs_x\s*=\s*(-?\d+)\s*;/.exec(group);
        const y = /\*ofs_y\s*=\s*(-?\d+)\s*;/.exec(group);
        if (!x || !y) continue;
        for (const match of group.matchAll(/case\s+TILEP_(MONS_[A-Z0-9_]+)\s*:/g))
            result.set(match[1], { x: Number(x[1]), y: Number(y[1]) });
    }
    return result;
}
function nativeEquipment(names, sourcePath = path.resolve(__dirname, '../../../tilemcache.cc')) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const weapons = table(source, 'get_weapon_offset'), shields = table(source, 'get_shield_offset');
    return names.map(symbol => {
        const weapon = weapons.get(symbol);
        if (!weapon) throw new Error('No native weapon attachment for ' + symbol);
        return { symbol, weapon, shield: shields.get(symbol) || null };
    });
}
function nativeDefaultWeaponTiles(sourcePath = path.resolve(__dirname, '../../../tilepick-p.cc')) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const start = source.indexOf('tileidx_t tilep_equ_weapon('), end = source.indexOf('tileidx_t tilep_equ_shield(', start);
    if (start < 0 || end < start) throw new Error('Missing native equipped-weapon selector');
    return new Map(Array.from(source.slice(start, end).matchAll(/case\s+(WPN_[A-Z0-9_]+)\s*:\s*tile\s*=\s*TILEP_(HAND1_[A-Z0-9_]+)\s*;/g),
        match => [match[1], match[2]]));
}
function nativeForcedTwoHanded(sourcePath = path.resolve(__dirname, '../../../item-prop.cc')) {
    const source = fs.readFileSync(sourcePath, 'utf8'), defaults = nativeDefaultWeaponTiles();
    const rows = /\{\s*(WPN_[A-Z0-9_]+),\s*"[^"]*",\s*-?\d+,\s*-?\d+,\s*-?\d+,\s*SK_[A-Z0-9_]+,\s*SIZE_[A-Z0-9_]+,\s*NUM_SIZE_LEVELS\s*,/g;
    const symbols = new Set();
    for (const match of source.matchAll(rows)) {
        const symbol = defaults.get(match[1]);
        if (symbol) symbols.add(symbol);
    }
    if (!symbols.size) throw new Error('No literal native two-handed weapon rows found');
    return Array.from(symbols);
}
module.exports = { nativeEquipment, nativeDefaultWeaponTiles, nativeForcedTwoHanded };
