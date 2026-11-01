const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function load() {
    const modules = { jquery: { extend: Object.assign } };
    for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player', 'tileinfo-dngn',
        'environment-art', 'environment-materials', 'environment-sprites']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static', name + '.js'), 'utf8'), {
            window: {}, assert, define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    return modules;
}
test('natural terrain and tree opt-ins resolve complete canonical families without affecting hazards', () => {
    const modules = load(), tiles = modules['./tileinfo-dngn'];
    const ground = modules['./environment-materials'].floor, trees = modules['./environment-sprites'].feat;
    assert.equal(ground.length, 56); assert.equal(trees.length, 41);
    for (const [regions, width, height, key] of [[ground, 1536, 1024, 'material'], [trees, 1448, 1086, 'sprite']]) {
        const seen = new Set();
        for (const region of regions) {
            assert(!seen.has(region.tile)); seen.add(region.tile);
            const crop = region[key];
            assert(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= width && crop.y + crop.h <= height);
            const info = tiles.get_tile_info(region.tile);
            assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        }
    }
    const selected = new Set([...ground, ...trees].map(region => region.tile));
    for (const name of ['DNGN_UNSEEN', 'DNGN_ERROR', 'DNGN_SHALLOW_WATER', 'DNGN_DEEP_WATER', 'DNGN_LAVA',
        'DNGN_CLOSED_DOOR', 'DNGN_STONE_STAIRS_DOWN', 'DNGN_DEMONIC_TREE', 'DNGN_ALTAR_ZIN']) {
        const base = tiles[name]; assert.equal(typeof base, 'number', name);
        for (let n = 0; n < tiles.tile_count(base); n++) assert(!selected.has(base + n), name);
    }
    const catalog = modules['./environment-art'];
    assert.equal(catalog.sprites.entries.length, 12);
    for (const index of [9, 10, 11]) assert.equal(catalog.sprites.entries[index].names.length, 0, 'props do not alter placement');
});
test('ordinary dungeon feature catalog retains its variants independently of specialized states', () => {
    const modules = load(), tiles = modules['./tileinfo-dngn'], catalog = modules['./environment-art'].features;
    const regions = modules['./environment-sprites'].dungeon.filter(region => region.sheet === catalog.id), selected = new Set();
    for (const region of regions) {
        assert(!selected.has(region.tile)); selected.add(region.tile);
        assert.equal(region.sheet, catalog.id); assert.equal(region.mirror, false);
        assert(region.sprite.x + region.sprite.w <= catalog.width);
        assert(region.sprite.y + region.sprite.h <= catalog.height);
    }
    for (const entry of catalog.entries) for (const name of entry.names) {
        const base = tiles[name]; assert.equal(typeof base, 'number', name);
        for (let n = 0; n < tiles.tile_count(base); n++) assert(selected.has(base + n), name);
    }
    for (const name of ['DNGN_RUNED_DOOR', 'DNGN_SEALED_DOOR', 'DNGN_GATE_CLOSED_LEFT', 'DNGN_OPEN_DOOR_CRYPT',
        'DNGN_SPARKLING_FOUNTAIN', 'DNGN_BLOOD_FOUNTAIN', 'DNGN_ESCAPE_HATCH_DOWN', 'DNGN_ZOT_STAIRS_UP']) {
        const base = tiles[name]; assert.equal(typeof base, 'number', name);
        for (let n = 0; n < tiles.tile_count(base); n++) assert(!selected.has(base + n), name);
    }
});
test('creature art resolves nine complete native bodies without replacing dolls or special species', () => {
    const modules = load(), tiles = modules['./tileinfo-player'], catalog = modules['./environment-art'].creatures;
    const regions = modules['./environment-sprites'].player.filter(region => region.sheet === catalog.id);
    assert.equal(regions.length, 9);
    const selected = new Set(regions.map(region => region.tile));
    assert.equal(selected.size, regions.length);
    for (const region of regions) {
        const info = tiles.get_tile_info(region.tile);
        assert.equal(tiles.get_img(region.tile), 'player');
        assert.equal(region.sheet, catalog.id); assert.equal(region.mirror, false);
        assert.deepEqual([region.x, region.y, region.w, region.h], [info.sx, info.sy, info.ex - info.sx, info.ey - info.sy]);
        assert(region.sprite.x >= 0 && region.sprite.y >= 0);
        assert(region.sprite.x + region.sprite.w <= catalog.width);
        assert(region.sprite.y + region.sprite.h <= catalog.height);
    }
    for (const entry of catalog.entries) for (const name of entry.names) {
        const base = tiles[name]; assert.equal(typeof base, 'number', name);
        for (let n = 0; n < tiles.tile_count(base); n++) assert(selected.has(base + n), name);
    }
    for (const name of ['BASE_HUMAN', 'HUMAN_1', 'MONS_RIVER_RAT', 'MONS_HELL_RAT',
        'MONS_QUOKKA_LORD_OF_SKULLS', 'MONS_VAMPIRE_BAT', 'MONS_FIRE_BAT', 'MONS_WARG', 'MONS_WOLF', 'MONS_BLACK_MAMBA']) {
        const base = tiles[name]; assert.equal(typeof base, 'number', name);
        for (let n = 0; n < tiles.tile_count(base); n++) assert(!selected.has(base + n), name);
    }
});
