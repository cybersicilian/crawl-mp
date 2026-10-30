/* Controlled browser fixtures backed by native equipment snapshots and atlases. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
async function install(page, profiles, nativeRoot) {
    await require('./ui-sprite-fixture.cjs').install(page);
    const images = ['main', 'player', 'icons'].map(name => `<img id="${name}" style="display:none" src="data:image/png;base64,${fs.readFileSync(path.join(nativeRoot, 'dat/tiles', name + '.png')).toString('base64')}">`).join('');
    await page.setContent('<!doctype html><html><body><button id="opener">Equipment</button><div id="ui-stack"></div>' + images + '</body></html>');
    await page.waitForFunction(() => ['main', 'player', 'icons'].every(id => document.getElementById(id).naturalWidth > 0));
    for (const file of ['static/tabletop/tokens.css', 'static/tabletop/typography.css', 'static/tabletop/properties.css', 'static/tabletop/share-link.css',
        'game_data/static/styles/party-inspector.css', 'static/tabletop/character-folio.css',
        'game_data/static/styles/gameplay-workflows.css', 'game_data/static/styles/folio-controls.css',
        'game_data/static/styles/equipment-paperdoll.css', 'game_data/static/styles/context-menu.css'])
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^@import.*$/gm, '') });
    await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
    await page.evaluate(profiles => {
        window.packets = [];
        window.modules = { jquery: window.jQuery, require: { toUrl: () => 'data:text/css,' },
            client: { is_watching: () => false }, comm: { register_handlers() {}, send_message(msg, fields) { window.packets.push({ msg, ...fields }); } },
            chat: { tag_item() {} }, './chat-context': { inventory_item: item => item } };
        window.define = (deps, factory) => {
            if (typeof deps === 'function') { factory = deps; deps = []; }
            for (const name of deps)
                if (!(name in window.modules)) throw new Error('Missing fixture dependency: ' + name + ' for ' + window.moduleName);
            window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
        };
        window.speciesNames = Object.keys(profiles);
        const members = Object.entries(profiles).map(([species, hero], slot) => ({ ...hero, slot,
            name: species === 'Human' ? 'Aldric' : species === hero.species ? species : hero.name || species,
            alive: true, hp_max: hero.hp, mp_max: hero.mp,
            inventory_known: true, xl: hero.xl || 1 }));
        window.crawl_party = { state: { snapshot_version: 2, active_slot: 0, controlled_slot: 0,
            controllable_slots: members.map(member => member.slot), members } };
    }, profiles);
    await require('./rich-text-fixture.cjs').install(page);
    await page.addScriptTag({ path: path.join(root, 'game_data/static/focus-trap.js') });
    await page.evaluate(() => { window.modules['./focus-trap'] = window.focusTrap; });
    for (const [name, file] of [
        ['spell-cost', 'static/scripts/spell-cost.js'],
        ['item-properties', 'static/scripts/item-properties.js'], ['character-stat-help', 'static/scripts/character-stat-help.js'],
        ['share-link', 'static/scripts/share-link.js'],
        ['./party-model', 'game_data/static/party-model.js'], ['./party-status-model', 'game_data/static/party-status-model.js'], ['./effect-icon-catalog', 'game_data/static/effect-icon-catalog.js'], ['./effect-icon-art', 'game_data/static/effect-icon-art.js'], ['./status-icons', 'game_data/static/status-icons.js'],
        ['./enums', 'game_data/static/enums.js'], ['./inspection-dialog', 'game_data/static/inspection-dialog.js'],
        ['./workflow-actions', 'game_data/static/workflow-actions.js'],
        ['./equipment-memory-ui', 'game_data/static/equipment-memory-ui.js'],
        ['./native-tile-art', 'game_data/static/native-tile-art.js'], ['./equipment-paperdoll', 'game_data/static/equipment-paperdoll.js'],
        ['./context-menu', 'game_data/static/context-menu.js'],
        ['./folio-bag', 'game_data/static/folio-bag.js'],
        ['./party-skill-training', 'game_data/static/party-skill-training.js'],
        ['./item-context-menu', 'game_data/static/item-context-menu.js'],
        ['./folio-equipment', 'game_data/static/folio-equipment.js'], ['./party-power-cards', 'game_data/static/party-power-cards.js'],
        ['./party-inspector-render', 'game_data/static/party-inspector-render.js'],
        ['./menu-keyboard', 'game_data/static/menu-keyboard.js'], ['./folio-keyboard', 'game_data/static/folio-keyboard.js'],
        ['inspector', 'game_data/static/party-inspector.js']
    ]) {
        await page.evaluate(name => { window.moduleName = name; }, name);
        await page.addScriptTag({ path: path.join(root, file) });
    }
    await page.evaluate(() => {
        window.modules.inspector.hotkeys();
        window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
        document.getElementById('opener').onclick = () => window.modules.inspector.open(0, 'equipment');
    });
    await page.locator('#opener').click();
}
module.exports = { install };
