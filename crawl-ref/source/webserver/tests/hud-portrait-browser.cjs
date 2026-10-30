/* Real browser exercise of native portrait layers, refresh, and inspection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const web = path.resolve(__dirname, '..');
const source = path.resolve(web, '..');
const output = process.env.PORTRAIT_PROOF_DIR || '/tmp/dcss-hud-portrait-proof';
const nativeArt = process.env.PORTRAIT_NATIVE_ART || path.join(web, 'game_data/static/native-tile-art.js');
const hudCss = process.env.PORTRAIT_HUD_CSS || path.join(web, 'game_data/static/styles/hud-polish.css');
const png = name => 'data:image/png;base64,' + fs.readFileSync(path.join(source, 'rltiles/player', name)).toString('base64');
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<main id="normal"><div id="party_hud"><div class="party-card" data-party-slot="0">'
            + '<div class="party-portrait"><button class="party-member-name">Inspect</button></div></div></div></main>');
        await page.addStyleTag({ content: fs.readFileSync(hudCss, 'utf8') });
        await page.addStyleTag({ content: fs.readFileSync(path.join(web, 'game_data/static/styles/equipment-paperdoll.css'), 'utf8') });
        await page.addScriptTag({ path: path.join(web, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(async images => {
            const load = src => new Promise((resolve, reject) => {
                const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
            });
            const [base, gear, alternate] = await Promise.all(images.map(load));
            const atlas = document.createElement('canvas'); atlas.width = 96; atlas.height = 32;
            const ctx = atlas.getContext('2d');
            ctx.drawImage(base, 0, 0); ctx.drawImage(gear, 32, 0); ctx.drawImage(alternate, 64, 0);
            const player = await load(atlas.toDataURL()); player.id = 'player'; document.body.appendChild(player);
            window.modules = { jquery: window.jQuery, 'character-catalog': { species: {} },
                './status-icons': { icon: () => document.createElement('i') } };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
            window.inspections = 0;
            document.querySelector('.party-member-name').addEventListener('click', () => window.inspections++);
        }, [png('base/tortle.png'), png('body/robe_jester.png'), png('base/golem.png')]);
        for (const [name, file] of [['./native-tile-art', nativeArt], ['./hud-polish', path.join(web, 'game_data/static/hud-polish.js')]]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: file });
        }
        const result = await page.evaluate(() => {
            const layer = sx => ({ sx, sy: 0, w: 32, h: 32, ox: 0, oy: 0, ymax: 32 });
            const hero = { slot: 0, name: 'Tortoise', species: 'Tortle', job: 'Jester',
                equipment_profile: { portrait: { texture: 'player', layers: [layer(0), layer(32)] } } };
            window.crawl_party = { state: { members: [hero] } };
            const render = () => window.jQuery(document).trigger('party_state_rendered');
            render();
            const button = document.querySelector('.hud-hero-medallion');
            const appearance = () => button.querySelector('.hud-hero-appearance');
            const pixels = () => Array.from(appearance().querySelector('canvas').getContext('2d').getImageData(0, 0, 32, 32).data);
            const initial = pixels();
            hero.equipment_profile.portrait.layers = [layer(0)]; render();
            const noGear = pixels();
            hero.species = 'Golem'; hero.job = 'Jester'; hero.equipment_profile.portrait.layers = [layer(64)]; render();
            const newSpecies = pixels();
            button.click();
            return { initial, noGear, newSpecies, state: appearance().dataset.art,
                buttonRetained: button === document.querySelector('.hud-hero-medallion'), inspections: window.inspections,
                accessibleName: button.getAttribute('aria-label') };
        });
        assert.equal(result.state, 'ready');
        assert(result.initial.some((v, i) => i % 4 === 3 && v > 0), 'portrait contains visible pixels');
        assert.notDeepEqual(result.initial, result.noGear, 'equipment layer changes the portrait');
        assert.notDeepEqual(result.noGear, result.newSpecies, 'species change updates the portrait');
        assert(result.buttonRetained); assert.equal(result.inspections, 1); assert.equal(result.accessibleName, 'Inspect Tortoise');
        assert.deepEqual(errors, []);
        await page.locator('.party-portrait').screenshot({ path: path.join(output, 'portrait.png'), scale: 'css' });
        console.log('Browser portrait rendering, equipment changes, species changes, and inspection passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
