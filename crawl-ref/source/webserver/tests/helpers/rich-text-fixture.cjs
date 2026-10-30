const path = require('node:path');
const root = path.resolve(__dirname, '../..');

// Existing DOM harnesses resolve AMD modules explicitly. Load the real shared
// dependencies under a temporary loader without changing their module globals.
async function install(page) {
    await page.evaluate(() => { window.savedSharedDefine = window.define; window.define = undefined; });
    await page.addScriptTag({ path: path.join(root, 'static/scripts/marked.js') });
    await page.evaluate(() => {
        const modules = window.modules || window.qaModules;
        modules.marked = window.marked;
        window.define = (dependencies, factory) => {
            modules[window.sharedModuleName] = factory(...dependencies.map(name => modules[name]));
        };
    });
    for (const name of ['rich-text', 'text-columns', 'heat-help']) {
        await page.evaluate(name => { window.sharedModuleName = name; }, name);
        await page.addScriptTag({ path: path.join(root, 'static/scripts', name + '.js') });
    }
    await page.evaluate(() => { window.define = window.savedSharedDefine; delete window.savedSharedDefine; });
    await page.addStyleTag({ path: path.join(root, 'static/tabletop/rich-text.css') });
}
module.exports = { install };
