/* Real-browser inspector hover/focus contract, using native description fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = process.env.POWER_PROOF_DIR || '/tmp/dcss-power-hover-proof';
fs.mkdirSync(output, { recursive: true });

function description(file, name) {
    const blocks = fs.readFileSync(path.join(root, '../dat/descript', file), 'utf8').split('%%%%');
    const lines = blocks.map(block => block.trim().split('\n').filter(line => !line.startsWith('#')))
        .find(lines => lines[0] === name);
    assert(lines, `Native description missing: ${name}`);
    return lines.slice(1).join('\n').trim().replace(/(?<!\n)\n(?!\n)/g, ' ');
}

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack); });
    try {
        await page.setContent('<!doctype html><html><body><button id="opener">Inspect hero</button>' +
            '<span id="existing-help">Existing help</span></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'game_data/static/styles/game-coop.css',
            'static/tabletop/materials.css', 'static/tabletop/typography.css',
            'static/tabletop/properties.css', 'static/tabletop/tooltip-content.css',
            'game_data/static/styles/party-inspector.css', 'static/tabletop/character-folio.css',
            'game_data/static/styles/nested-tips.css'])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^@import.*$/gm, '') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(({ spell, distill, ability }) => {
            window.modules = { jquery: window.jQuery, require: { toUrl: () => 'data:text/css,' },
                client: { is_watching: () => false },
                comm: { register_handlers: () => {},
                    send_message: () => { throw new Error('Inspecting a power must not send a game action'); } },
                chat: { tag_item: () => {} }, './chat-context': { inventory_item: item => item } };
            window.define = (deps, factory) => {
                if (typeof deps === 'function') { factory = deps; deps = []; }
                window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name]));
            };
            window.crawl_party = { state: { active_slot: 0, members: [{
                name: 'Lyra', slot: 0, species: 'Human', job: 'Alchemist', hp: 15, hp_max: 15, mp: 4, mp_max: 4,
                abilities: [{ name: 'Berserk', desc: ability, hotkey: 'a', cost: 'None', fail: '0%', is_god: true },
                    { name: 'Long description', desc: 'An exceptionally lengthy explanation. '.repeat(160), fail: 12 }],
                spells: [{ name: 'Poisonous Vapours', desc: spell, letter: 'a', level: 1, schools: 'Alchemy/Air', power: '24%', fail: '12%' },
                    { name: 'Fulsome Distillation', desc: distill, letter: 'b', level: 1, schools: 'Necromancy/Alchemy', power: '12%', fail: 12 },
                    { name: '<img src=x onerror=alert(1)>', desc: '<script>unsafe()</script>', letter: 'c', fail: '30%' },
                    { name: 'Older snapshot', letter: 'd' }], inventory: [], resists: {}
            }, { name: 'Wren', slot: 1, species: 'Human', job: 'Fighter', abilities: [], spells: [], inventory: [] }] } };
        }, { spell: description('spells.txt', 'Poisonous Vapours spell'),
            distill: description('spells.txt', 'Fulsome Distillation spell'), ability: description('ability.txt', 'Berserk ability') });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const [name, file] of [
            ['spell-cost', 'static/scripts/spell-cost.js'],
            ['item-properties', 'static/scripts/item-properties.js'],
            ['tooltip-content', 'static/scripts/tooltip-content.js'],
            ['character-stat-help', 'static/scripts/character-stat-help.js'],
            ['./party-model', 'game_data/static/party-model.js'], ['./party-status-model', 'game_data/static/party-status-model.js'],
            ['./effect-icon-catalog', 'game_data/static/effect-icon-catalog.js'], ['./effect-icon-art', 'game_data/static/effect-icon-art.js'], ['./status-icons', 'game_data/static/status-icons.js'],
            ['./party-power-cards', 'game_data/static/party-power-cards.js'],
            ['./enums', 'game_data/static/enums.js'],
            ['./workflow-actions', 'game_data/static/workflow-actions.js'],
            ['./native-tile-art', 'game_data/static/native-tile-art.js'],
            ['./equipment-paperdoll', 'game_data/static/equipment-paperdoll.js'],
            ['./context-menu', 'game_data/static/context-menu.js'],
            ['./party-skill-training', 'game_data/static/party-skill-training.js'],
            ['./item-context-menu', 'game_data/static/item-context-menu.js'],
            ['./folio-bag', 'game_data/static/folio-bag.js'],
            ['./folio-equipment', 'game_data/static/folio-equipment.js'],
            ['./party-inspector-render', 'game_data/static/party-inspector-render.js'],
            ['./tooltip-glossary', 'game_data/static/tooltip-glossary.js'],
            ['./persistent-help', 'game_data/static/persistent-help.js'],
            ['tooltip-policy', 'static/scripts/tooltip-policy.js'],
            ['tooltip-source', 'static/scripts/tooltip-source.js'],
            ['tooltip-layout', 'static/scripts/tooltip-layout.js'],
            ['./tip-placement', 'game_data/static/tip-placement.js'],
            ['./nested-tips', 'game_data/static/nested-tips.js'],
            ['interactions', 'game_data/static/player-interactions.js'],
            ['./menu-keyboard', 'game_data/static/menu-keyboard.js'],
            ['./folio-keyboard', 'game_data/static/folio-keyboard.js'],
            ['inspector', 'game_data/static/party-inspector.js']
        ]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.modules.interactions.init();
            window.modules.inspector.hotkeys();
            document.getElementById('opener').onclick = () => window.modules.inspector.open(0, 'abilities');
        });
        await page.locator('#opener').click();
        const rows = page.locator('#party_insp_panel_abilities .party-power-row');
        const tip = page.locator('#dcss_rich_tooltip');
        const spell = rows.filter({ hasText: 'Poisonous Vapours' });
        const ability = rows.filter({ hasText: 'Berserk' });
        await spell.locator('td').nth(1).hover();
        await tip.waitFor({ state: 'visible' });
        assert.match(await tip.innerText(), /Transmutes a small amount/);
        assert.equal(await tip.locator('[data-stat="Level"] .tip-fact-value').innerText(), '1');
        assert.equal(await tip.locator('[data-stat="Power"] .tip-fact-value').innerText(), '24%');
        assert.equal(await tip.locator('[data-stat="Fail"] .tip-fact-value').innerText(), '12%');
        assert.match(await tip.locator('.dcss-tip-meta').innerText(), /Alchemy\/Air/);
        assert.equal(await spell.locator('td').nth(5).innerText(), '12%');
        assert.equal(await rows.filter({ hasText: 'Fulsome Distillation' }).locator('td').nth(5).innerText(), '12%');
        assert.equal(await spell.getAttribute('aria-describedby'), 'dcss_rich_tooltip');
        assert(await tip.evaluate(node => node.closest('dialog').open));
        await page.screenshot({ path: path.join(output, 'spell-hover-1280.png') });
        console.log('Spell hover and native metadata passed');

        // Native glossary links can be entered without losing the parent card.
        await page.waitForFunction(() => document.getElementById('dcss_rich_tooltip').classList.contains('is-locked'));
        const term = tip.locator('.dcss-term').first();
        assert(await term.count(), 'Native prose should contain a glossary term');
        await term.hover();
        await page.locator('.dcss-nested-tip').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.dcss-nested-tip').count(), 0);
        assert.equal(await tip.getAttribute('aria-hidden'), 'true');
        assert(await page.locator('#party_inspector_modal').evaluate(node => node.open));
        console.log('Nested cards and Escape passed');

        await ability.evaluate(node => node.setAttribute('aria-describedby', 'existing-help'));
        await ability.hover();
        await tip.waitFor({ state: 'visible' });
        assert.match(await tip.innerText(), /Sends the user into a berserk rage/);
        assert.equal(await tip.locator('[data-stat="Cost"] .tip-fact-value').innerText(), 'None');
        assert.equal(await tip.locator('[data-stat="Fail"] .tip-fact-value').innerText(), '0%');
        assert.match(await tip.locator('.dcss-tip-meta').innerText(), /Divine invocation/);
        await ability.focus();
        assert.match(await ability.getAttribute('aria-describedby'), /existing-help.*dcss_rich_tooltip/);
        await page.keyboard.press('Tab');
        assert.equal(await ability.getAttribute('aria-describedby'), 'existing-help');
        assert.match(await tip.innerText(), /An exceptionally lengthy explanation/);
        await page.waitForFunction(() => document.getElementById('dcss_rich_tooltip').classList.contains('is-locked'));
        const body = tip.locator('.dcss-tip-body');
        assert(await body.evaluate(node => node.scrollHeight > node.clientHeight));
        await body.hover();
        await page.mouse.wheel(0, 220);
        await page.waitForFunction(() => document.querySelector('#dcss_rich_tooltip .dcss-tip-body').scrollTop > 0);
        assert(await tip.isVisible());
        console.log('Ability focus and long-description scrolling passed');
        await tip.getByRole('button', { name: 'Read details', exact: true }).click();
        await page.locator('#workflow_help_dialog[open]').waitFor();
        assert.match(await page.locator('#workflow_help_dialog').innerText(), /An exceptionally lengthy explanation/);
        await page.keyboard.press('Escape');
        await page.locator('#workflow_help_dialog').waitFor({ state: 'detached' });
        assert(await page.locator('#party_inspector_modal').evaluate(node => node.open), 'Closing help preserves the underlying character context');

        await spell.focus();
        await page.keyboard.press('Tab');
        assert.match(await tip.innerText(), /Extracts alchemical humours/);
        await page.keyboard.press('Tab');
        assert.match(await tip.innerText(), /<script>unsafe\(\)<\/script>/);
        assert.equal(await tip.locator('script, img').count(), 0);
        await page.keyboard.press('Tab');
        assert.match(await tip.innerText(), /No description is available for this spell/);
        assert.match(await tip.innerText(), /Unavailable/);
        await page.keyboard.press('2');
        assert.equal(await tip.getAttribute('aria-hidden'), 'true');
        assert.equal(await page.locator('#party_insp_panel_abilities .party-power-row').count(), 0);
        assert.match(await page.locator('#party_insp_panel_abilities').innerText(), /No spells memorised/);
        await page.keyboard.press('1');
        await spell.focus();
        await page.evaluate(() => window.modules.inspector.render());
        assert.equal(await tip.getAttribute('aria-hidden'), 'true', 'Fresh snapshots dismiss detached cards');
        await spell.hover();
        await page.locator('#party_insp_tab_overview').click();
        assert.equal(await tip.getAttribute('aria-hidden'), 'true');

        // The card remains on screen near the edge of a narrow viewport.
        await page.setViewportSize({ width: 420, height: 700 });
        await page.locator('#party_insp_tab_abilities').click();
        await spell.focus();
        await tip.waitFor({ state: 'visible' });
        const bounds = await tip.boundingBox();
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 420 && bounds.y + bounds.height <= 700);
        await page.screenshot({ path: path.join(output, 'spell-focus-420.png') });
        await page.keyboard.press('Escape');
        assert(await page.locator('#party_inspector_modal').evaluate(node => node.open));
        await page.keyboard.press('Escape');
        assert(await page.locator('#opener').evaluate(node => node === document.activeElement));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, nativeProse: true, hoverAndFocus: true,
            nestedCards: true, scrollableDescriptions: true, safeText: true, viewportBounds: true, output }));
    } catch (error) {
        console.error(error);
        await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ errors,
            state: await page.evaluate(() => ({ tip: document.getElementById('dcss_rich_tooltip').outerHTML,
                focus: document.activeElement.outerHTML })).catch(() => null) }, null, 2));
        throw error;
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
