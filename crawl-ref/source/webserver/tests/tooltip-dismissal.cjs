/* Real browser events for tooltip ownership and disappearing source controls. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent(`<!doctype html><style>
            body { margin: 30px; } button { padding: 12px; }
            .concealed { display: none; }
            #lobby_rich_tooltip, #dcss_rich_tooltip {
                position: fixed; width: 280px; padding: 10px; background: beige;
            }
        </style><section id="lobby"><div id="launch_panel">
            <button id="launch" data-tip-title="Launch Dungeon Expedition (Enter D:1)"
                data-tip-body="Starts the co-op expedition on Dungeon:1">Launch</button>
        </div></section><main id="normal" hidden><div id="game_panel">
            <button id="action" data-tip-title="Game action" data-tip-body="Action details"
                aria-describedby="existing-help">Action</button>
        </div></main><button id="away">Away</button>
        <div id="lobby_rich_tooltip" style="display:none" aria-hidden="true"></div>`);
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery, comm: { send_message() {} } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const [name, file] of [
            ['spell-cost', 'static/scripts/spell-cost.js'],
            ['item-properties', 'static/scripts/item-properties.js'],
            ['tooltip-content', 'static/scripts/tooltip-content.js'],
            ['tooltip-policy', 'static/scripts/tooltip-policy.js'],
            ['tooltip-source', 'static/scripts/tooltip-source.js'],
            ['tooltip-layout', 'static/scripts/tooltip-layout.js'],
            ['lobby', 'static/scripts/client-tooltips.js'],
            ['./tip-placement', 'game_data/static/tip-placement.js'],
            ['./tooltip-glossary', 'game_data/static/tooltip-glossary.js'],
            ['./persistent-help', 'game_data/static/persistent-help.js'],
            ['./nested-tips', 'game_data/static/nested-tips.js'],
            ['interactions', 'game_data/static/player-interactions.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.inGame = false;
            window.tips = window.modules.lobby({ in_game: () => window.inGame });
            window.tips.init_lobby_tooltips();
            // Versioned gameplay handlers remain installed on return to the lobby.
            window.modules.interactions.init();
        });
        const lobbyTip = page.locator('#lobby_rich_tooltip');
        const gameTip = page.locator('#dcss_rich_tooltip');
        const hoverMs = await page.evaluate(() => window.modules['tooltip-policy'].hover_ms);
        async function noGameTip(message) { assert.equal(await gameTip.isVisible(), false, message); }
        async function leave() {
            await page.mouse.move(950, 650);
            await page.locator('#away').focus();
            await page.evaluate(() => { window.tips.hide_lobby_tooltip(); window.dcss_tooltips.hide(); });
        }
        async function open(kind) {
            await leave();
            const source = kind === 'lobby' ? '#launch' : '#action';
            await page.evaluate(kind => {
                window.inGame = kind === 'game';
                document.getElementById('lobby').hidden = window.inGame;
                document.getElementById('normal').hidden = !window.inGame;
            }, kind);
            await page.locator(source).focus();
            await (kind === 'lobby' ? lobbyTip : gameTip).waitFor({ state: 'visible' });
        }
        await page.locator('#launch').hover();
        await lobbyTip.waitFor({ state: 'visible' });
        await page.waitForTimeout(hoverMs + 60);
        await noGameTip('Gameplay help must never attach to the lobby Launch button');
        await page.locator('#launch').focus();
        await noGameTip('Keyboard focus in the lobby belongs to lobby help');

        const mutations = [
            ['hidden panel', panel => { panel.hidden = true; }, panel => { panel.hidden = false; }],
            ['display style', panel => { panel.style.display = 'none'; }, panel => { panel.style.display = ''; }],
            ['CSS class', panel => { panel.classList.add('concealed'); }, panel => { panel.classList.remove('concealed'); }],
            ['visibility', panel => { panel.style.visibility = 'hidden'; }, panel => { panel.style.visibility = ''; }],
            ['inert panel', panel => { panel.inert = true; }, panel => { panel.inert = false; }],
            ['removed panel', panel => { window.savedPanel = panel; panel.remove(); }, null]
        ];
        for (const kind of ['lobby', 'game']) {
            const tip = kind === 'lobby' ? lobbyTip : gameTip;
            const panelId = kind === 'lobby' ? '#launch_panel' : '#game_panel';
            const source = page.locator(kind === 'lobby' ? '#launch' : '#action');
            for (const [name, mutate, restore] of mutations) {
                await open(kind);
                await page.locator(panelId).evaluate(mutate);
                await tip.waitFor({ state: 'hidden', timeout: 1500 });
                if (restore) await page.locator(panelId).evaluate(restore);
                else await page.evaluate(kind => {
                    document.querySelector(kind === 'lobby' ? '#lobby' : '#normal').appendChild(window.savedPanel);
                }, kind);
                assert.equal(await source.getAttribute('aria-describedby'), kind === 'game' ? 'existing-help' : null,
                    `${kind}: ${name} removes only the tooltip's accessibility link`);
            }
            for (const event of ['game_layer_changed', 'game_cleanup']) {
                await open(kind);
                await page.evaluate(event => window.jQuery(document).trigger(event, ['normal']), event);
                await tip.waitFor({ state: 'hidden', timeout: 1500 });
            }
            await leave();
            await page.evaluate(kind => {
                window.inGame = kind === 'game';
                document.getElementById('lobby').hidden = window.inGame;
                document.getElementById('normal').hidden = !window.inGame;
            }, kind);
            await source.hover();
            await page.waitForTimeout(60);
            await page.locator(panelId).evaluate(panel => { panel.hidden = true; });
            await page.waitForTimeout(hoverMs + 60);
            assert.equal(await tip.isVisible(), false, `${kind}: hidden sources cannot open a pending hover`);
            await page.locator(panelId).evaluate(panel => { panel.hidden = false; });
        }

        // Source reparenting keeps a visible explanation, then observes its new ancestors.
        await open('game');
        await page.locator('#away').focus();
        await page.locator('#action').hover();
        await gameTip.waitFor({ state: 'visible' });
        await page.evaluate(() => {
            const panel = document.createElement('div'); panel.id = 'moved_panel';
            document.getElementById('normal').appendChild(panel);
            panel.appendChild(document.getElementById('action'));
        });
        assert(await gameTip.isVisible());
        await page.locator('#moved_panel').evaluate(panel => { panel.hidden = true; });
        await gameTip.waitFor({ state: 'hidden', timeout: 1500 });
        await page.evaluate(() => document.getElementById('game_panel').appendChild(document.getElementById('action')));

        // Reinitialization releases the previous source and its observer.
        await open('game');
        await page.evaluate(() => window.modules.interactions.init());
        await noGameTip('Repeated gameplay initialization dismisses old help');
        await open('lobby');
        await page.evaluate(() => window.tips.init_lobby_tooltips());
        assert.equal(await lobbyTip.isVisible(), false);

        // Game transition clears the launch card without pointer movement or a refresh.
        await open('lobby');
        await page.evaluate(() => {
            document.getElementById('lobby').hidden = true;
            window.inGame = true;
            document.getElementById('normal').hidden = false;
            window.jQuery(document).trigger('game_layer_changed', ['normal']);
        });
        await lobbyTip.waitFor({ state: 'hidden' });
        await noGameTip('Launching leaves no duplicate gameplay card');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, lobbyOwnership: true, disappearingSources: true,
            pendingHovers: true, sourceReparenting: true, lifecycle: true, accessibility: true }));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
