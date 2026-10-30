const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Native Tortle selection, guide, preview, and dungeon rendering in disposable QA. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8893';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname)
    || process.env.WEBTILES_PUBLIC_QA_ORIGIN === new URL(url).origin);
const output = process.env.TORTLE_PROOF_DIR || '/tmp/dcss-tortle-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    const assets = ['cell_renderer.js', 'dungeon_renderer.js', 'shell-animation.js',
        'traversal-effects.js', 'sprites/tortle-shell.png'];
    const assetChecks = [], verifiedAssets = new Set();
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    page.on('response', response => {
        const asset = assets.find(name => new URL(response.url()).pathname.endsWith('/' + name));
        if (asset) assetChecks.push(response.body().then(body => {
            assert.equal(response.status(), 200, asset);
            assert.equal(digest(body), digest(fs.readFileSync(path.join(__dirname, '../game_data/static', asset))), asset);
            verifiedAssets.add(asset);
        }));
    });
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(url);
        await signInTestAccount(page, 'DeployQA' + Date.now().toString().slice(-8), 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        await page.locator('#party_slot_species_0_visual_search').fill('tortle');
        await page.locator('#party_slot_species_0_visual_choices [data-value="Tortle"]').click();
        await page.waitForFunction(() => document.querySelector('#party_slot_species_0').value === 'Tortle');
        await page.locator('#party_slot_job_0').selectOption('Fighter');
        const catalog = await page.evaluate(() => require('character-catalog').species.Tortle);
        assert(catalog.selectable && catalog.abbr === 'To');
        assert.equal(catalog.tile.native, 'TILEP_BASE_TORTLE');
        assert(catalog.traits.some(trait => trait.includes('cold-blooded')));
        assert(catalog.traits.some(trait => trait.includes('30% slower')));
        assert(catalog.traits.some(trait => trait.includes('reflexively bite')));
        const image = await page.request.get(new URL(catalog.tile.src, url).href);
        assert.equal(image.status(), 200);
        const hero = page.locator('.party-slot-box[data-slot="0"]');
        await hero.locator('.party-field-row:has(.party-slot-species) .character-choice-details').click();
        await page.locator('#character_guide_dialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#character_guide_title').innerText(), 'Tortle');
        const guide = await page.locator('.character-guide-body').innerText();
        assert(guide.includes('cold-blooded') && guide.includes('shell'));
        assert(guide.includes('bite'));
        await page.screenshot({ path: path.join(output, 'tortle-guide.png') });
        await page.keyboard.press('Escape');
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.some(member => member.species === 'Tortle'),
                                   null, { timeout: 120000 });
        await page.locator('#dungeon').waitFor({ state: 'visible' });
        await page.locator('#loader').waitFor({ state: 'hidden' });
        await page.screenshot({ path: path.join(output, 'tortle-dungeon.png') });
        const standing = await page.evaluate(() => window.crawl_party.state.members[0]);
        const retract = standing.abilities.find(ability => ability.name === 'Retract into Shell');
        assert(retract, 'native Tortle has a shell retraction ability');
        await page.evaluate(ability => require('comm').send_message('power_action', {
            expected_slot: 0, kind: 'ability', id: ability.id, letter: ability.hotkey
        }), retract);
        await page.waitForFunction(turns => {
            const hero = window.crawl_party.state.members[0];
            return hero.turns > turns && hero.statuses.some(status => status.light === 'Shell');
        }, standing.turns);
        await page.screenshot({ path: path.join(output, 'tortle-retracted.png') });
        const state = await page.evaluate(() => window.crawl_party.state);
        assert(state.members[0].ac > standing.ac);
        assert.equal(state.members[0].move_aut, standing.move_aut * 2);
        assert(state.members[0].abilities.some(ability => ability.name === 'Shell Dash'));
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/shell-animation'));
            return require(name).paint(document.createElement('canvas').getContext('2d'), 0, 0, 32, 32);
        });
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
            return name && require(name).ready();
        });
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        const resume = page.locator('#game_library_panel [data-library-load]').first();
        await resume.waitFor({ state: 'visible' });
        await page.evaluate(() => { window.crawl_party.state = null; });
        await resume.click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.some(member => member.species === 'Tortle'),
                                   null, { timeout: 120000 });
        await page.locator('#loader').waitFor({ state: 'hidden' });
        const restored = await page.evaluate(() => window.crawl_party.state);
        assert.deepEqual(restored.members[0].mutations, state.members[0].mutations);
        assert.equal(restored.members[0].ac, state.members[0].ac);
        assert(restored.members[0].statuses.some(status => status.light === 'Shell'));
        const clearDirection = () => page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/map_knowledge'));
            const map = require(name);
            const hero = window.crawl_party.state.members[0];
            return [[1, 0, 'ArrowRight'], [-1, 0, 'ArrowLeft'], [0, 1, 'ArrowDown'], [0, -1, 'ArrowUp']]
                .find(([x, y]) => {
                    const cell = map.get(hero.pos.x + x, hero.pos.y + y);
                    return map.visible(cell) && /floor/i.test(cell.feature_name || '') && !cell.mon;
                });
        });
        const direction = await clearDirection();
        assert(direction, 'the starting area has a clear direction for a shell dash');
        await page.evaluate(() => {
            window.shellEffects = [];
            const comm = require('comm'), original = comm.handle_message;
            comm.handle_message = function (message) {
                if (message.msg === 'traversal_effect') window.shellEffects.push(message);
                return original.apply(this, arguments);
            };
        });
        const dash = restored.members[0].abilities.find(ability => ability.name === 'Shell Dash');
        const aim = async () => {
            await page.evaluate(ability => require('comm').send_message('power_action', {
                expected_slot: 0, kind: 'ability', id: ability.id, letter: ability.hotkey
            }), dash);
            await page.waitForFunction(() => {
                const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/game-context'));
                return require(name).can_target();
            });
            const point = await page.evaluate(([dx, dy]) => {
                const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/dungeon_renderer'));
                const renderer = require(name), hero = window.crawl_party.state.members[0];
                const cell = renderer.canvas_coords(hero.pos.x + dx, hero.pos.y + dy);
                const box = renderer.element.getBoundingClientRect();
                return { x: box.left + (cell.x + cell.width / 2) * box.width / renderer.element.width,
                    y: box.top + (cell.y + cell.height / 2) * box.height / renderer.element.height };
            }, direction);
            await page.mouse.move(point.x, point.y);
            await page.waitForFunction(([dx, dy]) => {
                const names = Object.keys(require.s.contexts._.defined);
                const map = require(names.find(key => key.endsWith('/map_knowledge')));
                const feat = require(names.find(key => key.endsWith('/tileinfo-feat')));
                const hero = window.crawl_party.state.members[0];
                const overlays = map.get(hero.pos.x + dx, hero.pos.y + dy).t?.ov || [];
                return overlays.some(tile => tile === feat.RAY || tile === feat.RAY_OUT_OF_RANGE);
            }, direction);
            return point;
        };
        await aim();
        await page.screenshot({ path: path.join(output, 'tortle-shell-reticle.png') });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
            return require(name).ready();
        });
        assert.equal(await page.evaluate(() => window.crawl_party.state.members[0].turns), restored.members[0].turns);
        const point = await aim();
        await page.mouse.click(point.x, point.y);
        await page.locator('.traversal-particles').waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(output, 'tortle-shell-particles.png') });
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns,
                                   restored.members[0].turns);
        const rolled = await page.evaluate(() => window.crawl_party.state.members[0]);
        assert.equal(rolled.turns, restored.members[0].turns + 1);
        assert(rolled.pos.x !== restored.members[0].pos.x || rolled.pos.y !== restored.members[0].pos.y);
        assert(!rolled.statuses.some(status => status.light === 'Shell'), 'a successful dash automatically emerges');
        assert.equal(rolled.ac, standing.ac);
        assert.equal(rolled.move_aut, standing.move_aut);
        const recovery = rolled.statuses.find(status => status.light === '-Dash');
        assert.equal(recovery?.dur, 5, 'five full turns of recovery remain after resolving the dash');
        assert(rolled.hp < restored.members[0].hp, 'a successful dash causes recoil');
        const effects = await page.evaluate(() => window.shellEffects);
        assert.equal(effects.length, 1);
        assert(effects[0].path.length >= 2, 'native VFX uses actual traversed cells');
        assert(!rolled.abilities.some(ability => ability.name === 'Shell Dash'));
        assert.equal(effects[0].sprite, 'shell');
        await page.screenshot({ path: path.join(output, 'tortle-shell-dash.png') });
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        await resume.waitFor({ state: 'visible' });
        await page.evaluate(() => { window.crawl_party.state = null; });
        await resume.click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.[0]?.statuses?.some(status => status.light === '-Dash'),
                                   null, { timeout: 120000 });
        await page.locator('#loader').waitFor({ state: 'hidden' });
        const savedRecovery = await page.evaluate(() => window.crawl_party.state.members[0]);
        assert.equal(savedRecovery.statuses.find(status => status.light === '-Dash').dur, 5);
        for (let turn = 0; turn < 5; turn++) {
            const before = await page.evaluate(() => window.crawl_party.state.members[0].turns);
            await page.keyboard.press('.');
            await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, before);
        }
        assert(!await page.evaluate(() => window.crawl_party.state.members[0].statuses.some(status => status.light === '-Dash')));
        const recovered = await page.evaluate(() => window.crawl_party.state.members[0]);
        const shell = recovered.abilities.find(ability => ability.name === 'Retract into Shell');
        await page.evaluate(ability => require('comm').send_message('power_action', {
            expected_slot: 0, kind: 'ability', id: ability.id, letter: ability.hotkey
        }), shell);
        await page.waitForFunction(turns => {
            const hero = window.crawl_party.state.members[0];
            return hero.turns > turns && hero.statuses.some(status => status.light === 'Shell');
        }, recovered.turns);
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
            return require(name).ready();
        });
        const beforeStep = await page.evaluate(() => window.crawl_party.state.members[0]);
        const stepDirection = await clearDirection();
        assert(stepDirection, 'an empty floor cell is available for the slow ordinary step');
        await page.keyboard.press(stepDirection[2]);
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, beforeStep.turns);
        const stepped = await page.evaluate(() => window.crawl_party.state.members[0]);
        assert.equal(stepped.pos.x, beforeStep.pos.x + stepDirection[0]);
        assert.equal(stepped.pos.y, beforeStep.pos.y + stepDirection[1]);
        assert.equal(stepped.last_action_aut, 26);
        assert(stepped.statuses.some(status => status.light === 'Shell'));
        assert(!stepped.statuses.some(status => status.light === '-Dash'));
        await page.screenshot({ path: path.join(output, 'tortle-shell-slow-step.png') });
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        await resume.waitFor({ state: 'visible' });
        await Promise.all(assetChecks);
        assert.equal(verifiedAssets.size, assets.length, 'every changed game asset was delivered with matching bytes');
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ catalog, state, restored, rolled, recovery,
            savedRecovery, stepped, effects, verifiedAssets: [...verifiedAssets], errors }, null, 2));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, species: 'Tortle', shellDash: true, saveResume: true,
            reticle: true, particles: true, shellAnimation: true, autoEmerge: true, slowStep: true,
            cooldown: true, recoil: true, verifiedAssets: [...verifiedAssets], output }));
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
        throw error;
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
