/* Load canonical generated metadata and declarative art maps without a browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const defaultStaticRoot = path.resolve(__dirname, '../../game_data/static');
module.exports = function loadArtCatalogs(metadataRoot = defaultStaticRoot, artRoot = defaultStaticRoot) {
    const modules = { jquery: { extend: Object.assign } };
    for (const name of ['tileinfo-floor', 'tileinfo-wall', 'tileinfo-feat', 'tileinfo-main', 'tileinfo-player',
        'tileinfo-dngn', 'environment-art', 'environment-sprites']) {
        const root = name.startsWith('tileinfo-') ? metadataRoot : artRoot;
        vm.runInNewContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            window: {}, assert, define(deps, factory) { modules['./' + name] = factory(...deps.map(dep => modules[dep])); }
        });
    }
    return modules;
};
