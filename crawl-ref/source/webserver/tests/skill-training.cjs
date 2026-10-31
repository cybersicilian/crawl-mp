/* Actual browser controls against protocol fixtures; native proof is separate. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.TRAINING_PROOF_DIR || '/tmp/dcss-skill-training-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack); });
    try {
        await page.setContent('<!doctype html><html><body><button id="outside">Inspect</button></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'static/tabletop/typography.css',
            'game_data/static/styles/party-inspector.css', 'game_data/static/styles/inspector-sourcebook.css',
            'game_data/static/styles/skill-training.css']) {
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^@import.*$/gm, '') });
        }
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.packets = []; window.handlers = {}; window.watching = false; window.leaked = [];
            const noop = () => {};
            window.modules = {
                jquery: window.jQuery, require: { toUrl: () => 'data:text/css,' },
                comm: { send_message(msg, fields) { window.packets.push({ msg, ...fields }); },
                    register_handlers(handlers) { Object.assign(window.handlers, handlers); } },
                client: { is_watching: () => window.watching }, chat: { tag_item: noop },
                './workflow-actions': { reason: () => '', inspectionReason: () => '', controlledSlot: () => 0,
                    powerButton: () => null, context: () => null, describe: noop,
                    itemSecondaryHint: () => '', itemSecondaryAction: noop },
                './chat-context': { inventory_item: item => item }
            };
            window.define = (dependencies, factory) => {
                if (typeof dependencies === 'function') { factory = dependencies; dependencies = []; }
                window.modules[window.moduleName] = factory(...dependencies.map(name => window.modules[name]));
            };
            const member = slot => ({ player_id: 'hero-' + slot, slot, name: 'Hero ' + slot,
                species: 'Human', job: 'Fighter', hp: 20, hp_max: 20, mp: 0, mp_max: 0,
                auto_training: false, training_supported: true, inventory_known: true,
                inventory: [{ name: '+0 robe', letter: 'a', equipped: true }],
                skills: [{ id: 0, name: 'Fighting', level: '2.0', apt: 0, train: 1,
                    training: 60, can_train: true, target: 0, target_base: false },
                { id: 1, name: 'Short Blades', level: '0.0', apt: -1, train: 0,
                    training: 0, can_train: true, target: 0, target_base: false,
                    base_level: '0.0', cross_training: { bonus: '0.0', points: 0,
                        sources: [{ id: 2, name: 'Long Blades', points: 0 }] } },
                { id: 2, name: 'Long Blades', level: '27.0', apt: 1, train: 0,
                    training: 0, can_train: false, target: 0, target_base: false },
                { id: 4, name: 'Maces & Flails', level: '2.8', base_level: '1.0', apt: 0, train: 1,
                    training: 40, can_train: true, target: 0, target_base: false,
                    cross_training: { bonus: '1.8', points: 120,
                        sources: [{ id: 3, name: 'Axes', points: 80 }, { id: 6, name: 'Staves', points: 40 }] } },
                { id: 12, name: 'Stealth', level: '0.0', apt: 2, manual_bonus: slot === 0 ? 4 : 0,
                    train: 1, training: 0, can_train: true, target: 0, target_base: false }] });
            window.crawl_party = { state: { active_slot: 0, members: [member(0), member(1)] } };
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const [name, file] of [['spell-cost', 'static/scripts/spell-cost.js'],
            ['item-properties', 'static/scripts/item-properties.js'],
            ['character-stat-help', 'static/scripts/character-stat-help.js'],
            ['./party-model', 'game_data/static/party-model.js'], ['./party-status-model', 'game_data/static/party-status-model.js'], ['./status-icons', 'game_data/static/status-icons.js'],
            ['./party-power-cards', 'game_data/static/party-power-cards.js'],
            ['./party-skill-training', 'game_data/static/party-skill-training.js'],
            ['./native-tile-art', 'game_data/static/native-tile-art.js'],
            ['./equipment-paperdoll', 'game_data/static/equipment-paperdoll.js'],
            ['./context-menu', 'game_data/static/context-menu.js'],
            ['./item-context-menu', 'game_data/static/item-context-menu.js'],
            ['./folio-equipment', 'game_data/static/folio-equipment.js'],
            ['./party-inspector-render', 'game_data/static/party-inspector-render.js'],
            ['./menu-keyboard', 'game_data/static/menu-keyboard.js'],
            ['./folio-keyboard', 'game_data/static/folio-keyboard.js'],
            ['inspector', 'game_data/static/party-inspector.js']]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(() => {
            window.modules.inspector.hotkeys();
            document.addEventListener('keydown', event => window.leaked.push(event.key));
            document.addEventListener('keypress', event => window.leaked.push(event.key));
            document.getElementById('outside').onclick = () => window.modules.inspector.open(0, 'skills');
        });
        await page.locator('#outside').click();
        const manualRow = page.locator("tr[data-skill-id='12']");
        assert.equal(await manualRow.locator('.party-skill-apt-value').innerText(), '+6');
        assert.equal(await manualRow.locator('.party-skill-apt-breakdown').innerText(), 'Base +2\nManual +4');
        assert((await manualRow.locator('.party-skill-apt').getAttribute('aria-label')).includes('double training'));
        assert.equal(await page.locator("tr[data-skill-id='0'] .party-skill-apt-value").innerText(), '0');
        assert.equal(await page.locator("tr[data-skill-id='0'] .party-skill-manual-bonus").count(), 0,
            'Older snapshots do not invent manual bonuses');
        for (const [base, bonus, total] of [[-5, 4, '-1'], [-4, 4, '0'], [0, 4, '+4'], [2, 0, '+2'], [2, 4, '+6']]) {
            await page.evaluate(({ base, bonus }) => {
                const skill = window.crawl_party.state.members[0].skills.find(skill => skill.name === 'Stealth');
                Object.assign(skill, { apt: base, manual_bonus: bonus });
                window.modules.inspector.render();
            }, { base, bonus });
            assert.equal(await manualRow.locator('.party-skill-apt-value').innerText(), total);
            assert.equal(await manualRow.locator('.party-skill-manual-bonus').count(), bonus ? 1 : 0,
                'Depleted manuals remove the bonus and its explanation');
        }
        const crossRow = page.locator("tr[data-skill-id='4']");
        assert.equal(await crossRow.locator('.party-skill-cross-bonus').innerText(), 'Cross-training: +1.8');
        assert((await crossRow.locator('.party-skill-cross-training').innerText()).includes('From Axes, Staves'));
        assert.equal(await crossRow.locator('.party-skill-base-level').innerText(), 'Base 1.0');
        assert((await page.locator("tr[data-skill-id='1'] .party-skill-cross-training").innerText())
            .includes('Cross-trains with Long Blades'));
        assert.equal(await page.locator("tr[data-skill-id='0'] .party-skill-cross-training").count(), 0,
            'Older snapshots do not invent cross-training facts');
        await page.evaluate(() => {
            window.crawl_party.state.members[0].skills[3].cross_training = {
                bonus: '0.0', points: 1, sources: [{ id: 3, name: 'Axes', points: 1 }] };
            window.modules.inspector.render();
        });
        assert.equal(await crossRow.locator('.party-skill-cross-bonus').innerText(), 'Cross-training: <0.1');
        await page.evaluate(() => {
            const skill = window.crawl_party.state.members[0].skills[3];
            skill.level = skill.base_level = '27.0';
            window.modules.inspector.render();
        });
        assert.equal(await crossRow.locator('.party-skill-cross-bonus').innerText(), 'Cross-training: At level cap');
        await page.evaluate(() => {
            const skill = window.crawl_party.state.members[0].skills[3];
            Object.assign(skill, { level: '2.8', base_level: '1.0', cross_training: {
                bonus: '1.8', points: 120, sources: [{ id: 3, name: 'Axes', points: 80 }, { id: 6, name: 'Staves', points: 40 }] } });
            window.modules.inspector.render();
        });
        const target = page.getByRole('spinbutton', { name: 'Fighting stop level', exact: true });
        const packets = () => page.evaluate(() => window.packets);
        async function acknowledge() {
            return page.evaluate(() => {
                const packet = window.packets.at(-1);
                window.handlers.skill_training_result({ request_id: packet.request_id, ok: true });
                const member = window.crawl_party.state.members[packet.slot];
                if (packet.action === 'mode') member.auto_training = packet.automatic;
                else {
                    const skill = member.skills.find(skill => skill.id === packet.skill);
                    if (packet.action === 'target') Object.assign(skill, { target: packet.target, target_base: packet.base });
                    else skill.train = packet.train;
                }
                window.modules.inspector.render();
                return packet;
            });
        }
        await target.fill('12.5'); await target.press('Enter');
        assert.equal((await packets()).length, 1, 'Enter sends one update without dungeon keys');
        let packet = await acknowledge();
        assert.equal(packet.target, 125); assert.equal(packet.base, false); assert.equal(packet.slot, 0);
        assert.equal(await target.inputValue(), '12.5');
        assert(await target.evaluate(node => node === document.activeElement), 'Native updates retain keyboard focus');
        await target.fill('13.7');
        await page.evaluate(() => window.modules.inspector.render());
        assert.equal(await target.inputValue(), '13.7', 'Unsubmitted drafts survive party updates');
        await target.press('Enter'); await acknowledge();
        await page.getByRole('combobox', { name: 'Fighting target type' }).selectOption('base');
        packet = await acknowledge(); assert.equal(packet.base, true); assert.equal(packet.target, 137);
        await target.fill('28'); await target.press('Enter');
        const count = (await packets()).length;
        assert.equal(await target.getAttribute('aria-invalid'), 'true');
        await target.fill('2.55'); await target.press('Enter');
        assert.equal((await packets()).length, count, 'Invalid precision never reaches the engine');
        await target.fill('14'); await target.press('Tab');
        packet = await acknowledge(); assert.equal(packet.target, 140);
        await page.getByRole('button', { name: 'Clear Fighting target', exact: true }).click();
        packet = await acknowledge(); assert.equal(packet.target, 0); assert.equal(await target.inputValue(), '');
        for (const [label, value] of [['Focus', 2], ['Off', 0], ['On', 1]]) {
            await page.getByRole('button', { name: 'Fighting training ' + label, exact: true }).focus();
            await page.keyboard.press('Space');
            packet = await acknowledge(); assert.equal(packet.train, value);
            assert.equal(await page.getByRole('button', { name: 'Fighting training ' + label, exact: true }).getAttribute('aria-pressed'), 'true');
        }
        await page.getByRole('button', { name: 'Automatic', exact: true }).click();
        packet = await acknowledge(); assert.equal(packet.automatic, true);
        assert(await page.getByRole('spinbutton', { name: 'Long Blades stop level', exact: true }).isDisabled());
        // Hero selection retains independent targets; permissions apply on every render.
        await page.locator('#party_insp_hero_1').click();
        assert.equal(await manualRow.locator('.party-skill-apt-value').innerText(), '+2');
        assert.equal(await manualRow.locator('.party-skill-manual-bonus').count(), 0,
            'Manual bonuses belong to the inspected hero');
        await target.fill('6.5'); await target.press('Enter');
        packet = await acknowledge(); assert.equal(packet.slot, 1);
        await page.locator('#party_insp_hero_0').click(); assert.equal(await target.inputValue(), '');
        await page.evaluate(() => { window.crawl_party_slot = 1; window.modules.inspector.render(); });
        assert(await target.isDisabled());
        await page.locator('#party_insp_hero_1').click(); assert(await target.isEnabled());
        await page.evaluate(() => { window.watching = true; window.modules.inspector.render(); });
        assert(await target.isDisabled());
        await page.evaluate(() => {
            window.watching = false; window.crawl_party_slot = 0;
            window.crawl_party.state.multiplayer = true;
            window.modules.inspector.render();
        });
        assert(await target.isDisabled(), 'A multiplayer host cannot edit the guest hero');
        await page.locator('#party_insp_hero_0').click();
        assert(await target.isEnabled(), 'The host retains their own training controls');
        await page.locator('#party_insp_hero_1').click();
        await page.evaluate(() => {
            window.watching = false; window.crawl_party_slot = 0;
            window.crawl_party.state.multiplayer = false;
            window.crawl_party.state.members[1].training_locked = 'This hero trains all skills equally.';
            window.modules.inspector.render();
        });
        assert(await target.isDisabled());
        await page.locator('#party_insp_hero_0').click();
        for (const width of [1280, 768, 390]) {
            await page.setViewportSize({ width, height: 800 });
            assert(await page.locator('#party_insp_body').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Training must fit at ' + width);
            await crossRow.scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(out, 'training-' + width + '.png') });
            await manualRow.scrollIntoViewIfNeeded();
            await manualRow.screenshot({ path: path.join(out, 'manual-aptitude-' + width + '.png') });
        }
        assert.deepEqual(await page.evaluate(() => window.leaked), []);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, targets: true, priorities: true, modes: true,
            crossTraining: true, manualAptitudes: true, draftAndFocus: true, keyboardIsolation: true,
            permissions: true, widths: [1280, 768, 390] }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
