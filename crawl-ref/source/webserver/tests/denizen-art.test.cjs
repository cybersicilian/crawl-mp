const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { nativeMonsterTiles } = require('./helpers/native-monster-tiles.cjs');
const load = require('./helpers/art-catalog-fixture.cjs');
for (const key of ['denizens', 'lair']) test('nine authored ' + key + ' replace live source-defined monster defaults with distinct native geometry', () => {
    const m = load(), catalog = m['./environment-art'][key], tiles = m['./tileinfo-player'];
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === catalog.id);
    const defaults = nativeMonsterTiles();
    assert.equal(regions.length, 9); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    for (const entry of catalog.entries) {
        const symbol = entry.names[0], index = tiles[symbol], region = regions.find(r => r.tile === index);
        assert.equal(defaults.get(symbol), symbol, entry.label); assert.equal(entry.variants, false);
        const yaml = fs.readFileSync(path.resolve(__dirname, '../../dat/mons', entry.label.toLowerCase().replaceAll(' ', '-') + '.yaml'), 'utf8');
        assert.equal(/^name:\s*"([^"]+)"/m.exec(yaml)?.[1], entry.label.toLowerCase());
        assert(!/cant_spawn|unfinished/.test(yaml), entry.label);
        assert(region, symbol); assert.equal(tiles.get_img(index), 'player');
        const info = tiles.get_tile_info(index);
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert.equal(region.preserveAlpha, null); assert.equal(region.mirror, false); assert.equal(region.fit, undefined);
        assert(region.sprite.x >= 0 && region.sprite.y >= 0);
        assert(region.sprite.x + region.sprite.w <= catalog.width && region.sprite.y + region.sprite.h <= catalog.height);
    }
    assert(!defaults.has('MONS_GIANT_COCKROACH'), 'removed cockroach is not a live ordinary default');
});
test('denizens do not alias species relatives, specialised blobs or undead appearances', () => {
    const m = load(), tiles = m['./tileinfo-player'];
    const all = m['./environment-sprites'].player.filter(r => r.sheet === m['./environment-art'].denizens.id);
    for (const symbol of ['MONS_EMPEROR_SCORPION', 'MONS_QUEEN_BEE', 'MONS_BLINK_FROG', 'MONS_CANE_TOAD',
        'MONS_BRAIN_WORM', 'MONS_ACID_BLOB', 'MONS_AZURE_JELLY', 'MONS_ROYAL_JELLY', 'MONS_WARG',
        'MONS_POLAR_BEAR', 'MONS_ZOMBIE_FROG', 'MONS_ZOMBIE_WORM', 'MONS_ZOMBIE_JELLY', 'BASE_HUMAN']) {
        const index = tiles[symbol]; assert.equal(typeof index, 'number', symbol);
        for (let n = 0; n < tiles.tile_count(index); n++) assert(!all.some(r => r.tile === index + n), symbol);
    }
});
test('Lair bodies retain species identities without aliasing dynamic or specialised relatives', () => {
    const m = load(), tiles = m['./tileinfo-player'], catalog = m['./environment-art'].lair;
    const all = m['./environment-sprites'].player.filter(r => r.sheet === catalog.id);
    const crops = new Set(all.map(r => JSON.stringify(r.sprite)));
    assert.equal(crops.size, 9); assert.equal(catalog.entries.length, 9);
    for (const symbol of ['MONS_HYDRA', 'MONS_BLINK_FROG', 'MONS_BLINK_FROG_BLINKING', 'MONS_ALLIGATOR',
        'MONS_DIRE_ELEPHANT', 'MONS_CATOBLEPAS', 'MONS_DREAM_SHEEP', 'MONS_ANACONDA', 'MONS_ADDER',
        'MONS_GOLIATH_FROG', 'MONS_ZOMBIE_SNAKE', 'MONS_ZOMBIE_LIZARD']) {
        const index = tiles[symbol]; assert.equal(typeof index, 'number', symbol);
        for (let n = 0; n < tiles.tile_count(index); n++) assert(!all.some(r => r.tile === index + n), symbol);
    }
});
