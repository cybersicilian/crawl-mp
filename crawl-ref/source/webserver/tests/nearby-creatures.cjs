/* Hide duplicate party projections; preserve compact threats and unknowns. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 400, height: 320 } });
    try {
        await page.setContent('<main id="normal" style="width:300px"><div id="monster_list"></div></main>');
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'game_data/static/styles/nearby-creatures.css'), 'utf8') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            const renderer = class {
                constructor() { this.cell_width = this.cell_height = 32; }
                init() {} render_cell() {} draw_main() {}
                set_cell_size(w, h) { this.cell_width = w; this.cell_height = h; }
            };
            window.cells = {};
            const modules = { jquery: window.jQuery,
                './map_knowledge': { get: (x, y) => window.cells[x + ',' + y], visible: () => true },
                './cell_renderer': { DungeonCellRenderer: renderer }, './dungeon_renderer': { cell_width: 32, cell_height: 32 },
                './options': { get: () => 'tiles', add_listener() {} }, './player': {}, './tileinfo-main': { UNSEEN_INVISIBLE: 1 },
                './util': { init_canvas(canvas, w, h) { canvas.width = w; canvas.height = h; }, formatted_string_to_html: text => text } };
            window.define = (deps, factory) => { window.nearby = factory(...deps.map(dep => modules[dep])); };
            window.crawl_party = { state: { members: [{ slot: 1, alive: true, on_same_level: true, pos: { x: 1, y: 0 } }] } };
            window.place = (x, name, att) => {
                window.cells[x + ',0'] = { mon: { name, plural: name + 's', att, threat: 1, type: x, typedata: { avghp: 10 } } };
                window.nearby.update_loc({ x, y: 0 });
            };
        });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/monster_list.js') });
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_init');
            window.place(1, 'Lyra the Lyra', 4); window.nearby.update();
        });
        assert.equal(await page.locator('#monster_list .group').count(), 0);
        assert.equal(await page.locator('#monster_list').isVisible(), false);
        await page.evaluate(() => { window.place(3, 'summoned hound', 4); window.nearby.update(); });
        assert.equal(await page.locator('#monster_list').isVisible(), false, 'A friendly-only party list does not create a redundant panel');
        await page.evaluate(() => { window.place(2, 'orc', 0); window.place(3, 'summoned hound', 4); window.nearby.update(); });
        assert.deepEqual(await page.locator('#monster_list .name').allTextContents(), ['orc', 'summoned hound']);
        assert((await page.locator('#monster_list').boundingBox()).height <= 72);
        await page.evaluate(() => { window.crawl_party.state.members[0].on_same_level = false; window.nearby.update(); });
        assert.equal(await page.locator('#monster_list .name.friendly').count(), 2, 'Off-floor positions cannot hide another actor');
        await page.evaluate(() => { window.crawl_party.state.members[0].on_same_level = true; window.place(1, 'hostile mimic', 0); window.nearby.update('Unseen movement'); });
        assert((await page.locator('#monster_list .name').allTextContents()).includes('hostile mimic'));
        assert((await page.locator('#monster_list .name').allTextContents()).includes('Unseen movement'));
        await page.evaluate(() => {
            window.place(4, 'unknown actor', 0);
            delete window.cells['4,0'].mon.typedata;
            window.nearby.update();
        });
        assert((await page.locator('#monster_list .name').allTextContents()).includes('unknown actor'),
            'Actors without type metadata remain visible during native state transitions');
        await page.evaluate(() => {
            window.place(5, 'plant', 0); window.cells['5,0'].mon.typedata.no_exp = true;
            document.querySelector('#normal').insertAdjacentHTML('beforeend', '<aside id="enemy_initiative_rail" data-creature-groups="true"></aside>');
            window.nearby.update('Unseen movement');
        });
        const contacts = await page.evaluate(() => window.nearby.contacts());
        assert(contacts.some(contact => contact.name === 'plant' && contact.non_threatening));
        assert(contacts.some(contact => contact.name === 'summoned hound' && contact.att === 4));
        assert.equal(await page.locator('#monster_list .group:not(.is-unseen-warning)').count(), 0,
            'The grouped rail replaces duplicate map rows without repainting them');
        assert.equal(await page.locator('#monster_list .is-unseen-warning').count(), 1);
        await page.evaluate(() => window.nearby.clear());
        assert.equal(await page.locator('#monster_list').isVisible(), false);
        console.log('Duplicate party actors hidden; compact hostiles, summons, off-floor unknowns and unseen warnings preserved.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
