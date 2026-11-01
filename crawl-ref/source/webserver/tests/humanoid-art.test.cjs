const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { nativeEquipment } = require('./helpers/native-monster-equipment.cjs');
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
test('humanoid bodies use explicit isolated crops and keep native gear, special variants and player dolls separate', () => {
    const m = load(), catalog = m['./environment-art'].humanoids, tiles = m['./tileinfo-player'];
    const all = m['./environment-sprites'].player, regions = all.filter(r => r.sheet === catalog.id);
    assert.equal(regions.length, 9); assert.equal(new Set(all.map(r => r.tile)).size, all.length);
    for (const region of regions) {
        const info = tiles.get_tile_info(region.tile);
        assert.equal(region.fit, 'stretch'); assert.equal(region.mirror, false);
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert(region.sprite.x >= 0 && region.sprite.y >= 0 && region.sprite.w > 0 && region.sprite.h > 0);
        assert(region.sprite.x + region.sprite.w <= catalog.width && region.sprite.y + region.sprite.h <= catalog.height);
    }
    for (const entry of catalog.entries) assert(regions.some(r => r.tile === tiles[entry.names[0]]));
    for (const name of ['BASE_HUMAN', 'HUMAN_1', 'HAND1_SHORT_SWORD', 'HAND1_SPEAR', 'HAND2_BUCKLER',
        'MONS_ORC_KNIGHT', 'MONS_ORC_WARLORD', 'MONS_ORC_HIGH_PRIEST', 'MONS_ORC_SORCERER',
        'MONS_GNOLL_SERGEANT', 'MONS_GNOLL_BOUDA', 'MONS_KOBOLD_BRIGAND', 'MONS_TWO_HEADED_OGRE']) {
        assert.equal(typeof tiles[name], 'number', name);
        assert(!regions.some(r => r.tile === tiles[name]), name);
    }
});
test('equipment fixtures resolve the native weapon and shield tables for every authored body', () => {
    const m = load(), names = Array.from(m['./environment-art'].humanoids.entries, e => e.names[0]);
    const offsets = nativeEquipment(names);
    assert.equal(offsets.length, 9);
    for (const entry of offsets) assert(Number.isInteger(entry.weapon.x) && Number.isInteger(entry.weapon.y), entry.symbol);
    assert.deepEqual(offsets.find(e => e.symbol === 'MONS_GOBLIN').weapon, { x: -2, y: 3 });
    assert.deepEqual(offsets.find(e => e.symbol === 'MONS_ORC').shield, { x: 1, y: 0 });
    assert.equal(offsets.find(e => e.symbol === 'MONS_ORC_WIZARD').shield, null);
});
