const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Local-only acceptance for compact modes and the native-select enhancement. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://localhost:8888';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const output = process.env.SETUP_PROOF_DIR || '/tmp/dcss-party-setup-proof';
fs.mkdirSync(output, { recursive: true });
const errors = [], sent = [], evidence = {};
let browser, page;
async function fits() {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
}
async function choose(selector, query, value) {
    await page.locator(selector + '_picker').click();
    await page.locator('.choice-picker-search').fill(query);
    await page.locator('.choice-picker').getByRole('option', { name: new RegExp('^' + value + '(?:, recommended)?$') }).click();
    await page.waitForFunction(({ selector, value }) => document.querySelector(selector).value === value, { selector, value });
}
function quiet(start) {
    assert.deepEqual(sent.slice(start).filter(message => !['pong', 'latency_probe'].includes(message.msg)), []);
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /\.(css|js|png|svg)(\?|$)/.test(response.url())) errors.push(response.status() + ' ' + response.url());
    });
    page.on('websocket', socket => socket.on('framesent', frame => {
        try { sent.push(JSON.parse(String(frame.payload))); } catch { /* JSON only. */ }
    }));
    await page.goto(url);
    evidence.account = 'SetupQA' + Date.now().toString(36);
    await signInTestAccount(page, evidence.account, 'crawl');
    await page.locator('#lobby_home').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-workspace-target="modes"]').count(), 0);
    const modes = page.locator('#play_now');
    assert(await modes.isVisible());
    assert.equal(await modes.locator('.mode-card').count(), 8);
    evidence.routes = await modes.locator('.mode-card').evaluateAll(links => links.map(link => link.getAttribute('href')).sort());
    assert.deepEqual(evidence.routes, ['coop-2p-web-trunk', 'coop-3p-web-trunk', 'coop-4p-web-trunk',
        'dcss-web-trunk', 'seeded-web-trunk', 'descent-web-trunk', 'tut-web-trunk', 'sprint-web-trunk'].map(id => '#play-' + id).sort());
    assert.equal(await modes.locator('.edit_rc_link').count(), 1);
    const start = sent.length;
    await modes.scrollIntoViewIfNeeded();
    await fits(); quiet(start);
    evidence.modeHeight = await modes.evaluate(node => node.getBoundingClientRect().height);
    assert(evidence.modeHeight < 550, 'All eight choices fit in a compact desktop section');
    await page.mouse.move(1, 1);
    await page.screenshot({ path: path.join(output, 'modes-desktop.png') });
    await page.locator('.lobby-chapters [data-workspace-target="play"]').click();
    await page.locator('#lobby_home [data-lobby-create]').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    async function builds(slot) {
        return page.locator('.party-slot-box[data-slot="' + slot + '"] .party-archetype-btn:not([data-random])')
            .evaluateAll(buttons => buttons.map(button => ({ species: button.dataset.species, job: button.dataset.job })));
    }
    assert.equal((await builds(0)).length, 6, 'Untouched heroes show the initial quick builds');
    await choose('#party_slot_species_0', 'meteoran', 'Meteoran');
    assert((await builds(0)).every(build => build.species === 'Meteoran'));
    assert((await builds(0)).length > 1, 'The default background does not constrain species suggestions');
    await page.locator('.party-slot-box[data-slot="0"]').screenshot({ path: path.join(output, 'quick-builds-meteoran.png') });
    await choose('#party_slot_job_1', 'bers', 'Berserker');
    assert((await builds(1)).length > 1, 'The default species does not constrain background suggestions');
    assert((await builds(1)).every(build => build.job === 'Berserker'));
    const second = page.locator('.party-slot-box[data-slot="1"]');
    await second.locator('.party-archetype-btn[data-species="Minotaur"]').click();
    await page.waitForFunction(() => document.querySelector('#party_slot_species_1').value === 'Minotaur');
    await second.locator('.party-archetype-btn[data-species="Mountain Dwarf"]').click();
    await page.waitForFunction(() => document.querySelector('#party_slot_species_1').value === 'Mountain Dwarf');
    assert.equal(await page.locator('#party_slot_job_1').inputValue(), 'Berserker');
    assert((await builds(1)).length > 1, 'A quick build leaves the unchosen field available for alternatives');
    await choose('#party_slot_species_1', 'tortle', 'Tortle');
    assert.deepEqual(await builds(1), [{ species: 'Tortle', job: 'Berserker' }]);
    assert((await builds(0)).every(build => build.species === 'Meteoran'), 'Selection intent is per hero');
    async function recommendations(selector, expected) {
        const options = await page.locator(selector).evaluate(select => Array.from(select.options)
            .filter(option => !option.disabled).map(option => ({
                value: option.value, text: option.text, recommended: option.dataset.recommended === 'true'
            })));
        const marked = options.filter(option => option.recommended);
        assert.deepEqual(marked.map(option => option.value).sort(), expected.slice().sort());
        assert.deepEqual(options.slice(0, marked.length), marked, 'Recommended options come first');
        assert(options.every(option => option.text === (option.recommended ? '★ ' : '') + option.value));
    }
    await recommendations('#party_slot_job_0', await page.evaluate(() => require('character-catalog').species.Meteoran.recommended));
    await page.waitForFunction(() => Array.from(document.querySelector('#party_slot_weapon_0').options)
        .some(option => option.value === 'war axe' && option.dataset.recommended === 'true'));
    assert((await page.locator('#party_slot_weapon_0 option').first().innerText()).startsWith('★ '));
    const race = '#party_slot_species_0', trigger = page.locator(race + '_picker');
    await trigger.click();
    assert(await page.locator('.choice-picker-search').evaluate(node => node === document.activeElement));
    let rect = await page.locator('.choice-picker').boundingBox();
    assert(rect.height <= 366 && rect.y >= 0 && rect.y + rect.height <= 800, 'Picker fits desktop');
    await page.locator('.choice-picker-search').fill('tro');
    assert.equal(await page.locator('.choice-picker').getByRole('option').count(), 1);
    await page.locator('.choice-picker-search').press('Enter');
    await page.waitForFunction(() => document.querySelector('#party_slot_species_0').value === 'Troll');
    assert((await trigger.getAttribute('aria-label')).includes('Troll'));
    assert(await trigger.evaluate(node => node === document.activeElement));
    const first = page.locator('.party-slot-box[data-slot="0"]');
    assert((await builds(0)).every(build => build.species === 'Troll'));
    await first.locator('.party-archetype-btn[data-job="Gladiator"]').click();
    await page.waitForFunction(() => document.querySelector('#party_slot_job_0').value === 'Gladiator');
    assert((await builds(0)).length > 1, 'Species-only suggestions remain after applying a quick build');
    await choose('#party_slot_job_0', 'bers', 'Berserker');
    assert.deepEqual(await builds(0), [{ species: 'Troll', job: 'Berserker' }]);
    await recommendations(race, await page.evaluate(() => require('character-catalog').jobs.Berserker.recommended));
    assert.equal(await page.locator(race).inputValue(), 'Troll', 'Ranking preserves the chosen species');
    await choose('#party_slot_job_0', 'conj', 'Conjurer');
    assert.deepEqual(await builds(0), [{ species: 'Troll', job: 'Conjurer' }]);
    await recommendations(race, await page.evaluate(() => require('character-catalog').jobs.Conjurer.recommended));
    assert.equal(await page.locator(race).inputValue(), 'Troll', 'Nonrecommended species remain selected');
    await trigger.click();
    const firstRecommended = page.locator('.choice-picker').getByRole('option').first();
    assert((await firstRecommended.innerText()).startsWith('★ '));
    assert((await firstRecommended.getAttribute('aria-label')).endsWith(', recommended'));
    assert(await page.evaluate(() => {
        const list = document.querySelector('.choice-picker-results');
        return list.firstElementChild.getBoundingClientRect().top >= list.getBoundingClientRect().top;
    }));
    assert((await page.locator('.choice-picker-count').innerText()).includes('★ Recommended'));
    await page.screenshot({ path: path.join(output, 'recommendations-desktop.png') });
    await page.keyboard.press('Escape');
    await choose('#party_slot_job_0', 'bers', 'Berserker');
    const edited = sent.filter(message => message.msg === 'party_room_update_slot');
    assert(edited.some(message => message.species === 'Troll'));
    assert(edited.some(message => message.job === 'Berserker'));
    assert(!sent.some(message => message.msg === 'key' || message.msg === 'play'));
    const readOnly = sent.length;
    await trigger.press('ArrowDown');
    await page.locator('.choice-picker-search').fill('no-such-species');
    assert.equal(await page.locator('.choice-picker').getByRole('option').count(), 0);
    assert((await page.locator('.choice-picker-count').innerText()).includes('No matches'));
    await page.locator('.choice-picker-search').press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert(await trigger.evaluate(node => node === document.activeElement));
    assert.equal(await page.locator(race).inputValue(), 'Troll');
    await trigger.click();
    await page.locator('.choice-picker-search').fill('elf');
    await page.locator('.choice-picker-search').press('ArrowDown');
    assert(await page.locator('.choice-picker-search').getAttribute('aria-activedescendant'));
    await page.locator('.choice-picker-search').press('Escape');
    quiet(readOnly);
    await choose(race, 'fel', 'Felid');
    await page.locator('#party_slot_job_0_picker').click();
    await recommendations('#party_slot_job_0', await page.evaluate(() => require('character-catalog').species.Felid.recommended));
    const available = await page.locator('.choice-picker').getByRole('option').allTextContents();
    const legal = await page.locator('#party_slot_job_0').evaluate(node => Array.from(node.options).filter(option => !option.disabled).map(option => option.text));
    assert.deepEqual(available, legal, 'Only legal backgrounds are offered');
    await page.locator('.choice-picker-search').press('Escape');
    await first.locator('.party-archetype-btn[data-species="Felid"]').click();
    await page.waitForFunction(() => document.querySelector('#party_slot_species_0_picker').textContent.includes('Felid'));
    await page.locator('.party-slot-box[data-slot="0"] .character-choice-details').first().click();
    await page.locator('#character_guide_dialog').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    const roster = await page.locator('.party-slot-species').evaluateAll(nodes => nodes.map(node => node.value));
    const navigate = sent.length;
    await page.locator('.party-other-modes').click();
    assert(await modes.isVisible());
    await page.locator('#lobby_primary_action').click();
    assert.deepEqual(await page.locator('.party-slot-species').evaluateAll(nodes => nodes.map(node => node.value)), roster);
    assert.deepEqual(await builds(0), [{ species: 'Felid', job: 'Berserker' }], 'Navigation and server updates retain both choices');
    quiet(navigate);
    const randomStart = sent.length;
    const randomButton = first.getByRole('button', { name: 'Random Random' });
    await randomButton.click();
    for (let attempt = 0; attempt < 50 && !sent.slice(randomStart).some(message => message.msg === 'party_room_update_slot'); attempt++)
        await new Promise(resolve => setTimeout(resolve, 100));
    const randomMessage = sent.slice(randomStart).find(message => message.msg === 'party_room_update_slot');
    assert(randomMessage, 'Random Random sends the chosen pair to the room');
    assert(await page.evaluate(({ species, job }) => require('client-staging-data').allowedJobs(species).includes(job), randomMessage));
    assert.equal(await page.locator('#party_slot_species_0').inputValue(), randomMessage.species);
    assert.equal(await page.locator('#party_slot_job_0').inputValue(), randomMessage.job);
    assert(await randomButton.isVisible(), 'Random Random remains available for rerolls');
    for (const [width, height] of [[1280,800], [1920,1080], [390,844]]) {
        await page.setViewportSize({ width, height });
        await page.locator('#party_room_view').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, 0));
        await fits();
        await page.mouse.move(1, 1);
        await page.screenshot({ path: path.join(output, 'party-' + width + '.png') });
        await trigger.click();
        await page.locator('.choice-picker-search').fill('dwarf');
        rect = await page.locator('.choice-picker').boundingBox();
        assert(rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0 && rect.y + rect.height <= height, 'Picker stays within ' + width + ' viewport');
        await page.screenshot({ path: path.join(output, 'picker-' + width + '.png') });
        await page.locator('.choice-picker-search').press('Escape');
    }
    await page.locator('#btn_leave_party_room').click();
    await page.locator('#party_room_view').waitFor({ state: 'hidden' });
    await page.locator('#lobby_home [data-lobby-create]').click();
    await page.locator('#party_room_view').waitFor({ state: 'visible' });
    assert.equal((await builds(0)).length, 6, 'A new room resets selection intent');
    assert((await builds(0)).some(build => build.species !== 'Felid'));
    await page.locator('#btn_leave_party_room').click();
    assert.deepEqual(errors, []);
    evidence.success = true; evidence.errors = errors;
    console.log(JSON.stringify(evidence));
})().catch(async error => {
    evidence.error = String(error.stack || error); evidence.errors = errors;
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
}).finally(async () => {
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
});
