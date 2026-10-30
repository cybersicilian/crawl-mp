/* Controlled shrine presentation, native altar art and safe inspector interaction. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '..');
const output = process.env.FAITH_PROOF_DIR || '/tmp/dcss-faith-proof';
const videoMode = process.argv.includes('--video');
const showcase = ['Trog', 'the Shining One', 'Fedhas', 'Dithmenos', 'Xom', 'Gozag'];
const religion = fs.readFileSync(path.join(source, 'religion.cc'), 'utf8');
const godNames = religion.slice(religion.indexOf('string god_name(god_type'), religion.indexOf('\n}\n', religion.indexOf('string god_name(god_type')));
const gods = [...godNames.matchAll(/case GOD_([A-Z_]+):\s+return "([^"]+)";/g)]
    .filter(match => !['NO_GOD', 'RANDOM', 'NAMELESS', 'ECUMENICAL'].includes(match[1]))
    .map(match => match[2]).filter(name => name !== 'Buggy');
gods.push('Jiyva');
assert.equal(new Set(gods).size, gods.length, 'Native deity names remain distinct.');
assert(gods.includes('Vorr'), 'Vorr joins the existing native shrine renderer.');
assert(gods.includes('Vellum'), 'Vellum has a native shrine renderer.');
assert(gods.includes('Imus Thea'), 'Imus Thea has a native shrine renderer.');
assert(gods.includes('the Great Wyrm'), 'The Great Wyrm has a native shrine renderer.');
assert(gods.includes('Agraphede'), 'Agraphede has a native shrine renderer.');
const nativePortraits = gods.length * 7 + 2;
const materialGradients = (gods.length * 7 + 5) * 2;

(async function () {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: videoMode ? 960 : 900, height: videoMode ? 330 : 1080 },
        deviceScaleFactor: 2, recordVideo: videoMode ? { dir: output, size: { width: 960, height: 330 } } : undefined });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        const atlas = fs.readFileSync(path.join(source, 'rltiles/feat.png')).toString('base64');
        const heroArt = fs.readFileSync(path.join(source, 'rltiles/player/base/human_m.png')).toString('base64');
        await page.setContent('<!doctype html><html><body><img id="feat" hidden src="data:image/png;base64,'
            + atlas + '"><main id="normal"><h1>Deity shrines</h1><p>Native favor tiers 0 → 6. Xom and Gozag retain a fixed identity.</p>'
            + '<div id="gallery"></div><h2>Unavailable, unaffiliated and penance</h2><div id="exceptions"></div></main></body></html>');
        for (const file of ['static/tabletop/tokens.css', 'game_data/static/styles/hud-polish.css',
            'game_data/static/styles/party-card-status.css', 'game_data/static/styles/hud-reflow.css',
            'game_data/static/styles/party-faith.css'])
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.addStyleTag({ content: 'body{margin:0;background:#11171c;color:#dfd8c5;font:12px system-ui}'
            + '#normal{padding:20px}h1{font-size:20px}h2{font-size:15px}p{color:#a5adaf}'
            + '.shrine-row{display:grid;grid-template-columns:132px repeat(7,88px);gap:5px;padding:12px 0;border-top:1px solid #6e684b33}'
            + '.shrine-row>strong{font-size:11px;align-self:center}.shrine-case{width:88px;height:92px;display:flex;align-items:flex-start;justify-content:center;padding-top:5px}'
            + '#normal .party-portrait{position:relative;flex:none}.party-compass{position:absolute;top:-9px;left:11px;z-index:2;width:20px;height:20px;background:#243036;border-radius:50%;text-align:center;color:#a1c7ae}'
            + '.tt-icon{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.5}'
            + '#exceptions{display:flex;gap:25px;margin-left:140px}#normal .hud-hero-medallion{display:block;margin:0;box-sizing:border-box}' });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'static/scripts/contrib/jquery.js'), 'utf8') });
        await page.evaluate(() => {
            window.faithModules = { jquery: window.jQuery };
            window.assert = condition => { if (!condition) throw new Error('Native tile bounds assertion failed.'); };
        });
        for (const [id, file] of [
            ['item-properties', 'static/scripts/item-properties.js'],
            ['./effect-icon-catalog', 'game_data/static/effect-icon-catalog.js'], ['./effect-icon-art', 'game_data/static/effect-icon-art.js'], ['./status-icons', 'game_data/static/status-icons.js'],
            ['./party-status-model', 'game_data/static/party-status-model.js'],
            ['./tileinfo-floor', 'game_data/static/tileinfo-floor.js'],
            ['./tileinfo-wall', 'game_data/static/tileinfo-wall.js'],
            ['./tileinfo-feat', 'game_data/static/tileinfo-feat.js'],
            ['./tileinfo-dngn', 'game_data/static/tileinfo-dngn.js'],
            ['./party-faith', 'game_data/static/party-faith.js']
        ]) {
            await page.evaluate(id => {
                window.define = (dependencies, factory) => {
                    window.faithModules[id] = factory(...dependencies.map(key => window.faithModules[key]));
                };
            }, id);
            await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        }
        await page.evaluate(({ gods, heroArt, videoMode }) => {
            window.inspections = [];
            function build(god, tier, id, changes) {
                const hero = Object.assign({ slot: id, name: god || 'Unaffiliated', god,
                    piety_rank: tier, penance: 0, god_relation: 'None' }, changes);
                const portrait = window.faithModules['./party-faith'].portrait(hero,
                    window.jQuery('<span class="party-compass"></span>').append(window.faithModules['./status-icons'].icon('compass-rose')), (slot, tab) => window.inspections.push({ slot, tab }));
                portrait.prepend(window.jQuery('<button class="hud-hero-medallion" tabindex="-1" aria-hidden="true"></button>')
                    .append(window.jQuery('<img alt="" src="data:image/png;base64,' + heroArt + '">')));
                portrait.append(window.jQuery('<span class="party-member-name"></span>').text(tier === null ? '?' : tier));
                return window.jQuery('<div class="shrine-case"></div>').append(portrait);
            }
            window.buildFaithProof = build;
            gods.forEach((god, godIndex) => {
                const row = window.jQuery('<div class="shrine-row"></div>').attr('data-god', god)
                    .append(window.jQuery('<strong></strong>').text(god));
                for (let tier = videoMode ? 6 : 0; tier <= 6; tier++) row.append(build(god, tier, godIndex * 7 + tier));
                window.jQuery('#gallery').append(row);
            });
            if (!videoMode) window.jQuery('#exceptions').append(build(undefined, null, 1000), build('No God', null, 1001),
                build('Trog', 6, 1002, { penance: 30 }), build('Sif Muna', null, 1003),
                build('No God', null, 1004, { species: 'Eldritch', defiance: 37, elder_rites: 2 }));
        }, { gods: videoMode ? showcase : gods, heroArt, videoMode });
        if (videoMode) {
            await page.evaluate(() => {
                document.querySelector('h1').textContent = 'Living deity shrines';
                document.querySelector('p').textContent = 'Native favor VI · Xom and Gozag retain fixed identity effects · 2× display size';
                document.querySelector('h2').remove(); document.querySelector('#exceptions').remove();
                document.querySelectorAll('.party-member-name').forEach(label => label.remove());
            });
            await page.addStyleTag({ content: '#gallery{display:flex;gap:8px;margin-top:24px}'
                + '.shrine-row{display:flex;flex-direction:column;align-items:center;width:144px;gap:18px;border:0;padding:0}'
                + '.shrine-row>strong{font-size:12px;white-space:nowrap}.shrine-case{width:144px;height:164px;padding-top:5px}'
                + '#normal .party-portrait{transform:scale(2);transform-origin:top center}' });
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            await page.waitForFunction(() => document.querySelectorAll('.party-faith[data-faith-art="native"]').length === 6);
            assert.equal(await page.locator('.faith-particle').count(), 30);
            await page.screenshot({ path: path.join(output, 'shrine-motion-still.png') });
            await page.waitForTimeout(5500);
            assert.deepEqual(errors, []);
            const video = page.video();
            await page.close();
            await video.saveAs(path.join(output, 'shrine-motion.webm'));
            await video.delete();
            console.log('Recorded shrine motion in the browser at 2× display size.');
            return;
        }
        await page.waitForFunction(count => document.querySelectorAll('.party-faith[data-faith-art="native"]').length === count, nativePortraits);
        const facts = await page.evaluate(() => [...document.querySelectorAll('.shrine-row')].map(row => ({
            god: row.dataset.god, shapes: [...row.querySelectorAll('.party-portrait')].map(portrait => ({
                key: portrait.dataset.faithGod, kind: portrait.dataset.faithKind, tier: portrait.dataset.faithTier,
                silhouette: portrait.querySelector('.faith-frame-structure').getAttribute('d'),
                pedestal: portrait.querySelector('.faith-plinth-stone').getAttribute('d'),
                accent: portrait.style.getPropertyValue('--faith-accent'),
                particles: portrait.querySelectorAll('.faith-particle').length,
                atmosphere: portrait.dataset.faithAtmosphere,
                setting: portrait.querySelector('.faith-idol-setting').dataset.faithSetting,
                socket: portrait.querySelector('.faith-idol-recess').getAttribute('d'),
                layers: [...portrait.querySelectorAll('.faith-craft')].filter(layer => layer.getAttribute('display') !== 'none').length,
                label: portrait.querySelector('.party-faith').getAttribute('aria-label')
            }))
        })));
        assert.equal(new Set(facts.map(fact => fact.shapes[0].silhouette)).size, gods.length);
        assert.equal(new Set(facts.map(fact => fact.shapes[0].pedestal)).size, gods.length);
        assert.equal(new Set(facts.map(fact => fact.shapes[0].socket)).size, gods.length,
            'Each native altar sits in its deity-specific carved pedestal setting.');
        assert(facts.every(fact => /^#[0-9a-f]{6}$/i.test(fact.shapes[0].accent)), 'Native jQuery does not erase CSS custom properties.');
        for (const fact of facts) {
            if (['Xom', 'Gozag'].includes(fact.god)) {
                assert(fact.shapes.every(shape => shape.tier === 'unknown'));
                assert.equal(new Set(fact.shapes.map(shape => shape.layers)).size, 1);
                assert(fact.shapes.every(shape => shape.particles === 3), 'Non-piety identity is fixed.');
            } else {
                assert.deepEqual(fact.shapes.map(shape => shape.tier), ['0', '1', '2', '3', '4', '5', '6']);
                assert.deepEqual(fact.shapes.map(shape => shape.layers), [1, 1, 2, 3, 4, 5, 6]);
                assert.deepEqual(fact.shapes.map(shape => shape.particles), [0, 1, 2, 3, 4, 5, 6]);
            }
            assert(fact.shapes.every(shape => shape.atmosphere !== 'none'));
        }
        assert.equal(await page.locator('.party-faith-favor').count(), 0, 'No linear piety meter or star strip.');
        assert.equal(await page.locator('#party_faith_1000.is-unknown').count(), 1);
        assert.equal(await page.locator('#party_faith_1001.is-unaffiliated').count(), 1);
        assert.equal(await page.locator('#party_faith_1002.is-penance').count(), 1);
        assert.match(await page.locator('#party_faith_1004').getAttribute('aria-label'), /Defiance 37\/100/);
        assert.equal(await page.locator('#party_faith_1004 [data-ui-icon="spark"]').count(), 1);
        assert.match(await page.locator('#party_faith_1002').getAttribute('aria-label'), /Under penance/);
        const motion = await page.evaluate(() => {
            const portraits = [...document.querySelectorAll('.party-portrait')];
            const trog = document.querySelector('[data-god="Trog"] .shrine-case:last-child .party-portrait');
            window.faithMotionTarget = trog.querySelector('.faith-particle');
            const gradients = [...document.querySelectorAll('.party-faith-frame linearGradient')].map(node => node.id);
            return {
                maxParticles: Math.max(...portraits.map(portrait => portrait.querySelectorAll('.faith-particle').length)),
                inertArt: [...document.querySelectorAll('.party-faith-frame, .party-faith-frame *')]
                    .every(node => getComputedStyle(node).pointerEvents === 'none'),
                uniqueGradients: gradients.length === new Set(gradients).size,
                gradients: gradients.length,
                boundedArches: [...document.querySelectorAll('.faith-frame-structure')].every(arch => {
                    const bounds = arch.getBBox();
                    return bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 60 && bounds.y + bounds.height <= 68;
                }),
                animation: getComputedStyle(window.faithMotionTarget).animationName,
                time: window.faithMotionTarget.getAnimations()[0].currentTime,
                stillStates: [...document.querySelectorAll('#exceptions .party-portrait')]
                    .every(portrait => portrait.getAnimations({ subtree: true }).length === 0),
                lowTierStill: document.querySelector('[data-god="Trog"] .shrine-case .party-portrait')
                    .getAnimations({ subtree: true }).length === 0,
                transparentArt: [...document.querySelectorAll('.party-faith > canvas')]
                    .every(canvas => getComputedStyle(canvas).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(canvas).filter === 'none'),
                altarAlignment: [...document.querySelectorAll('.shrine-row .party-portrait')].every(portrait => {
                    const point = new DOMPoint(0, 0).matrixTransform(portrait.querySelector('.faith-idol-setting').getScreenCTM());
                    const bounds = portrait.querySelector('.party-faith > canvas').getBoundingClientRect();
                    return Math.abs(point.x - bounds.x - bounds.width / 2) < .1
                        && Math.abs(point.y - bounds.y - bounds.height / 2) < .1;
                }),
                geometry: trog.querySelector('.faith-frame-structure').getAttribute('d')
            };
        });
        assert.equal(motion.maxParticles, 6, 'At most six motes per hero; no timers or emitters.');
        assert(motion.inertArt, 'Decorative SVG never captures pointer input.');
        assert(motion.uniqueGradients && motion.gradients === materialGradients, 'Material references stay unique across the gallery.');
        assert(motion.boundedArches, 'Deity and unaffiliated arches stay inside their portrait envelope.');
        assert(motion.transparentArt && motion.altarAlignment, 'Native altar pixels remain unfiltered and centered in transparent carved settings.');
        assert.equal(motion.animation, 'faith-ember-rise');
        assert(motion.stillStates && motion.lowTierStill, 'Missing favor, no god, penance and rank zero remain still.');
        await page.waitForTimeout(180);
        assert(await page.evaluate(time => window.faithMotionTarget.getAnimations()[0].currentTime > time, motion.time),
            'CSS animation advances without JavaScript animation loops.');
        await page.evaluate(() => {
            const probe = window.buildFaithProof('Trog', 6, 2000).attr('id', 'phase_probe');
            document.body.appendChild(probe[0]);
            probe[0].style.cssText = 'position:fixed;left:-500px;top:0';
        });
        await page.waitForTimeout(850);
        const phasePreserved = await page.evaluate(() => {
            const probe = document.querySelector('#phase_probe');
            const before = probe.querySelector('.faith-particle').getAnimations()[0].effect.getComputedTiming().progress;
            const replacement = window.buildFaithProof('Trog', 6, 2000)[0];
            probe.replaceChildren(...replacement.childNodes);
            const after = probe.querySelector('.faith-particle').getAnimations()[0].effect.getComputedTiming().progress;
            const distance = Math.abs(before - after);
            probe.remove(); return Math.min(distance, 1 - distance) < .025;
        });
        assert(phasePreserved, 'A native card rebuild preserves global CSS particle phase instead of replaying its entrance.');
        await page.locator('#party_faith_1002').focus(); await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.inspections), [{ slot: 1002, tab: 'abilities' }]);
        await page.locator('#party_faith_1001').click();
        assert.deepEqual(await page.evaluate(() => window.inspections[1]), { slot: 1001, tab: 'overview' });
        assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(output, 'deity-shrines.png'), fullPage: true });
        const row = page.locator('.shrine-row').filter({ has: page.locator('strong', { hasText: /^Trog$/ }) });
        await row.screenshot({ path: path.join(output, 'trog-progression.png') });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const reduced = await page.evaluate(() => ({
            moving: [...document.querySelectorAll('.party-faith-frame, .party-faith-frame *')]
                .some(node => getComputedStyle(node).animationName !== 'none'),
            particlesHidden: [...document.querySelectorAll('.faith-particles')]
                .every(node => getComputedStyle(node).display === 'none'),
            geometry: document.querySelector('[data-god="Trog"] .shrine-case:last-child .faith-frame-structure').getAttribute('d'),
            nativeArt: document.querySelectorAll('.party-faith[data-faith-art="native"]').length,
            penance: document.querySelector('#party_faith_1002').getAttribute('aria-label')
        }));
        assert.equal(reduced.moving, false, 'Reduced motion freezes every SVG craft layer and particle.');
        assert(reduced.particlesHidden, 'Reduced motion removes moving particles, preserving the static shrine.');
        assert.equal(reduced.geometry, motion.geometry);
        assert.equal(reduced.nativeArt, nativePortraits);
        assert.match(reduced.penance, /Under penance/);
        await row.screenshot({ path: path.join(output, 'trog-reduced-motion.png') });
        await page.locator('#exceptions').screenshot({ path: path.join(output, 'faith-still-status.png') });
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ deities: facts.length,
            tiers: 7, nativeArt: nativePortraits, maxParticles: motion.maxParticles, phasePreserved,
            integratedAltars: motion.transparentArt && motion.altarAlignment, reducedMotion: !reduced.moving && reduced.particlesHidden,
            errors, note: 'Controlled presentation fixture; no gameplay or piety changes executed.' }, null, 2));
        console.log('Deity shrine identity, native art, piety, CSS motion, reduced motion and inspector checks passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
