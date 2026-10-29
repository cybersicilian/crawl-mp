const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Disposable local games prove native pressure; controlled snapshots cover display states. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8888';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.DOOM_PROOF_DIR || '/tmp/dcss-doom-proof';
const zotSource = fs.readFileSync(path.join(__dirname, '../../zot.h'), 'utf8');
const floorAut = Number(zotSource.match(/ZOT_CLOCK_PER_FLOOR = (\d+) \* BASELINE_DELAY/)[1]) * 10;
fs.mkdirSync(output, { recursive: true });
const errors = [], evidence = { native: [] };
const counts = process.env.DOOM_COUNTS ? process.env.DOOM_COUNTS.split(',').map(Number) : [0, 1, 2];
assert(counts.length && counts.every(count => Number.isInteger(count) && count >= 0 && count <= 2));
let browser, page;
const state = () => page.evaluate(() => structuredClone(window.crawl_party.state));
async function ready() {
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    for (const count of counts) {
        page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        page.setDefaultTimeout(20000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await signInTestAccount(page, 'DoomQA' + count + Date.now().toString(36), 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (const slot of [1, 2])
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
        await page.locator(".party-slot-box[data-slot='3'] .party-mode-btn[data-mode='closed']").click();
        // Use native select change handlers to submit the actual party builds.
        for (let slot = 0; slot < 3; ++slot)
            await page.locator(`#party_slot_species_${slot}`).selectOption(slot < count ? 'Meteoran' : 'Human', { force: true });
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3, null, { timeout: 120000 });
        await ready();
        const native = await state();
        assert(native.members.every(hero => hero.zot_clock), 'Every native hero exports a clock');
        assert.equal(native.members[0].zot_clock.short_lifespans, count);
        assert.equal(native.members[0].zot_clock.lifespan_divisor, 1 + 9 * count);
        assert.equal(native.members[0].zot_clock.remaining_aut, Math.floor(floorAut / (1 + 9 * count)));
        assert.equal(await page.locator('#party_doom_meter').getAttribute('data-doom-state'), 'running');
        assert.equal(await page.locator('.party-doom-pressure').textContent(), '×' + (1 + 9 * count));
        evidence.native.push({ count, clocks: native.members.map(hero => hero.zot_clock) });
        await page.locator('#party_doom_meter').focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowDown');
        await page.locator('#party_doom_meter').click();
        assert.deepEqual((await state()).members.map(hero => hero.turns), native.members.map(hero => hero.turns),
            'Inspecting the meter spends no native turns');
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('.');
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, native.members[0].turns);
        const after = await state();
        assert(after.members[0].zot_clock.remaining_aut < native.members[0].zot_clock.remaining_aut,
            'A native action advances the authoritative Zot deadline');
        assert(after.members[0].zot_clock.remaining_aut <= native.members[0].zot_clock.remaining_aut - 10);
        if (count !== counts.at(-1)) await page.close();
    }
    await ready();
    evidence.live = await state();
    for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
        await page.setViewportSize({ width, height });
        const geometry = await page.evaluate(() => {
            const meter = document.getElementById('party_doom_meter').getBoundingClientRect();
            const cards = [...document.querySelectorAll('.party-member-card')];
            return { leftOfCards: cards.every(card => meter.right <= card.getBoundingClientRect().left),
                // DOM width metrics round fractional CSS pixels differently.
                overflow: cards.some(card => card.scrollWidth > card.clientWidth + 1),
                clippedControls: cards.some(card => [...card.querySelectorAll('button')].some(button => {
                    const r = button.getBoundingClientRect(), bounds = card.getBoundingClientRect();
                    return r.width && r.height && (r.left < bounds.left - 1 || r.right > bounds.right + 1);
                })),
                pageOverflow: document.documentElement.scrollWidth > innerWidth,
                overflowDetails: cards.filter(card => card.scrollWidth > card.clientWidth).map(card => ({
                    width: card.clientWidth, scroll: card.scrollWidth, nodes: [...card.querySelectorAll('*')]
                        .filter(node => node.getBoundingClientRect().right > card.getBoundingClientRect().right)
                        .map(node => ({ class: node.className, right: node.getBoundingClientRect().right,
                            parentRight: card.getBoundingClientRect().right })) })) };
        });
        assert.equal(geometry.leftOfCards, true);
        assert.equal(geometry.overflow, false, JSON.stringify(geometry));
        assert.equal(geometry.clippedControls, false);
        assert.equal(geometry.pageOverflow, false);
        await page.screenshot({ path: path.join(output, 'native-' + width + '.png') });
        if (width === 1440) await page.locator('#party_hud').screenshot({ path: path.join(output, 'party-doom-meter.png') });
    }
    await page.evaluate(() => {
        const key = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/party'));
        window.renderDoomFixture = data => require(key).state(data);
        window.doomPackets = [];
        require('comm').send_message = (msg, fields) => window.doomPackets.push({ msg, ...fields });
    });
    const render = data => page.evaluate(data => window.renderDoomFixture(data), data);
    const fixture = structuredClone(evidence.live);
    fixture.members.forEach(hero => { hero.zot_clock.remaining_aut = 35; hero.zot_clock.warning = 3; });
    await render(fixture);
    assert.equal(await page.locator('#party_doom_meter').getAttribute('data-doom-warning'), '3');
    assert((await page.locator('#party_doom_meter').getAttribute('aria-valuetext')).includes('3.5 standard turns'));
    await page.locator('#party_doom_meter').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('dcss_rich_tooltip').textContent.includes('3.5'));
    await page.screenshot({ path: path.join(output, 'imminent-tooltip.png') });
    const original = await page.locator('#party_doom_meter').elementHandle();
    fixture.members.forEach(hero => { hero.zot_clock.remaining_aut = 25; });
    await render(fixture);
    assert(await original.evaluate(node => node === document.getElementById('party_doom_meter')),
        'Clock deltas preserve the meter and its keyboard focus');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'party_doom_meter');
    fixture.members.forEach(hero => { hero.zot_clock.active = false; });
    await render(fixture);
    assert.equal(await page.locator('#party_doom_meter').getAttribute('data-doom-state'), 'paused');
    fixture.members.forEach(hero => { hero.zot_clock.immune = true; });
    await render(fixture);
    assert.equal(await page.locator('#party_doom_meter').getAttribute('data-doom-state'), 'stopped');
    delete fixture.members[0].zot_clock;
    await render(fixture);
    assert.equal(await page.locator('#party_doom_meter').getAttribute('data-doom-state'), 'unknown');
    assert.equal(await page.locator('#party_doom_meter').getAttribute('aria-valuenow'), null);
    assert.deepEqual(await page.evaluate(() => window.doomPackets), []);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ passed: true, nativeParties: counts.length, viewports: 3, output }));
})().catch(async error => {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') });
    console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
