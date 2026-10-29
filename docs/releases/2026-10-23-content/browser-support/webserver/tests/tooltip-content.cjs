/* Native description variations, shared presentation and accessible disclosure. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.TOOLTIP_CONTENT_PROOF_DIR || '/tmp/dcss-tooltip-content-proof';
const dagger = '+10 dagger of the Summoning Ancients {devious, rElec rC- Int+5 Stlth+}';
const daggerProperties = ['brand-devious', 'electricity', 'cold', 'intelligence', 'stealth'];
const armour = 'A leather suit covered with metal plates attached to each other in overlapping rows to provide full protection, but at the cost of reduced freedom of movement.\n\n' +
    'Base armour rating: 6       Encumbrance rating: 10\n\n' +
    'It can be maximally enchanted to +6.\n\n\n\nStash search prefixes: \nMenu/colouring prefixes: identified equipped armour';

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html><head><style>body { margin: 30px; background: #222620; }' +
            'button { padding: 10px; } #lobby_rich_tooltip { display:none; }</style></head><body>' +
            '<main id="normal"><button id="entry">+0 scale mail</button><button id="away">Away</button></main>' +
            '<div id="lobby_rich_tooltip"></div></body></html>');
        for (const file of ['static/styles/lobby-chronicle.css', 'game_data/static/styles/game-coop.css',
            'static/tabletop/tokens.css', 'static/tabletop/materials.css', 'static/tabletop/typography.css',
            'static/tabletop/properties.css', 'static/tabletop/starting-sheet.css',
            'static/tabletop/tooltip-content.css', 'game_data/static/styles/nested-tips.css'])
            await page.addStyleTag({ path: path.join(root, file) });
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
            ['starting-entry-help', 'static/scripts/starting-entry-help.js'],
            ['lobby', 'static/scripts/client-tooltips.js'],
            ['./tip-placement', 'game_data/static/tip-placement.js'],
            ['./tooltip-glossary', 'game_data/static/tooltip-glossary.js'],
            ['./persistent-help', 'game_data/static/persistent-help.js'],
            ['./nested-tips', 'game_data/static/nested-tips.js'],
            ['interactions', 'game_data/static/player-interactions.js'],
            ['hover', 'game_data/static/hover-cards.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        const parsed = await page.evaluate(armour => {
            const parse = window.modules['tooltip-content'].parse;
            return {
                armour: parse(armour, 'Equipped · Native starting equipment'),
                shield: parse('Base shield rating: 4     Encumbrance rating: 5     Max blocks/turn: 3'),
                weapon: parse('Base accuracy: +0  Base damage: 10  Base attack delay: 1.4\n' +
                    "This weapon's minimum attack delay (0.7) is reached at skill level 14."),
                infinite: parse('Base accuracy: ∞  Base damage: inf  Base attack delay: 1.0'),
                evasion: parse('Base armour rating: 0   Evasion: -2'),
                unknown: parse('Base damage: 10 with an unfamiliar qualification.\n\nKeep this whole paragraph.'),
                empty: parse('Stash search prefixes: \nMenu/colouring prefixes: '),
                spell: parse('Spell description.', 'Memorized · Level 1 · 0 MP · Alchemy/Air · Power: 24% · Fail: 0% · Damage: 1d4 · Range: 4'),
                skill: parse('Skill description.', 'Level 0 · Aptitude -2 · Native starting skill'),
                unavailable: parse('', 'Power: — · Fail: Unavailable')
            };
        }, armour);
        const values = entry => entry.facts.map(fact => [fact.key, fact.value]);
        assert.deepEqual(values(parsed.armour), [['Base armour rating', '6'], ['Encumbrance rating', '10'], ['Enchantment limit', '+6']]);
        assert(!parsed.armour.text.includes('rating:'));
        assert.equal(parsed.armour.search.length, 1, 'Empty search prefixes are omitted');
        assert.equal(parsed.armour.meta, 'Equipped · Native starting equipment');
        assert.deepEqual(values(parsed.shield), [['Base shield rating', '4'], ['Encumbrance rating', '5'], ['Max blocks/turn', '3']]);
        assert.deepEqual(values(parsed.weapon), [['Base accuracy', '+0'], ['Base damage', '10'], ['Base attack delay', '1.4 t'],
            ['Minimum attack delay', '0.7 t'], ['Minimum delay skill', '14']]);
        assert.deepEqual(values(parsed.infinite).slice(0, 2), [['Base accuracy', '∞'], ['Base damage', 'inf']]);
        assert.deepEqual(values(parsed.evasion), [['Base armour rating', '0'], ['Evasion', '-2']]);
        assert.equal(parsed.unknown.facts.length, 0);
        assert.match(parsed.unknown.text, /with an unfamiliar qualification/);
        assert.equal(parsed.empty.search.length, 0);
        assert.deepEqual(values(parsed.spell), [['Level', '1'], ['MP', '0 MP'], ['Power', '24%'], ['Fail', '0%'], ['Damage', '1d4'], ['Range', '4']]);
        assert.equal(parsed.spell.meta, 'Memorized · Alchemy/Air');
        assert.deepEqual(values(parsed.skill), [['Level', '0'], ['Aptitude', '-2']]);
        assert.equal(parsed.unavailable.facts.length, 0);

        await page.evaluate(armour => {
            window.modules['starting-entry-help'].equipment(document.getElementById('entry'),
                { name: '+0 scale mail', description: armour, equipped: true });
            window.tips = window.modules.lobby({ in_game: () => false }); window.tips.init_lobby_tooltips();
        }, armour);
        await page.locator('#entry').focus();
        const tip = page.locator('#lobby_rich_tooltip');
        assert(await tip.isVisible());
        assert.deepEqual(await tip.locator('.tip-fact-value').allTextContents(), ['6', '10', '+6']);
        assert.equal(await tip.locator('.tip-fact-label svg[aria-hidden="true"]').count(), 3);
        assert.equal(await tip.locator('.tip-state').innerText(), 'Equipped');
        assert.equal(await tip.locator('details').getAttribute('open'), null);
        assert(!(await tip.innerText()).includes('identified equipped armour'));
        assert.equal(await page.locator('#entry').getAttribute('aria-describedby'), 'lobby_rich_tooltip');
        await tip.screenshot({ path: path.join(output, 'scale-mail-desktop.png') });
        await tip.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert((await tip.innerText()).includes('identified equipped armour'));
        assert(!(await tip.innerText()).includes('Stash search prefixes'));
        await page.keyboard.press('Escape'); assert.equal(await tip.isVisible(), false);

        await page.setViewportSize({ width: 360, height: 700 });
        await page.locator('#entry').evaluate(node => { node.style.cssText = 'position:fixed;left:20px;bottom:30px'; });
        await page.locator('#away').focus(); await page.locator('#entry').focus();
        await tip.locator('summary').click();
        await page.waitForFunction(() => {
            const rect = document.getElementById('lobby_rich_tooltip').getBoundingClientRect();
            return rect.bottom <= innerHeight - 7;
        });
        assert(await tip.locator('details').evaluate(node => node.open));
        await page.keyboard.press('Escape');
        await page.locator('#entry').evaluate(node => { node.style.cssText = ''; });

        for (const [width, height] of [[360, 700], [320, 240]]) {
            await page.setViewportSize({ width, height });
            await page.locator('#away').focus(); await page.locator('#entry').focus();
            const bounds = await tip.boundingBox();
            assert(bounds.x >= 7 && bounds.x + bounds.width <= width - 7);
            assert(bounds.y >= 7 && bounds.y + bounds.height <= height - 7);
            assert(await tip.evaluate(node => node.scrollWidth <= node.clientWidth), 'No horizontal clipping');
            await tip.screenshot({ path: path.join(output, `scale-mail-${width}.png`) });
            if (height === 240) {
                const before = await tip.evaluate(node => node.querySelector('.lobby-tip-body').scrollTop);
                await page.keyboard.press('PageDown');
                assert(await tip.evaluate((node, before) => node.querySelector('.lobby-tip-body').scrollTop > before, before));
            }
        }
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.evaluate(() => {
            const node = document.createElement('div'); document.body.appendChild(node);
            const renderer = window.modules['tooltip-content'];
            renderer.render(node, '<img src=x onerror=alert(1)>\n\nStash search prefixes: <script>unsafe()</script>',
                'Damage: <svg onload=alert(1)>');
            window.unsafeFixture = node;
        });
        assert.equal(await page.evaluate(() => window.unsafeFixture.querySelectorAll('img, script, svg[onload]').length), 0);
        assert((await page.evaluate(() => window.unsafeFixture.textContent)).includes('<img src=x'));

        // The same item renders through the game and its persistent reading path.
        await page.evaluate(() => {
            window.tips.hide_lobby_tooltip(); window.jQuery(document).off('.lobbytip');
            window.modules.interactions.init();
        });
        await page.locator('#away').focus(); await page.locator('#entry').focus();
        const gameTip = page.locator('#dcss_rich_tooltip');
        assert.deepEqual(await gameTip.locator('.tip-fact-value').allTextContents(), ['6', '10', '+6']);
        await gameTip.locator('.workflow-help-open').click();
        const reading = page.locator('#workflow_help_dialog[open]');
        assert((await reading.innerText()).includes('Base armour rating: 6'));
        assert((await reading.innerText()).includes('Equipped'));
        await page.keyboard.press('Escape');
        await page.evaluate(armour => {
            const node = document.createElement('div'); node.id = 'fixture_hover'; document.body.appendChild(node);
            window.modules.hover.show(node, { title: '+0 scale mail', body: armour, badge: 'Item', meta: 'Carried' }, 400, 200);
        }, armour);
        assert.deepEqual(await page.locator('#fixture_hover .tip-fact-value').allTextContents(), ['6', '10', '+6']);

        async function checkItemTitle(title) {
            assert.equal(await title.locator('.item-base-name').textContent(), '+10 dagger of the Summoning Ancients');
            assert.deepEqual(await title.locator('.item-property').evaluateAll(nodes => nodes.map(node => node.dataset.property)), daggerProperties);
            assert.deepEqual(await title.locator('.item-property-value').allTextContents(), ['-', '+5', '+']);
            assert(!(await title.textContent()).includes('{'), 'Properties render without brace text');
            assert.equal(await title.locator('[tabindex]').count(), 0, 'Preview badges add no keyboard stops');
            assert.equal(await title.getAttribute('data-tip-reading-title'), dagger, 'Reading retains the full item properties');
            assert.equal(await title.locator('[data-property="cold"]').getAttribute('data-tip-title'), 'Cold resistance -');
        }
        await page.evaluate(dagger => {
            document.getElementById('fixture_hover').remove();
            const entry = document.getElementById('entry');
            entry.setAttribute('data-tip-title', dagger);
            entry.setAttribute('data-tip-badge', 'Hand Weapons');
            entry.setAttribute('data-tip-body', 'A double-edged fighting knife with a sharp point.');
            entry.setAttribute('data-tip-meta', 'Equipped · Click: unwield. Right-click: inspect.');
            window.tips.show_lobby_tooltip(entry);
        }, dagger);
        await checkItemTitle(tip.locator('.lobby-tip-title'));
        await page.evaluate(() => window.tips.hide_lobby_tooltip());
        for (const width of [1024, 360, 320]) {
            await page.setViewportSize({ width, height: 768 });
            await page.locator('#away').focus(); await page.locator('#entry').hover(); await page.locator('#entry').focus();
            assert(await gameTip.isVisible());
            await checkItemTitle(gameTip.locator('.dcss-tip-title'));
            assert(await gameTip.evaluate(node => node.scrollWidth <= node.clientWidth), 'Item badges wrap inside the card');
            assert(await gameTip.locator('.item-property').evaluateAll(nodes => nodes.every(node => {
                const badge = node.getBoundingClientRect(), card = node.closest('#dcss_rich_tooltip').getBoundingClientRect();
                return badge.left >= card.left && badge.right <= card.right;
            })), 'Every badge stays within the card');
            await gameTip.screenshot({ path: path.join(output, `item-badges-${width}.png`) });
            await page.keyboard.press('Escape');
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('#away').focus(); await page.locator('#entry').hover(); await page.locator('#entry').focus();
        await gameTip.locator('[data-property="electricity"]').hover();
        const nestedTip = page.locator('.dcss-nested-tip').last();
        await nestedTip.waitFor({ state: 'visible' });
        assert.equal(await nestedTip.locator('.dcss-tip-title').textContent(), 'Electricity resistance');
        assert.match(await nestedTip.locator('.dcss-tip-body').textContent(), /electric/i);
        await gameTip.locator('.dcss-tip-body').evaluate((node, dagger) => {
            const source = document.createElement('button'); source.id = 'nested_item';
            source.setAttribute('data-tip-title', dagger); source.setAttribute('data-tip-body', 'A nested item.');
            source.textContent = 'Related item'; node.appendChild(source);
        }, dagger);
        await page.locator('#nested_item').hover();
        await page.waitForFunction(dagger => document.querySelector('.dcss-nested-tip .dcss-tip-title')
            ?.getAttribute('data-tip-reading-title') === dagger, dagger);
        await checkItemTitle(nestedTip.locator('.dcss-tip-title'));
        await gameTip.locator('.workflow-help-open').click();
        await checkItemTitle(reading.locator('#workflow_help_title'));
        await page.keyboard.press('Escape');
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ parsed, errors }, null, 2));
        console.log('Native item facts, item badges in lobby/game/nested/reading cards, exact values, nested explanations and small-screen rendering passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
