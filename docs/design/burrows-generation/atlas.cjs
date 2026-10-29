// Resolve canonical generated tile rectangles for the offline map renderer.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = process.argv[2];
const modules = {};
const result = {};
for (const family of ['floor', 'wall', 'feat', 'main', 'player']) {
    let module;
    vm.runInNewContext(fs.readFileSync(path.join(source, 'rltiles', `tileinfo-${family}.js`), 'utf8'), {
        define(deps, factory) { module = factory(...deps.map(name => modules[name])); }
    });
    modules[`./tileinfo-${family}`] = module;
    for (const [symbol, index] of Object.entries(module)) {
        if (!Number.isInteger(index) || symbol.endsWith('_MAX')) continue;
        const info = module.get_tile_info(index);
        if (info) result[symbol] = {family, index, info, count: module.tile_count(index)};
    }
}
process.stdout.write(JSON.stringify(result));
