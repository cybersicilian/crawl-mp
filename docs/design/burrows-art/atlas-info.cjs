// Read the actual generated AMD tile metadata without a browser or packages.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2]);
const modules = {};
for (const family of ['floor', 'wall', 'feat', 'main', 'player']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'rltiles', `tileinfo-${family}.js`), 'utf8'), {
        define(dependencies, factory) {
            modules[`./tileinfo-${family}`] = factory(...dependencies.map(name => modules[name]));
        }
    });
}
const assets = [];
function add(id, family, symbol, offset = 0) {
    const module = modules[`./tileinfo-${family}`];
    const index = module[symbol] + offset;
    assert(Number.isInteger(index), `Missing symbol ${symbol}`);
    const info = module.get_tile_info(index);
    assert(info, `Missing rectangle ${symbol}`);
    assets.push({ id, family, symbol, index, info, count: module.tile_count(index) });
}
// An optional monster manifest reuses this audit for later native content.
const manifest = process.argv[3];
const monsters = manifest
    ? JSON.parse(fs.readFileSync(manifest, 'utf8')).map(entry => {
        assert(entry.tile.startsWith('mon/'), 'Expected a monster tile manifest');
        return entry.id;
    })
    : ['burrowing_beast', 'crag_boar', 'shale_drake', 'deep_troll_delver', 'worldworm'];
for (const name of monsters) {
    add(name, 'player', 'MONS_' + name.toUpperCase());
    add('corpse_' + name, 'main', 'CORPSE_' + name.toUpperCase());
}
if (!manifest) {
add('enter_burrows', 'feat', 'DNGN_ENTER_BURROWS');
add('exit_burrows', 'feat', 'DNGN_EXIT_BURROWS');
add('rune_burrows', 'main', 'RUNE_BURROWS');
add('uncollected_rune_burrows', 'main', 'UNCOLLECTED_RUNE_BURROWS');
add('burrows_found_whole', 'main', 'GEM_BURROWS');
add('burrows_found_broken', 'main', 'GEM_BURROWS', 1);
for (let i = 0; i < 4; i++) {
    add('floor_burrows' + i, 'floor', 'FLOOR_BURROWS', i);
    add('wall_burrows' + i, 'wall', 'WALL_BURROWS', i);
}
for (let i = 0; i < 2; i++) add('stone_wall_burrows' + i, 'wall', 'STONE_WALL_BURROWS', i);
}
process.stdout.write(JSON.stringify(assets, null, 2) + '\n');
