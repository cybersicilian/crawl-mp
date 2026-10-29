const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Real local roster, followed by explicit presentation-only companion states. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8888';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const baseline = process.env.COMPANION_BASELINE === '1';
const output = process.env.COMPANION_PROOF_DIR || '/tmp/dcss-companion-layout-proof';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
        deviceScaleFactor: Number(process.env.HUD_DPR || 1), hasTouch: process.env.HUD_TOUCH === '1' });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const companions = () => page.locator('.party-card:not(.is-controlled-card)');
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const verifyReadings = async native => {
        for (const hero of native.members) {
            const card = page.locator(`.party-card[data-party-slot='${hero.slot}']`);
            const reading = key => card.locator(`[data-reading='${key}']`);
            for (const [key, value] of [['level', hero.xl], ['floor', hero.place],
                ['stealth', hero.resists.Stlth], ['speed', (hero.move_delay_aut / 10).toFixed(1)]]) {
                assert(await reading(key).isVisible(), key + ' stays visible at every density');
                assert.equal(await reading(key).locator('.tt-icon').count(), 1);
                assert.equal(await reading(key).locator('.party-reading-value').textContent(), String(value));
                assert(await reading(key).getAttribute('aria-label'));
            }
            assert.equal(await reading('noise').getAttribute('aria-valuenow'), String(hero.adjusted_noise));
            assert(await reading('noise').isVisible());
            if (hero.slot !== native.controlled_slot)
                for (const key of ['ac', 'ev', 'sh']) {
                    assert(await reading(key).isVisible());
                    assert.equal(await reading(key).locator('.party-reading-value').textContent(), String(hero[key]));
                    assert.equal(await reading(key).locator('.tt-icon').count(), 1);
                }
            assert.equal(await card.locator('.party-member-level').textContent(), hero.xl_next + '%');
            assert.equal(await card.locator('.party-member-level .tt-icon').count(), 1);
            assert(await card.locator('.party-member-state').isVisible());
            for (const slot of hero.equipment_profile.slots.filter(slot =>
                ['weapon', 'weapon_offhand', 'offhand'].includes(slot.type) && slot.state === 'equipped')) {
                const wielded = card.locator(`#party_wielded_${hero.slot}_${slot.type}`);
                assert(await wielded.isVisible());
                assert.equal(await wielded.locator('[data-art="ready"] canvas').count(), 1);
                assert.equal(await wielded.locator('canvas').getAttribute('width'), '32');
                assert.match(await wielded.getAttribute('aria-label'), /Inspect equipment/);
            }
        }
    };
    const shot = async name => {
        await page.mouse.move(2, 2);
        await companions().first().screenshot({ path: path.join(output, name + '.png') });
    };
    const geometry = () => companions().evaluateAll(cards => cards.map(card => {
        const rect = node => {
            const r = node.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        };
        const find = selector => rect(card.querySelector(selector));
        return { card: rect(card), name: find('.party-member-name'), portrait: find('.party-portrait'),
            meta: find('.party-member-meta'), bars: find('.party-bars'), toolbar: find('.party-card-toolbar'),
            xp: find('.party-member-state'),
            controls: [...card.querySelectorAll('.party-card-actions button')].filter(node => node.offsetWidth).map(rect),
            overflow: card.scrollWidth > card.clientWidth };
    }));
    try {
        await page.goto(url);
        await signInTestAccount(page, 'RosterQA' + Date.now().toString().slice(-8), 'crawl');
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let slot = 1; slot < 4; slot++)
            await page.locator(`.party-slot-box[data-slot='${slot}'] .party-mode-btn[data-mode='companion']`).click();
        await page.locator(".party-slot-box[data-slot='0'] .party-slot-name").fill('Moss');
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4, null, { timeout: 120000 });
        await ready();
        evidence.native = await state();
        assert.equal(evidence.native.members.filter(hero => hero.active).length, 1,
            'Snapshot inspection preserves the actual active hero');
        assert(evidence.native.members.every(hero => Number.isFinite(hero.adjusted_noise)
            && Number.isFinite(hero.move_delay_aut)), 'Fresh native snapshots include per-hero noise and effective movement delay');
        const spriggan = evidence.native.members.find(hero => hero.species === 'Spriggan');
        assert.equal(spriggan.move_delay_aut, Math.round(spriggan.move_aut * spriggan.speed_stat / 10),
            'Movement includes the hero\'s native terrain and speed modifiers');
        assert(evidence.native.members.find(hero => hero.species === 'Deep Elf').resists.Stlth > 0,
            'A companion keeps its own stealth instead of copying the armoured leader');
        const setCompact = async compact => page.evaluate(compact => {
            if (document.body.classList.contains('workflow-compact-roster') !== compact)
                document.getElementById('workflow_compact_btn').click();
        }, compact);
        await setCompact(false);
        for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
            await page.setViewportSize({ width, height });
            const layout = await geometry(); evidence[width + 'x' + height] = layout;
            if (!baseline) await verifyReadings(evidence.native);
            if (!baseline) for (const row of layout) {
                assert.equal(row.overflow, false);
                assert(row.name.x >= row.portrait.right, 'Companion name uses the content column');
                assert(row.name.bottom <= row.meta.y + 1, 'Identity has a compact first row');
                assert(row.bars.y < row.portrait.bottom, 'Health sits beside the portrait');
                assert(row.toolbar.width > row.bars.width, 'Actions and XP use the full card width');
                assert(row.xp.width >= 85, 'Experience has room for its icon and percentage');
                assert(row.controls.every(control => control.x >= row.card.x && control.right <= row.card.right));
            }
            await shot('companion-' + width);
            await setCompact(true);
            const compact = await geometry(); evidence['compact-' + width] = compact;
            if (!baseline) await verifyReadings(evidence.native);
            if (!baseline) for (const row of compact) {
                assert.equal(row.overflow, false);
                assert(row.name.x >= row.portrait.right);
                assert(row.xp.width >= 85);
            }
            await shot('compact-companion-' + width);
            await setCompact(false);
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('#party_progress').screenshot({ path: path.join(output, 'progress.png') });
        await page.screenshot({ path: path.join(output, 'native-roster.png') });
        if (baseline) {
            fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
            console.log(JSON.stringify({ baseline: true, output })); return;
        }
        const clock = evidence.native.world_aut_clock;
        await page.locator('.is-controlled-card .party-wielded-item').first().press('Enter');
        await page.locator('#party_inspector_modal').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#party_insp_tab_equipment').getAttribute('aria-selected'), 'true');
        await page.locator('#party_inspector_close_btn').click();
        await companions().first().locator('.party-member-name').click();
        await page.locator('#party_inspector_modal').waitFor({ state: 'visible' });
        await page.locator('#party_inspector_close_btn').click();
        await companions().first().locator('.party-camera-btn').click();
        assert.equal((await state()).world_aut_clock, clock);
        await companions().first().locator('.party-control-btn').click();
        await page.waitForFunction(() => window.crawl_party.state.controlled_slot === 1);
        await ready();
        assert.equal(await page.locator('.is-controlled-card .personal-stat-reading').count(), 6);
        assert.equal(await page.locator('.party-card[data-party-slot="0"] .party-member-top .party-member-name').textContent(), 'Moss');
        const switched = await state();
        for (const hero of switched.members) {
            const original = evidence.native.members.find(member => member.slot === hero.slot);
            assert.equal(hero.resists.Stlth, original.resists.Stlth, 'Stealth follows the hero across control switches');
            assert.equal(hero.move_delay_aut, original.move_delay_aut);
        }
        await page.evaluate(() => {
            const name = Object.keys(require.s.contexts._.defined).find(key => key.endsWith('/party'));
            window.renderCompanionFixture = data => require(name).state(data);
            window.companionPackets = []; window.originalCompanionSend = require('comm').send_message;
            require('comm').send_message = (msg, fields) => window.companionPackets.push({ msg, ...fields });
        });
        const fixture = await state();
        const render = data => page.evaluate(data => window.renderCompanionFixture(data), data);
        fixture.members[0].name = 'Aster the Long Named Shield Bearer';
        fixture.members[0].weapon = '+10 dagger of the Summoning Ancients';
        fixture.members[0].statuses = ['Berserk', 'Poisoned', 'Confused', 'Hasted', 'Silenced', 'Slowed'].map((text, id) => ({
            id, text, light: text, is_bad: !['Berserk', 'Hasted'].includes(text)
        }));
        fixture.members[2].alive = false; fixture.members[2].ghost_haunting = true;
        fixture.members[3].on_same_level = false; fixture.members[3].place = 'D:2';
        await render(fixture);
        await page.setViewportSize({ width: 1024, height: 768 });
        assert((await geometry()).every(row => !row.overflow));
        assert.equal(await page.locator('.party-card[data-party-slot="0"] .party-effect').count(), 6);
        assert.equal(await page.locator('.party-card[data-party-slot="2"] .party-control-btn').count(), 0);
        assert(await page.locator('.party-card[data-party-slot="3"] .party-navigate-btn').isDisabled());
        await shot('controlled-long-name-effects');
        const name = page.locator('.party-card[data-party-slot="0"] .party-member-name');
        await name.focus();
        const focusedId = await name.getAttribute('id');
        fixture.members[0].hp -= 1;
        await render(fixture);
        assert.equal(await page.evaluate(() => document.activeElement.id), focusedId, 'Health updates retain companion control focus');
        await name.press('ArrowRight');
        // Noise changes on a clock-only packet without replacing the focused reading.
        const quiet = page.locator('.party-card[data-party-slot="1"] [data-reading="noise"]');
        await quiet.focus();
        await page.evaluate(() => { window.originalNoiseReading = document.activeElement; });
        fixture.members[1].adjusted_noise = 800;
        await render(fixture);
        assert(await page.evaluate(() => document.activeElement === window.originalNoiseReading));
        assert.equal(await quiet.getAttribute('aria-valuenow'), '800');
        await quiet.press('ArrowRight'); await quiet.press('Enter');
        assert.equal(await page.locator('.party-card[data-party-slot="0"] [data-reading="noise"]').getAttribute('aria-valuenow'), '0',
            'Silence suppresses the noise gauge');
        delete fixture.members[1].adjusted_noise; delete fixture.members[1].resists.Stlth;
        delete fixture.members[1].move_delay_aut; delete fixture.members[1].move_aut;
        await render(fixture);
        for (const key of ['noise', 'stealth', 'speed'])
            assert.equal(await page.locator(`.party-card[data-party-slot="1"] [data-reading="${key}"] .party-reading-value`).textContent(), '?');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'party_reading_1_noise',
            'A full card refresh restores focus to its icon reading');
        assert.equal(await quiet.getAttribute('aria-valuenow'), null, 'Missing data is never a false zero');
        assert.deepEqual(await page.evaluate(() => window.companionPackets), []);
        assert.deepEqual(errors, []);
        evidence.nativeControls = true; evidence.presentations = ['long-name', 'many-effects', 'downed', 'off-floor'];
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ passed: true, nativeHeroSwitch: true, iconReadings: true,
            nativeEquipmentArt: true, perHeroStealthAndSpeed: true, focusRetained: true, viewports: 3, output }));
    } catch (error) {
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify(evidence, null, 2));
        await page.screenshot({ path: path.join(output, 'failure.png') }); throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
