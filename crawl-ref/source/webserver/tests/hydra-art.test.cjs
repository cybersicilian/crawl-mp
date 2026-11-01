const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./helpers/art-catalog-fixture.cjs');
const { nativeMonsterTiles } = require('./helpers/native-monster-tiles.cjs');
const source = path.resolve(__dirname, '../..');

test('seven hydra designs follow the live native head-count selector and clamping contract', () => {
    const m = load(), art = m['./environment-art'].hydras, tiles = m['./tileinfo-player'];
    const cpp = fs.readFileSync(path.join(source, 'tilepick.cc'), 'utf8');
    assert.match(cpp, /case MONS_HYDRA:\s*\/\/ Number of heads\s*return tileidx_mon_clamp\(TILEP_MONS_HYDRA, number - 1\);/);
    assert.match(cpp, /tileidx_t tileidx_mon_clamp\(tileidx_t tile, int offset\)\s*\{\s*int count = tile_player_count\(tile\);\s*return tile \+ min\(max\(offset, 0\), count - 1\);/);
    assert.equal(nativeMonsterTiles().get('MONS_HYDRA'), 'MONS_HYDRA');
    assert.equal(tiles.tile_count(tiles.MONS_HYDRA), 7); assert.equal(art.entries.length, 7);
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === art.id);
    assert.equal(regions.length, 7); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    for (const [n, entry] of art.entries.entries()) {
        assert.equal(entry.heads, n + 1); assert.equal(entry.variants, false);
        assert.equal(entry.names.length, 1);
        const index = tiles[entry.names[0]], region = regions.find(r => r.tile === index);
        assert.equal(index, tiles.MONS_HYDRA + n); assert.equal(tiles.get_img(index), 'player');
        const info = tiles.get_tile_info(index);
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert(region.sprite.x >= 0 && region.sprite.y >= 0);
        assert(region.sprite.x + region.sprite.w <= art.width && region.sprite.y + region.sprite.h <= art.height);
        assert.equal(region.preserveAlpha, null); assert.equal(region.mirror, false);
    }
    assert.equal(new Set(regions.map(r => [r.x, r.y, r.w, r.h].join(':'))).size, 7,
        'Every native portrait rectangle independently identifies its head-count state');
    assert.match(art.entries[6].label, /Seven-plus/);
});

test('hydra artwork does not replace independent player, unique or undead forms', () => {
    const m = load(), tiles = m['./tileinfo-player'], id = m['./environment-art'].hydras.id;
    const regions = m['./environment-sprites'].player.filter(r => r.sheet === id);
    for (const symbol of ['MONS_LERNAEAN_HYDRA', 'MONS_LERNAEAN_HYDRA_ZOMBIE', 'MONS_MEAT_HYDRA',
        'MONS_SLYMDRA', 'MONS_ZOMBIE_HYDRA', 'MONS_DRAUGR_HYDRA', 'MONS_SIMULACRUM_HYDRA',
        'MONS_SPECTRAL_HYDRA', 'TRAN_STATUE_HYDRA', 'BASE_HYDRA']) {
        const index = tiles[symbol]; assert.equal(typeof index, 'number', symbol);
        for (let n = 0; n < tiles.tile_count(index); n++) assert(!regions.some(r => r.tile === index + n), symbol);
    }
});
