/* Actual 42 x 50 portrait art with status interiors, safe controls, and reduced motion. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.PORTRAIT_PROOF_DIR || '/tmp/dcss-portrait-status-proof';
(async function () {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 800, height: 530 }, deviceScaleFactor: 2 });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        const sprite = fs.readFileSync(path.resolve(root, '../rltiles/player/base/human_m.png')).toString('base64');
        await page.setContent('<!doctype html><html><body><main id="normal"><h1>Portrait status interiors</h1>'
            + '<p>Native sprites at their actual 42 × 50 arch size. The same effects retain the separate accessible status badges.</p>'
            + '<div id="gallery"></div></main></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'game_data/static/styles/hud-polish.css',
            'game_data/static/styles/party-card-status.css', 'game_data/static/styles/hud-reflow.css',
            'game_data/static/styles/party-faith.css', 'game_data/static/styles/portrait-status.css'])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.addStyleTag({ content: 'body{margin:0;background:#151a20;color:#e2dac7;font:12px system-ui}'
            + '#normal{padding:22px}h1{font-size:19px;margin:0 0 6px}p{color:#a8afad;font-size:11px;max-width:620px;line-height:1.5;margin-bottom:25px}'
            + '#gallery{display:grid;grid-template-columns:repeat(6,1fr);gap:18px 10px}.portrait-case{display:flex;flex-direction:column;align-items:center;gap:10px;min-height:145px}'
            + '.portrait-case>strong{font-size:10px;color:#c7c2b3;font-weight:500}.party-compass{position:absolute;top:-9px;left:11px;z-index:2;width:20px;height:20px;text-align:center;background:#243036;border-radius:50%;color:#a1c7ae}'
            + '.tt-icon{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.5}#normal .hud-hero-medallion{display:block;margin:0;box-sizing:border-box}'
            + '.portrait-case .party-card-status{margin-top:0;min-height:20px}.portrait-case .party-effect-strip{justify-content:center}' });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'static/scripts/contrib/jquery.js'), 'utf8') });
        await page.evaluate(() => { window.portraitModules = { jquery: window.jQuery,
            './tileinfo-dngn': { get_tile_info() { return null; } } }; });
        for (const [id, file] of [
            ['item-properties', 'static/scripts/item-properties.js'],
            ['./effect-icon-catalog', 'game_data/static/effect-icon-catalog.js'], ['./effect-icon-art', 'game_data/static/effect-icon-art.js'], ['./status-icons', 'game_data/static/status-icons.js'],
            ['./party-status-model', 'game_data/static/party-status-model.js'],
            ['./portrait-status', 'game_data/static/portrait-status.js'],
            ['./party-faith', 'game_data/static/party-faith.js'],
            ['./party-card-status', 'game_data/static/party-card-status.js']
        ]) {
            await page.evaluate(id => { window.define = (dependencies, factory) => {
                window.portraitModules[id] = factory(...dependencies.map(key => window.portraitModules[key]));
            }; }, id);
            await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        }
        await page.evaluate(sprite => {
            window.inspections = [];
            const fixtures = [
                ['Clear', []], ['Berserk', ['berserking']], ['Haste', ['hasted']],
                ['Poison', ['mildly poisoned (19 -> 14)']], ['Slowed', ['slowed']], ['Confused', ['confused']],
                ['Petrified', ['petrified']], ['Frozen', ['frozen']], ['Invisible', ['invisible']],
                ['Burning', ['on fire']], ['Berserk + poison', ['berserking', 'poisoned', 'hasted']], ['Unavailable', null]
            ];
            fixtures.forEach(([label, statuses], slot) => {
                const hero = { slot, name: 'Aster', god: 'Trog', piety_rank: 4, penance: 0,
                    statuses: statuses && statuses.map((text, id) => ({ id, text, is_bad: !/berserk|hasted|invisible/.test(text) })) };
                const $ = window.jQuery, cards = window.portraitModules['./party-card-status'];
                const portrait = cards.portrait(hero, $('<span class="party-compass" tabindex="0" aria-label="At your position"></span>').append(window.portraitModules['./status-icons'].icon('compass-rose')),
                    (slot, tab) => window.inspections.push({ slot, tab }));
                portrait.prepend($('<button type="button" class="hud-hero-medallion" aria-label="Inspect Aster"></button>')
                    .on('click', () => window.inspections.push({ slot, tab: 'overview' }))
                    .append($('<img alt="" src="data:image/png;base64,' + sprite + '">'), $('<small>P' + (slot + 1) + '</small>')));
                portrait.append($('<span class="party-member-name">Aster</span>'));
                $('<div class="portrait-case"></div>').attr('data-case', label).append(portrait, $('<strong></strong>').text(label), cards.create(hero)).appendTo('#gallery');
            });
        }, sprite);
        await page.waitForFunction(() => [...document.querySelectorAll('.hud-hero-medallion img')].every(image => image.complete && image.naturalWidth));
        const dimensions = await page.locator('.hud-hero-medallion').evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height };
        }));
        assert(dimensions.every(size => size.width === 42 && size.height === 50));
        assert.equal(await page.locator('[data-case="Clear"] .portrait-status-layer').count(), 0);
        assert.equal(await page.locator('[data-case="Unavailable"] .portrait-status-layer').count(), 0);
        assert.equal(await page.locator('[data-case="Unavailable"] .party-portrait').getAttribute('data-portrait-status'), 'unknown');
        assert.equal(await page.locator('[data-case="Berserk + poison"] .portrait-status-layer').count(), 2);
        assert.equal(await page.locator('[data-case="Berserk + poison"] .party-effect').count(), 3, 'Visual layer limit never hides canonical badges');
        assert(await page.locator('.portrait-status-interior').evaluateAll(elements => elements.every(element =>
            parseFloat(element.style.getPropertyValue('--portrait-motion-phase')) < 0)), 'Rebuilt cards join the global animation phase');
        assert.equal(await page.locator('[data-case="Poison"] .party-effect-warning').count(), 1);
        const confinement = await page.locator('.portrait-status-interior').evaluateAll(elements => elements.every(interior => {
            const outer = interior.parentElement.querySelector('.hud-hero-medallion').getBoundingClientRect(), inner = interior.getBoundingClientRect();
            const sprite = interior.parentElement.querySelector('.hud-hero-medallion');
            const frame = interior.parentElement.querySelector('.party-faith-frame'), compass = interior.parentElement.querySelector('.party-compass');
            return inner.x >= outer.x && inner.y >= outer.y && inner.right <= outer.right && inner.bottom <= outer.bottom
                && getComputedStyle(interior).pointerEvents === 'none' && interior.getAttribute('aria-hidden') === 'true'
                && Number(getComputedStyle(interior).zIndex) < Number(getComputedStyle(sprite).zIndex)
                && Number(getComputedStyle(sprite).zIndex) <= Number(getComputedStyle(frame).zIndex)
                && Number(getComputedStyle(interior).zIndex) < Number(getComputedStyle(compass).zIndex);
        }));
        assert(confinement, 'Status color is clipped entirely inside the native arch');
        assert.equal(await page.locator('[data-case="Invisible"] img').evaluate(image => getComputedStyle(image).opacity), '0.6');
        assert.equal(await page.locator('[data-case="Berserk"] img').evaluate(image => getComputedStyle(image).opacity), '1');
        const berserk = page.locator('[data-case="Berserk"] .hud-hero-medallion');
        await berserk.focus();
        await page.evaluate(() => {
            const portrait = document.querySelector('[data-case="Berserk"] .party-portrait');
            window.originalButton = document.activeElement;
            window.portraitModules['./portrait-status'].decorate(portrait, { statuses: [{ text: 'poisoned', is_bad: true }] });
        });
        assert(await page.evaluate(() => document.activeElement === window.originalButton), 'Status updates preserve sprite node and focus');
        await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => inspections), [{ slot: 1, tab: 'overview' }]);
        await page.locator('[data-case="Berserk"] .party-faith').click();
        assert.deepEqual(await page.evaluate(() => inspections[1]), { slot: 1, tab: 'abilities' });
        await page.evaluate(() => window.portraitModules['./portrait-status'].decorate(
            document.querySelector('[data-case="Berserk"] .party-portrait'), { statuses: [{ text: 'berserking', is_bad: false }] }));
        await page.locator('[data-case="Clear"] .hud-hero-medallion').focus();
        await page.mouse.move(790, 520);
        await page.screenshot({ path: path.join(output, 'portrait-statuses.png'), fullPage: true });
        await page.locator('[data-case="Berserk"]').screenshot({ path: path.join(output, 'berserk-actual-size.png') });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert(await page.locator('.portrait-status-layer').evaluateAll(elements => elements.every(element =>
            getComputedStyle(element, '::before').animationName === 'none' && getComputedStyle(element).backgroundImage !== 'none')));
        await page.screenshot({ path: path.join(output, 'portrait-statuses-reduced-motion.png'), fullPage: true });
        await page.evaluate(() => window.portraitModules['./portrait-status'].decorate(
            document.querySelector('[data-case="Invisible"] .party-portrait'), { statuses: [] }));
        assert.equal(await page.locator('[data-case="Invisible"] img').evaluate(image => getComputedStyle(image).opacity), '1');
        assert.equal(await page.locator('[data-case="Invisible"] .portrait-status-interior').count(), 0, 'Expired effects remove their treatment');
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ actualArch: dimensions[0],
            cases: 12, maxVisualLayers: 2, staticReducedMotion: true, safeInspection: true, errors,
            note: 'Controlled native-sprite DOM fixture; no gameplay effects applied.' }, null, 2));
        console.log('Actual-size status interiors, clipping, bounded combinations, focus, native inspection and static reduced-motion cues passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
