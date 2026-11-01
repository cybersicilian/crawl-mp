const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./helpers/art-catalog-fixture.cjs');
const source = path.resolve(__dirname, '../..');
test('nine equipped armour defaults retain exact native selectors and separate attachment windows', () => {
    const m = load(), art = m['./environment-art'].armour, tiles = m['./tileinfo-player'];
    const cpp = fs.readFileSync(path.join(source, 'tilepick-p.cc'), 'utf8');
    const start = cpp.indexOf('tileidx_t tilep_equ_armour('), end = cpp.indexOf('tileidx_t tilep_equ_cloak(', start);
    const defaults = new Map(Array.from(cpp.slice(start, end).matchAll(/case\s+(ARM_[A-Z0-9_]+)\s*:\s*tile\s*=\s*TILEP_(BODY_[A-Z0-9_]+)\s*;/g), r => [r[1], r[2]]));
    const expected = ['ARM_LEATHER_ARMOUR','ARM_RING_MAIL','ARM_CHAIN_MAIL','ARM_SCALE_MAIL','ARM_PLATE_ARMOUR',
        'ARM_CRYSTAL_PLATE_ARMOUR','ARM_ANIMAL_SKIN','ARM_TROLL_LEATHER_ARMOUR','ARM_ROBE'];
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === art.id);
    assert.equal(regions.length, 9); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    for (const [n, entry] of art.entries.entries()) {
        assert.equal(entry.names[0], defaults.get(expected[n])); assert.equal(entry.variants, false);
        const index = tiles[entry.names[0]], info = tiles.get_tile_info(index), region = regions.find(r => r.tile === index);
        assert.equal(tiles.get_img(index), 'player'); assert.equal(region.fit, 'stretch');
        assert.deepEqual([region.x,region.y,region.w,region.h], [info.sx,info.sy,info.ex-info.sx,info.ey-info.sy]);
        assert.equal(region.preserveAlpha.length, 2);
        for (const [k, band] of region.preserveAlpha.entries()) {
            const [first, last] = art.alphaBands[k];
            assert.equal(band.y, Math.max(0, first-info.oy)); assert.equal(band.h, Math.min(region.h,last-info.oy)-band.y);
            assert.equal(band.w, region.w); assert.equal(band.x, 0);
        }
    }
    assert.equal(defaults.get('ARM_IRON_DRAGON_ARMOUR'), 'BODY_CRYSTAL_PLATE', 'Native iron/crystal alias is retained');
    assert.match(cpp.slice(start,end), /return tile \? tileidx_enchant_equ\(item, tile\) : 0;/);
});
test('robe colors, enchanted armour and special body forms keep independent identities', () => {
    const m = load(), art = m['./environment-art'].armour, tiles = m['./tileinfo-player'];
    const regions = m['./environment-sprites'].player.filter(r => r.sheet === art.id);
    assert.equal(tiles.tile_count(tiles.BODY_ROBE_NORMAL), 27);
    for (let n=1; n<27; n++) assert(!regions.some(r => r.tile === tiles.BODY_ROBE_NORMAL+n));
    for (const symbol of ['BODY_LEATHER_ARMOUR_MAGIC','BODY_RINGMAIL_RANDART','BODY_CHAINMAIL_MAGIC','BODY_SCALEMAIL_RANDART',
        'BODY_PLATE_MAGIC','BODY_CRYSTAL_PLATE_RANDART','BODY_ROBE_MISFORTUNE','BODY_ROBE_OF_NIGHT','BODY_DRAGONARM_RED','BASE_HUMAN']) {
        assert.equal(typeof tiles[symbol], 'number', symbol); assert(!regions.some(r => r.tile === tiles[symbol]), symbol);
    }
    const web = fs.readFileSync(path.join(source,'tileweb.cc'),'utf8');
    assert.match(web, /flags\[p\] == TILEP_FLAG_CUT_BOTTOM \? 18 : TILE_Y/);
});
