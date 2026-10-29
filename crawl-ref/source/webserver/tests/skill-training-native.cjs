const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Disposable native party: targets, priorities, validation, save/reload, auto-stop. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8892';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.TRAINING_PROOF_DIR || '/tmp/dcss-skill-training-native-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(30000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const skill = (slot, name) => page.evaluate(({ slot, name }) =>
        window.crawl_party.state.members[slot].skills.find(skill => skill.name === name), { slot, name });
    async function waitSkill(slot, name, values) {
        await page.waitForFunction(({ slot, name, values }) => {
            const skill = window.crawl_party?.state?.members[slot]?.skills.find(skill => skill.name === name);
            return skill && Object.entries(values).every(([key, value]) => skill[key] === value);
        }, { slot, name, values });
    }
    async function key(value) {
        await page.evaluate(value => require('comm').send_message('key', { keycode: value.codePointAt(0) }), value);
    }
    async function text(value) {
        const input = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await input.fill(value); await input.press('Enter');
    }
    async function open(slot) {
        await page.evaluate(slot => window.crawl_party.open_inspector(slot, 'skills'), slot);
    }
    async function setTarget(slot, name, value) {
        await open(slot);
        const input = page.getByRole('spinbutton', { name: name + ' stop level', exact: true });
        await input.fill(value); await input.press('Enter');
        await waitSkill(slot, name, { target: Math.round(Number(value) * 10) });
    }
    try {
        await page.goto(url);
        evidence.account = 'TrainingQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        for (let slot = 1; slot < 3; slot++) {
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
        }
        await page.locator(".party-slot-box[data-slot='2'] .party-slot-species").selectOption('Gnoll');
        await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('3 heroes'));
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3, null, { timeout: 120000 });
        await page.waitForFunction(() => {
            const names = Object.keys(require.s.contexts._.defined);
            const name = names.find(name => name.endsWith('/enums'));
            const game = names.find(name => name.endsWith('/game'));
            return name && game && require(game).get_input_mode() === require(name).mouse_mode.COMMAND;
        });
        console.log('Native party is command-ready.');
        const initial = await state();
        assert(initial.members.every(member => member.training_supported));
        const boosted = initial.members[0].skills.find(skill => Number(skill.cross_training.bonus) > 0);
        assert(boosted, 'A starting weapon supplies native cross-training to a related skill');
        assert.equal(Number(boosted.level).toFixed(1),
            (Number(boosted.base_level) + Number(boosted.cross_training.bonus)).toFixed(1));
        for (const member of initial.members) {
            for (const skill of member.skills) {
                assert.equal(skill.cross_training.points,
                    skill.cross_training.sources.reduce((total, source) => total + source.points, 0));
                assert(Number(skill.cross_training.bonus) >= 0);
            }
        }
        assert(initial.members[2].skills.every(skill => skill.cross_training.sources.length === 0
            && skill.cross_training.points === 0 && Number(skill.cross_training.bonus) === 0),
            'Gnolls receive no cross-training, including when inspected from another hero');
        evidence.crossTraining = boosted;
        evidence.heroIds = initial.members.map(member => member.player_id);
        await page.evaluate(() => {
            window.trainingResults = [];
            const comm = require('comm'), original = comm.handle_message;
            comm.handle_message = function (message) {
                if (message.msg === 'skill_training_result') window.trainingResults.push(message);
                if (message.msg === 'game_ended') window.trainingGameEnded = true;
                return original.apply(this, arguments);
            };
        });
        await open(0);
        const boostedRow = page.locator(`tr[data-skill-id='${boosted.id}']`);
        assert.equal(await boostedRow.locator('.party-skill-cross-bonus').innerText(),
            'Cross-training: +' + Number(boosted.cross_training.bonus).toFixed(1));
        assert.equal(await boostedRow.locator('.party-skill-base-level').innerText(), 'Base ' + boosted.base_level);
        await page.getByRole('button', { name: 'Manual', exact: true }).click();
        await page.waitForFunction(() => window.crawl_party.state.members[0].auto_training === false);
        await setTarget(0, 'Fighting', '12.5');
        await page.getByRole('button', { name: 'Fighting training Focus', exact: true }).click();
        await waitSkill(0, 'Fighting', { train: 2 });
        const manualFocus = await skill(0, 'Fighting');
        assert(manualFocus.training > 0);
        await page.getByRole('button', { name: 'Automatic', exact: true }).click();
        await page.waitForFunction(() => window.crawl_party.state.members[0].auto_training === true);
        await page.getByRole('button', { name: 'Manual', exact: true }).click();
        await page.waitForFunction(() => window.crawl_party.state.members[0].auto_training === false);
        await waitSkill(0, 'Fighting', { train: 2, target: 125 });
        await setTarget(0, 'Short Blades', '7.3');
        await page.getByRole('combobox', { name: 'Short Blades target type' }).selectOption('base');
        await waitSkill(0, 'Short Blades', { target: 73, target_base: true });
        await setTarget(1, 'Conjurations', '8.5');
        await page.getByRole('button', { name: 'Conjurations training Focus', exact: true }).click();
        await waitSkill(1, 'Conjurations', { train: 2, target: 85 });
        await open(2);
        assert.equal(await page.locator('.party-skill-cross-training').count(), 0);
        assert.equal(await page.locator('.party-skill-training :is(button,input,select):enabled').count(), 0);
        assert((await page.locator('.party-training-help').innerText()).includes('equally'));
        const beforeInvalid = await state();
        const fightingId = (await skill(0, 'Fighting')).id;
        const badMessages = [{ target: 271 }, { target: -1 }, { target: 12.5 }, { target: '125' },
            { skill: -1 }, { skill: 999 }, { slot: 9 }, { slot: 2 }];
        for (const [index, fields] of badMessages.entries()) {
            const request_id = 'invalid-' + index;
            await page.evaluate(({ fields, request_id, fightingId }) => require('comm').send_message('skill_training', {
                request_id, action: 'target', slot: 0, skill: fightingId, target: 150, base: false, ...fields
            }), { fields, request_id, fightingId });
            await page.waitForFunction(id => window.trainingResults.some(result => result.request_id === id && !result.ok), request_id);
        }
        assert.deepEqual((await state()).members.map(member => member.skills), beforeInvalid.members.map(member => member.skills));
        const configured = await state();
        assert.equal(configured.active_slot, initial.active_slot, 'Editing companions must not switch active control');
        assert.equal(configured.world_aut_clock, initial.world_aut_clock, 'Training must not spend turns');
        assert.deepEqual(configured.members.map(member => member.aut_clock), initial.members.map(member => member.aut_clock));
        evidence.beforeSave = configured.members.map(member => ({ player_id: member.player_id,
            auto_training: member.auto_training, skills: member.skills }));
        await open(0);
        await boostedRow.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, 'native-training.png') });
        await page.keyboard.press('Escape');
        // Exercise persistence through the authenticated library protocol;
        // its dock presentation is independent of the training controls.
        await page.evaluate(() => require('comm').send_message('library_save', { exit: true }));
        const resume = page.locator('#game_library_panel [data-library-load]').first();
        await resume.waitFor({ state: 'visible' });
        await page.evaluate(() => { window.crawl_party.state = null; });
        await resume.click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3);
        await page.waitForFunction(() => {
            const names = Object.keys(require.s.contexts._.defined);
            const game = names.find(name => name.endsWith('/game'));
            const enums = names.find(name => name.endsWith('/enums'));
            return game && enums && require(game).get_input_mode() === require(enums).mouse_mode.COMMAND;
        });
        await waitSkill(0, 'Fighting', { target: 125, train: 2 });
        await waitSkill(0, 'Short Blades', { target: 73, target_base: true });
        await waitSkill(1, 'Conjurations', { target: 85, train: 2 });
        assert.deepEqual((await state()).members.map(member => member.player_id), evidence.heroIds);
        assert.deepEqual((await state()).members.map(member => member.skills),
            configured.members.map(member => member.skills), 'Native cross-training survives save and reload');
        evidence.saveReload = true;
        console.log('Native training settings survived save and resume.');
        // Controlled native threshold crossing uses the same check as earned XP.
        await key('&'); await page.waitForTimeout(250);
        await text('wiz'); await page.waitForTimeout(250);
        await key('S'); await page.waitForTimeout(250);
        await text('Fighting'); await page.waitForTimeout(250);
        await text('12.5'); await page.waitForTimeout(250); await key('\u0012');
        await waitSkill(0, 'Fighting', { target: 0, train: 0 });
        evidence.nativeThresholdCrossing = await skill(0, 'Fighting');
        assert.equal(evidence.nativeThresholdCrossing.level, '12.5');
        evidence.turnFree = true; evidence.validationRejections = badMessages.length;
        assert.deepEqual(errors, []);
        await page.evaluate(() => {
            window.trainingGameEnded = false;
            require('comm').send_message('library_save', { exit: true });
        });
        await page.waitForFunction(() => window.trainingGameEnded === true);
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, account: evidence.account, saveReload: true,
            nativeThresholdCrossing: true, crossTraining: true, turnFree: true, companionIsolation: true, gnollRules: true,
            validationRejections: badMessages.length }));
    } catch (error) {
        console.error(await page.evaluate(() => {
            const game = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/game'));
            return { mode: game && require(game).get_input_mode(), results: window.trainingResults?.slice(-3) };
        }));
        await page.screenshot({ path: path.join(out, 'failure.png') });
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText());
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
