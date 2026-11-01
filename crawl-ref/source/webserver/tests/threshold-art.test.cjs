const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function load() {
    const modules = { jquery: { extend: Object.assign } };
    for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player',
        'tileinfo-dngn', 'environment-art', 'environment-sprites']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static', name + '.js'), 'utf8'), {
            window: {}, assert, define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    return modules;
}
test('special thresholds resolve six real native feature states with independent source rectangles', () => {
    const m = load(), catalog = m['./environment-art'].thresholds, tiles = m['./tileinfo-dngn'];
    const groups = m['./environment-sprites'], all = groups.feat.concat(groups.dungeon), selected = all.filter(r => r.sheet === catalog.id);
    const native = fs.readFileSync(path.resolve(__dirname, '../../tilepick.cc'), 'utf8');
    const start = native.indexOf('tileidx_t tileidx_feature_base('), end = native.indexOf('\n}\n', start);
    assert(start >= 0 && end > start);
    const defaults = new Map(Array.from(native.slice(start, end).matchAll(/case\s+(DNGN_[A-Z0-9_]+)\s*:\s*return\s+TILE_(DNGN_[A-Z0-9_]+)\s*;/g),
        match => [match[1], match[2]]));
    assert.equal(selected.length, 6); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    for (const entry of catalog.entries) {
        const symbol = entry.names[0], index = tiles[symbol], region = selected.find(r => r.tile === index);
        assert.equal(defaults.get(symbol), symbol); assert.equal(entry.variants, false); assert(region, symbol);
        const info = tiles.get_tile_info(index); assert.equal(tiles.get_img(index), 'feat');
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert.equal(region.preserveAlpha, null); assert.equal(region.mirror, false);
        assert(region.sprite.x >= 0 && region.sprite.y >= 0);
        assert(region.sprite.x + region.sprite.w <= catalog.width && region.sprite.y + region.sprite.h <= catalog.height);
    }
    assert.equal(new Set(catalog.entries.map(e => JSON.stringify(e.sprite))).size, 6);
});
test('clear-door visibility, connected gates, branch stairs and vault overrides retain separate native art', () => {
    const m = load(), tiles = m['./tileinfo-dngn'], groups = m['./environment-sprites'];
    const selected = new Set(groups.feat.concat(groups.dungeon).map(r => r.tile));
    for (const name of ['DNGN_RUNED_CLEAR_DOOR', 'DNGN_SEALED_CLEAR_DOOR', 'DNGN_CLOSED_CLEAR_DOOR',
        'DNGN_GATE_RUNED_LEFT', 'DNGN_GATE_RUNED_MIDDLE', 'DNGN_GATE_RUNED_RIGHT', 'DNGN_VGATE_RUNED_UP',
        'DNGN_GATE_SEALED_LEFT', 'DNGN_GATE_SEALED_MIDDLE', 'DNGN_GATE_SEALED_RIGHT', 'DNGN_VGATE_SEALED_UP',
        'DNGN_CLOSED_DOOR_CRYPT', 'DNGN_OPEN_DOOR_CRYPT', 'DNGN_ZOT_STAIRS_UP', 'DNGN_STONE_ARCH_HELL']) {
        const index = tiles[name]; assert.equal(typeof index, 'number', name);
        for (let n = 0; n < tiles.tile_count(index); n++) assert(!selected.has(index + n), name);
    }
});
