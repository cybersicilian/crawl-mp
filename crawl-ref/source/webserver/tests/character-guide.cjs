const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Local QA account only. Guide interactions never issue a game or room command. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8888';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const out = process.env.GUIDE_PROOF_DIR || '/tmp/dcss-character-guide-proof';
fs.mkdirSync(out, { recursive: true });
const evidence = {}, sent = [], errors = [];

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => socket.on('framesent', frame => {
        try { sent.push(JSON.parse(String(frame.payload))); } catch { /* Only outgoing JSON commands matter. */ }
    }));
    function noPackets(from) {
        assert.deepEqual(sent.slice(from).filter(message => !['pong', 'latency_probe'].includes(message.msg)), [],
            'Reading character guidance must issue no server or engine command');
    }
    async function fits() {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const bounds = await page.locator('#character_guide_dialog').boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= await page.evaluate(() => innerWidth));
        assert(bounds.y >= 0 && bounds.y + bounds.height <= await page.evaluate(() => innerHeight));
    }
    async function close() {
        await page.keyboard.press('Escape');
        await page.locator('#character_guide_dialog').waitFor({ state: 'hidden' });
    }
    try {
        await page.goto(url);
        const account = 'GuideQA' + Date.now().toString().slice(-8);
        evidence.account = account;
        await signInTestAccount(page, account, 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.character-choice-note').count(), 8);
        assert.equal(await page.locator('.character-choice-details:disabled').count(), 0);
        assert.deepEqual(await page.evaluate(() => {
            const catalog = require('character-catalog');
            return Array.from(document.querySelectorAll('.party-slot-species, .party-slot-job')).flatMap(select =>
                Array.from(select.options).filter(option => !(select.matches('.party-slot-species')
                    ? catalog.species : catalog.jobs)[option.value]).map(option => option.value));
        }), [], 'Every existing native staging choice must have a guide');
        const first = page.locator('.party-slot-box[data-slot="0"]');
        const raceGuide = first.locator('.party-field-row:has(.party-slot-species) .character-choice-details');
        assert.equal(await first.locator('.party-slot-species').inputValue(), 'Minotaur');
        assert.equal(await first.locator('.party-slot-job').inputValue(), 'Fighter');
        const from = sent.length;
        await raceGuide.click();
        await page.locator('#character_guide_dialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#character_guide_title').innerText(), 'Minotaur');
        assert((await page.locator('.character-guide-body').innerText()).includes('horns'));
        assert((await page.locator('.character-guide-body').innerText()).includes('Species base attributes'));
        await fits();
        await page.screenshot({ path: path.join(out, 'race-guide-1280.png') });
        await page.locator('#character_guide_tab_jobs').click();
        assert.equal(await page.locator('#character_guide_title').innerText(), 'Fighter');
        assert((await page.locator('.character-guide-body').innerText()).includes('Background equipment'));
        assert((await page.locator('.character-guide-body').innerText()).includes('Attribute bonuses'));
        await page.locator('#character_guide_tab_jobs').press('ArrowLeft');
        assert.equal(await page.locator('#character_guide_tab_species').getAttribute('aria-selected'), 'true');
        await close();
        assert(await raceGuide.evaluate(element => document.activeElement === element));
        noPackets(from);
        evidence.readOnlyDesktop = true;

        // Presets update both descriptions synchronously, before any server round trip.
        await first.locator('.party-archetype-btn[data-species="Deep Elf"][data-job="Conjurer"]').click();
        await page.waitForFunction(() => document.getElementById('character_choice_0_jobs').textContent.includes('Magic Dart'));
        const update = sent.findLast(message => message.msg === 'party_room_update_slot');
        assert(update && update.room_id);
        await page.evaluate(roomId => require('comm').send_message('party_room_update_slot', {
            room_id: roomId, slot: 0, species: 'Octopode', job: 'Fighter'
        }), update.room_id);
        await page.waitForFunction(() => document.getElementById('character_choice_0_species').textContent.includes('eight rings'));
        evidence.presetAndAuthoritativeRefresh = true;
        const launch = await page.locator('#btn_launch_party_room').boundingBox();
        assert(launch.y + launch.height <= 800, 'Native launch remains available above the explanatory cards');
        await page.mouse.move(5, 5);
        await page.screenshot({ path: path.join(out, 'character-selection-1280.png') });

        await first.locator('.party-slot-species').selectOption('Djinni');
        await first.locator('.party-slot-job').selectOption('Conjurer');
        await page.waitForFunction(() => document.getElementById('character_choice_0_jobs').textContent.includes('Magic Dart'));
        await page.setViewportSize({ width: 390, height: 844 });
        await first.locator('.party-field-row:has(.party-slot-job) .character-choice-details').scrollIntoViewIfNeeded();
        const mobileFrom = sent.length;
        await first.locator('.party-field-row:has(.party-slot-job) .character-choice-details').click();
        await page.locator('#character_guide_dialog').waitFor({ state: 'visible' });
        assert((await page.locator('.character-guide-body').innerText()).includes('Starting spell access'));
        assert((await page.locator('.character-guide-body').innerText()).includes('Native species rules determine which are memorized'));
        await fits();
        await page.screenshot({ path: path.join(out, 'class-guide-390.png') });
        await page.locator('#character_guide_tab_species').click();
        assert.equal(await page.locator('#character_guide_title').innerText(), 'Djinni');
        assert((await page.locator('.character-guide-body').innerText()).length > 100);
        await close();
        noPackets(mobileFrom);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        evidence.readOnlyMobileAndAlias = true;
        await page.locator('#btn_leave_party_room').click();
        await page.locator('#lobby_home').waitFor({ state: 'visible' });
        assert.deepEqual(errors, []);
        evidence.errors = errors;
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, account, out }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ evidence, errors }, null, 2));
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
