/* All native popup families share the surface and keyboard contract. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const tile = { t: 1, tex: 0, ymax: 32 };
const fixtures = {
    'describe-generic': { title: 'Journal', body: 'Notes', footer: '' },
    'describe-feature-wide': { feats: [{ title: 'Staircase', body: 'Travel down.', tile }] },
    'describe-item': { title: '+10 dagger {devious, rElec rC- Int+5 Stlth+}', body: 'Weapon', spellset: [], tiles: [], actions: '(w)ield.', action_buttons: [{ key: 'w', label: 'Wield' }] },
    'describe-spell': { title: 'Blink', desc: 'Teleport a short distance.', can_mem: true, tile },
    'describe-cards': { cards: [{ name: 'Escape', desc: 'Card description' }] },
    'describe-god': { name: 'Zin', title: 'Faithful', favour: 'Pleased', colour: 15, tile, extra: '',
        description: 'Lawful god', powers_list: '', powers: 'Granted powers', info_table: '', wrath: 'Wrath', is_altar: false },
    'describe-monster': { title: 'Goblin', body: 'A goblin.', spellset: [], quote: 'Lore', status: 'Unhurt',
        fg_idx: 0, flag: 0, icons: [] },
    version: { information: 'Version', features: 'Features', changes: 'Changes' },
    'formatted-scroller': { title: 'Help', text: 'Read the manual.', tag: 'help', highlight: '', more: '', easy_exit: true },
    'progress-bar': { title: 'Preparing', bar_text: '50%', status: 'Loading' },
    'seed-selection': { title: 'Seed', body: 'Choose a seed.', footer: 'Begin when ready.', show_pregen_toggle: true },
    'msgwin-get-line': { prompt: 'Search for an item:' },
    'newgame-choice': { title: 'Choose a species', 'main-items': { menu_id: 0,
        buttons: [{ label: 'a - Human', hotkey: 97, x: 0, y: 0, description: 'Human', highlight_colour: 7 }], labels: [] },
        'sub-items': { menu_id: 1, buttons: [], labels: [] } },
    'newgame-random-combo': { prompt: 'Random character', doll: [] },
    'game-over': { title: 'Expedition ended', body: 'Your final record.', tile }
};

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Error/.test(message.text())) console.log(message.text()); });
    try {
        await page.setContent('<!doctype html><html><body><main id="game"><div id="ui-stack" data-display-mode="tiles"></div></main>'
            + fs.readFileSync(path.join(root, 'game_data/templates/popup-templates.html'), 'utf8') + '</body></html>');
        for (const file of ['styles/game-menus.css', 'styles/game-popups.css', 'styles/game-descriptions.css',
            'styles/gameplay-workflows.css', 'styles/menu-surfaces.css', 'styles/menu-polish.css'])
            await page.addStyleTag({ path: path.join(root, 'game_data/static', file) });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = []; window.qaWatching = false; window.qaHandlers = {};
            window.jQuery.fx.off = true;
            const renderer = function () { this.cell_width = 32; this.cell_height = 32; };
            renderer.prototype.init = renderer.prototype.draw_player = renderer.prototype.draw_from_texture = renderer.prototype.draw_foreground = () => {};
            window.modules = { jquery: window.jQuery,
                comm: { send_message(msg, data) { window.qaPackets.push({ msg, ...data }); },
                    register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }, handle_message() {} },
                client: { is_watching: () => window.qaWatching }, 'game-loading': { setPopupCount() {} },
                './options': { get: key => key === 'tile_display_mode' ? 'tiles' : false, add_listener() {} },
                './focus-trap': (element, options) => ({ activate() { options.onActivate(); return this; }, deactivate() { options.onDeactivate(); } }),
                './scroller': element => { window.jQuery(element).data('scroller', { recalculateImmediate() {} });
                    return { scrollElement: element, contentElement: element }; },
                './cell_renderer': { DungeonCellRenderer: renderer }, './nested-tips': { linkify() {} },
                './tileinfo-main': { MAIN_MAX: 100 }, './tileinfo-gui': { NEMELEX_CARD: 1, STARTUP_STONESOUP: 1 },
                './tileinfo-player': { MCACHE_START: 1000 } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.qaModule] = factory(...deps.map(dep => window.modules[dep]));
            };
        });
        await page.evaluate(() => { window.qaModule = 'item-properties'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/item-properties.js') });
        await page.evaluate(() => { window.qaModule = 'share-link'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/share-link.js') });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const name of ['util', 'enums', 'menu-keyboard', 'menu-columns', 'menu-search', 'menu-actions', 'menu-presentation', 'popup-controls', 'ui',
            'ui-layout-format', 'ui-scroller-layouts', 'ui-description-layouts', 'ui-layouts']) {
            await page.evaluate(name => { window.qaModule = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        await page.evaluate(() => window.jQuery(document).trigger('game_init'));
        const push = (type, data) => page.evaluate(({ type, data }) => window.qaHandlers['ui-push']({ type, ...data }), { type, data });
        const pop = () => page.evaluate(() => window.qaHandlers['ui-pop']({}));
        for (const [type, data] of Object.entries(fixtures)) {
            await push(type, data);
            const surface = page.locator('#ui-stack .workflow-surface');
            assert.equal(await surface.count(), 1, type);
            assert.doesNotMatch(await surface.innerText(), /Unhandled UI|Buggy UI/, type);
            assert.equal(await surface.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(241, 232, 212)', type);
            assert.equal(await page.locator('#ui-stack [role=dialog]').count(), 1, type);
            assert.equal(await surface.locator('.workflow-popup-tools button').count(), 1, type);
            if (type === 'describe-item') {
                assert.equal(await surface.locator('.header .item-property').count(), 5);
                assert(!(await surface.locator('.header').textContent()).includes('{'));
            }
            await pop();
        }
        // Guard the native producer/renderer contract as new popup types appear.
        const nativeFiles = fs.readdirSync(path.join(root, '..')).filter(file => file.endsWith('.cc'));
        const emitted = new Set(nativeFiles.flatMap(file => [...fs.readFileSync(path.join(root, '..', file), 'utf8')
            .matchAll(/push_ui_layout\("([^"]+)"/g)].map(match => match[1])));
        assert.deepEqual([...emitted].sort(), Object.keys(fixtures).sort());

        await push('describe-item', fixtures['describe-item']);
        await page.locator('.workflow-popup-tools button').focus();
        await page.evaluate(() => { window.qaPackets = []; });
        await page.keyboard.press('w');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [{ msg: 'key', keycode: 119 }]);
        await page.evaluate(() => { window.qaPackets = []; });
        await page.keyboard.press('Control+w');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [], 'Modified letters do not invoke item actions');
        await pop();

        await push('seed-selection', fixtures['seed-selection']);
        await page.locator('#ui-stack input[type=text]').focus();
        await page.evaluate(() => { window.qaPackets = []; });
        await page.keyboard.type('123');
        assert.equal(await page.locator('#ui-stack input[type=text]').inputValue(), '123');
        assert.deepEqual(await page.evaluate(() => window.qaPackets), []);
        await pop();

        for (const [type, field] of [['describe-generic', 'body'], ['describe-item', 'body'],
            ['describe-spell', 'desc'], ['describe-monster', 'body'], ['describe-god', 'description']]) {
            await push(type, { ...fixtures[type], [field]: '**Visible emphasis** and `literal code`.' });
            assert.equal(await page.locator('#ui-stack .body strong').first().innerText(), 'Visible emphasis', type);
            assert.equal(await page.locator('#ui-stack .body code').first().innerText(), 'literal code', type);
            await pop();
        }

        await push('describe-god', fixtures['describe-god']);
        const tabs = page.locator('#ui-stack .workflow-pane-tabs button');
        await tabs.first().focus(); await page.keyboard.press('End');
        assert.equal(await tabs.last().getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#ui-stack .body > .pane.current').innerText(), 'Wrath');
        await pop();

        await push('formatted-scroller', fixtures['formatted-scroller']);
        await page.evaluate(() => { window.qaPackets = []; });
        await page.locator('.workflow-popup-tools button').click();
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [{ msg: 'key', keycode: 27 }], 'Easy-exit scrollers close once');
        await pop();

        await push('describe-generic', { ...fixtures['describe-generic'], body: '[Manual](https://description.test/manual)' });
        await page.route('https://description.test/**', route => route.fulfill({ contentType: 'text/html', body: 'Manual' }));
        await page.locator('#ui-stack .rich-text a').focus();
        await page.evaluate(() => { window.qaPackets = []; });
        const opened = page.waitForEvent('popup');
        await page.keyboard.press('Enter');
        await (await opened).close();
        assert.deepEqual(await page.evaluate(() => window.qaPackets.filter(packet => packet.msg === 'key')), [],
            'Keyboard links open without sending a native game command');
        await pop();

        await page.evaluate(() => { window.qaWatching = true; });
        await push('newgame-choice', fixtures['newgame-choice']);
        await page.evaluate(() => { window.qaPackets = []; });
        await page.locator('#ui-stack [data-hotkey=a]').click();
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [], 'Spectators cannot activate div-based controls');
        await pop();
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, popupFamilies: [...emitted].sort(),
            typingIsolated: true, modifiedKeysIsolated: true, spectatorSafe: true }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
