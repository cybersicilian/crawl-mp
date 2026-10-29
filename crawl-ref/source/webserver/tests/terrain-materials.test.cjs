const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function load() {
    const modules = { jquery: { extend: Object.assign } };
    for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-dngn', 'terrain-materials']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game_data/static', name + '.js'), 'utf8'), {
            window: {}, assert, define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    return { tiles: modules['./tileinfo-dngn'], regions: modules['./terrain-materials'] };
}
test('painted materials resolve canonical native variants and preserve all hazard/feature regions', () => {
    const { tiles, regions } = load();
    assert(regions.floor.length >= 20 && regions.wall.length >= 20);
    for (const [id, entries] of Object.entries(regions)) {
        const seen = new Set();
        for (const entry of entries) {
            assert(entry.w > 0 && entry.h > 0); assert(!seen.has(entry.x + ':' + entry.y));
            seen.add(entry.x + ':' + entry.y);
            assert(entry.material.x >= 0 && entry.material.x + entry.material.w <= 1536);
            assert(entry.material.y >= 0 && entry.material.y + entry.material.h <= 1024);
        }
        for (const name of ['DNGN_LAVA', 'DNGN_DEEP_WATER', 'DNGN_SHALLOW_WATER', 'DNGN_CLOSED_DOOR',
            'DNGN_STONE_STAIRS_DOWN', 'DNGN_ALTAR_ZIN', 'FLOOR_SLIME_ACIDIC', 'WALL_BRICK_DARK_2_TORCH']) {
            if (tiles.get_img(tiles[name]) !== id) continue;
            const info = tiles.get_tile_info(tiles[name]);
            assert(!entries.some(entry => entry.x === info.sx && entry.y === info.sy), name);
        }
    }
});
