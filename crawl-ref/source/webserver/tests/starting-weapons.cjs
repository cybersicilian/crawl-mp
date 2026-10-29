const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real local staging and native equipment proof; all state belongs to disposable QA accounts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8889';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const out = process.env.WEAPONS_PROOF_DIR || '/tmp/dcss-starting-weapons-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = {}, sent = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => socket.on('framesent', frame => {
        try { sent.push(JSON.parse(String(frame.payload))); } catch {}
    }));
    const card = slot => page.locator(`.party-slot-box[data-slot="${slot}"]`);
    const weapon = slot => card(slot).locator('.party-slot-weapon');
    async function selected(slot, value) {
        await page.waitForFunction(({ slot, value }) =>
            document.querySelector(`.party-slot-box[data-slot="${slot}"] .party-slot-weapon`).value === value,
        { slot, value });
    }
    async function choose(slot, species, job, value) {
        await card(slot).locator('.party-slot-species').selectOption(species);
        await card(slot).locator('.party-slot-job').selectOption(job);
        await page.waitForFunction(({ slot, value }) =>
            Array.from(document.querySelector(`.party-slot-box[data-slot="${slot}"] .party-slot-weapon`).options)
                .some(option => option.value === value), { slot, value });
        if (await weapon(slot).isEnabled()) await weapon(slot).selectOption(value);
        await selected(slot, value);
    }
    try {
        await page.goto(url);
        evidence.account = 'WeaponQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        await selected(0, 'war axe');
        assert.equal(await weapon(0).getAttribute('aria-describedby'), 'party_slot_weapon_0_note');
        assert.equal(await page.locator('label[for="party_slot_weapon_0"]').innerText(), 'Starting weapon:');
        await weapon(0).selectOption('long sword');
        const mark = sent.length;
        await card(0).locator('.party-slot-job').selectOption('Berserker');
        await selected(0, 'hand axe');
        assert(!sent.slice(mark).some(message => message.msg === 'key'));
        await card(0).locator('.party-slot-job').selectOption('Hunter');
        await card(0).locator('.party-weapon-row').waitFor({ state: 'hidden' });
        assert(await weapon(0).isDisabled());
        await card(0).locator('.party-slot-job').selectOption('Fighter');
        await selected(0, 'war axe');
        await weapon(0).selectOption('trident');

        for (let slot = 1; slot < 4; slot++) {
            await card(slot).locator('.party-mode-btn[data-mode="companion"]').click();
            await card(slot).locator('.party-mode-btn[data-mode="companion"].active').waitFor();
        }
        await choose(1, 'Human', 'Gladiator', 'quarterstaff');
        await choose(2, 'Felid', 'Monk', 'unarmed');
        assert(await weapon(2).isDisabled());
        await choose(3, 'Spriggan', 'Fighter', 'spear');
        assert(!(await weapon(3).locator('option').allTextContents()).includes('Trident'));
        const launch = await page.locator('#btn_launch_party_room').boundingBox();
        assert(launch.y + launch.height <= 800, 'Launch remains directly available');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.mouse.move(5, 5);
        await page.screenshot({ path: path.join(out, 'starting-weapons-1280.png'), fullPage: true });

        // A second lobby client gets the authoritative weapon choice for every slot.
        const observer = await browser.newPage();
        await observer.goto(url);
        await signInTestAccount(observer, evidence.account, 'crawl');
        await observer.waitForFunction(() =>
            document.querySelector('.party-slot-box[data-slot="1"] .party-slot-weapon')?.value === 'quarterstaff');
        assert.equal(await observer.locator('.party-slot-box[data-slot="0"] .party-slot-weapon').inputValue(), 'trident');
        await observer.close();
        evidence.sharedRoom = true;

        await page.setViewportSize({ width: 390, height: 844 });
        await weapon(0).scrollIntoViewIfNeeded();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(out, 'starting-weapons-390.png') });
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4);
        evidence.members = await page.evaluate(() => window.crawl_party.state.members.map(member => ({
            slot: member.slot, species: member.species, job: member.job, weapon: member.weapon
        })));
        for (const [slot, expected] of ['trident', 'quarterstaff', 'claws', 'spear'].entries()) {
            assert(evidence.members[slot].weapon.toLowerCase().includes(expected),
                `P${slot + 1} must receive ${expected}: ${JSON.stringify(evidence.members[slot])}`);
        }
        const launchMessage = sent.findLast(message => message.msg === 'party_room_launch');
        assert.deepEqual(launchMessage.slots.map(slot => slot.weapon),
            ['trident', 'quarterstaff', 'unarmed', 'spear']);
        await page.screenshot({ path: path.join(out, 'native-equipment.png') });
        evidence.nativeEquipment = true;
        if (process.env.WEAPONS_RUNTIME) {
            const saves = path.join(process.env.WEAPONS_RUNTIME, 'rcs/library/saves');
            const compositions = fs.readdirSync(saves).flatMap(id => {
                const file = path.join(saves, id, 'coop_chronicle.jsonl');
                return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse) : [];
            });
            const composition = compositions.find(entry => entry.type === 'party_comp'
                && entry.members[0].name === evidence.account);
            assert(composition, 'The native game records its starting composition');
            evidence.nativeComposition = composition.members.map(member => member.weapon);
            assert.deepEqual(evidence.nativeComposition, ['trident', 'quarterstaff', 'unarmed', 'spear']);
        }

        // Save through the normal dock so the QA run leaves no live native process.
        await page.waitForFunction(() => {
            const name = Object.keys(require.s.contexts._.defined).find(module => module.endsWith('/workflow-actions'));
            return name && require(name).ready();
        });
        await page.locator('#workflow_expedition_details > summary').click();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#dock_save_exit_btn').click();
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#btn_leave_party_room').click();
        evidence.errors = errors;
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, out, members: evidence.members }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ evidence, errors }, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
