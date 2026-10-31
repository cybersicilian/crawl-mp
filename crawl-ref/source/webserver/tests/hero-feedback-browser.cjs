/* Controlled browser presentation proof. Does not launch a native game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.HERO_FEEDBACK_PROOF_DIR;
const asset = file => 'data:image/png;base64,' + fs.readFileSync(path.join(root, file)).toString('base64');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1040, height: 720 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<main id="normal"><h1>Dungeon motion study</h1>'
            + '<p>Confirmed movement · health changes · level gains</p>'
            + '<div class="study"><canvas id="dungeon" width="1152" height="960"></canvas>'
            + '<aside id="party_hud_members"></aside></div><small>Controlled presentation fixture · native tile art</small></main>');
        for (const file of ['game_data/static/styles/game-coop.css', 'game_data/static/styles/health-effects.css',
            'game_data/static/styles/hero-feedback.css']) await page.addStyleTag({ path: path.join(root, file) });
        await page.addStyleTag({ content: `
            body { margin:0; background:#0e1216; color:#e7ddc7; font:14px/1.5 system-ui; }
            #normal { padding:30px; max-width:1040px; box-sizing:border-box; }
            h1 { margin:0; font:28px Georgia; color:#f1d7a5; } p { color:#a9a28f; margin:6px 0 22px; }
            .study { display:flex; align-items:flex-start; gap:24px; }
            #dungeon { width:576px; height:auto; max-width:100%; image-rendering:pixelated; border:1px solid #66553c; }
            aside { width:290px; flex:none; } .party-member-card { padding:18px; margin-bottom:12px;
                color:#e7ddc7; background:linear-gradient(140deg,#252b31,#171c21); border-color:#766449; }
            h2 { margin:0 0 4px; font:19px Georgia; color:#ecd4a0; } .identity { color:#a9a28f; font-size:12px; margin-bottom:18px; }
            .party-bar-wrap { height:18px; } .party-bar-label { font:11px/18px monospace; }
            small { display:block; color:#8e887b; margin-top:18px; }
            @media(max-width:700px) { #normal { padding:16px; } .study { flex-direction:column; } aside { width:100%; } }
        ` });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaModules = { jquery: window.jQuery,
                './map_knowledge': { get: (x, y) => ({ x, y }), visible: cell => cell.x !== 9 } };
            window.define = (dependencies, factory) => {
                window.qaModules[window.qaName] = factory(...dependencies.map(name => window.qaModules[name]));
            };
        });
        for (const name of ['party-status-model', 'hero-feedback-model', 'map-effect-layer', 'hero-feedback']) {
            await page.evaluate(name => { window.qaName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        const art = { floor: asset('../rltiles/dngn/floor/grey_dirt_b_0.png'),
            wall: asset('../rltiles/dngn/wall/stone_dark0.png'),
            hero: asset('static/player-tiles/human_f-adb2b8f37b92.png') };
        await page.evaluate(async art => {
            const images = {};
            for (const [name, src] of Object.entries(art)) {
                images[name] = new Image(); images[name].src = src; await images[name].decode();
            }
            const canvas = document.getElementById('dungeon');
            window.qaRenderer = { element: canvas, viewX: 0,
                in_view(x, y) { return x >= this.viewX && x < this.viewX + 12 && y >= 0 && y < 10; },
                canvas_coords(x, y) { return { x: (x - this.viewX) * 96, y: y * 96, width: 96, height: 96 }; } };
            window.qaClicks = 0; canvas.addEventListener('click', () => window.qaClicks++);
            window.qaModules['./hero-feedback'].attach(window.qaRenderer);
            window.qaMembers = [
                { slot: 0, name: 'Aster', place: 'D:1', alive: true, pos: { x: 3, y: 4 },
                    hp: 26, hp_max: 30, xl: 3, statuses: [] },
                { slot: 1, name: 'Rowan', place: 'D:1', alive: true, pos: { x: 6, y: 5 },
                    hp: 14, hp_max: 24, xl: 2, statuses: [] }
            ];
            window.qaPublish = (floor = 'D:1') => {
                window.jQuery(document).trigger('party_cards_rebuilding');
                document.getElementById('party_hud_members').replaceChildren();
                const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
                for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) {
                    const image = !x || !y || x === 11 || y === 9 ? images.wall : images.floor;
                    ctx.drawImage(image, x * 96, y * 96, 96, 96);
                }
                for (const hero of window.qaMembers) {
                    const point = window.qaRenderer.canvas_coords(hero.pos.x, hero.pos.y);
                    if (hero.pos.x !== 9) ctx.drawImage(images.hero, point.x, point.y, 96, 96);
                    const card = document.createElement('div'); card.className = 'party-member-card';
                    card.dataset.partySlot = hero.slot;
                    const name = document.createElement('h2'); name.textContent = hero.name; card.appendChild(name);
                    const identity = document.createElement('div'); identity.className = 'identity';
                    identity.textContent = 'LEVEL ' + hero.xl + ' · ' + hero.place; card.appendChild(identity);
                    const bar = document.createElement('div'); bar.className = 'party-bar-wrap hp-track';
                    bar.id = 'party_hp_' + hero.slot; bar.setAttribute('role', 'meter');
                    bar.setAttribute('aria-valuenow', hero.hp); bar.setAttribute('aria-valuemax', hero.hp_max);
                    const fill = document.createElement('div'); fill.className = 'party-hp-fill';
                    fill.style.width = 100 * hero.hp / hero.hp_max + '%'; bar.appendChild(fill);
                    const label = document.createElement('span'); label.className = 'party-bar-label';
                    label.textContent = 'HP ' + hero.hp + '/' + hero.hp_max; bar.appendChild(label);
                    card.appendChild(bar); document.getElementById('party_hud_members').appendChild(card);
                }
                window.jQuery(document).trigger('party_state_rendered', [{ floor, members: window.qaMembers }]);
            };
            window.jQuery(document).trigger('game_init'); window.qaPublish();
        }, art);
        assert.equal(await page.locator('.hero-feedback-layer').count(), 0, 'initial snapshots have no animation');
        await page.evaluate(() => {
            window.qaMembers[0].hp = 19; window.qaMembers[0].pos.x++;
            window.qaMembers[1].hp = 21; window.qaMembers[1].xl++;
            window.qaPublish();
        });
        await page.waitForFunction(() => document.querySelector('.hero-feedback-layer')?.dataset.effects === '4');
        assert.equal(await page.locator('#party_hp_0').getAttribute('aria-valuenow'), '19');
        assert.equal(await page.locator('#party_hp_0 .party-bar-label').textContent(), 'HP 19/30');
        assert.equal(await page.locator('#party_hp_0 .party-hp-fill').evaluate(el => el.style.width), '63.3333%');
        assert.equal(await page.locator('.hero-hp-echo.damage').count(), 1);
        assert.equal(await page.locator('.hero-hp-echo.heal').count(), 1);
        const overlay = await page.locator('.hero-feedback-layer').evaluate(el => ({
            width: el.width, cssWidth: el.style.width, pointer: getComputedStyle(el).pointerEvents,
            alpha: el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some((value, i) => i % 4 === 3 && value > 0)
        }));
        assert.equal(overlay.width, 1152); assert.equal(overlay.pointer, 'none'); assert(overlay.alpha);
        if (output) {
            fs.mkdirSync(output, { recursive: true });
            await page.screenshot({ path: path.join(output, 'feedback-preview.png') });
        }
        await page.locator('#dungeon').click({ position: { x: 215, y: 220 } });
        assert.equal(await page.evaluate(() => window.qaClicks), 1, 'active effects do not consume clicks');
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        assert.equal(await page.locator('.hero-feedback-layer, .hero-hp-echo').count(), 0);
        assert.equal(await page.evaluate(() => document.getAnimations().length), 0);

        // Hidden tiles receive neither text nor particles, even when party HP is known.
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_init');
            window.qaMembers[0].pos.x = 9; window.qaMembers[1].pos.x = 9; window.qaPublish();
            window.qaMembers[0].hp--; window.qaPublish();
        });
        await page.waitForFunction(() => document.querySelector('.hero-feedback-layer'));
        assert.equal(await page.locator('.hero-feedback-layer').evaluate(el =>
            el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some(value => value)), false);
        await page.evaluate(() => window.qaPublish('D:2'));
        assert.equal(await page.locator('.hero-feedback-layer').count(), 0, 'floor changes clear prior cues');

        async function setMotion(value) {
            await page.emulateMedia({ reducedMotion: value });
            // Media-query change notifications are dispatched at the next rendering update.
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
        await page.setViewportSize({ width: 390, height: 780 });
        await page.evaluate(() => { window.qaMembers[0].pos.x = 4; window.qaPublish();
            window.qaMembers[0].hp++; window.qaPublish(); });
        await page.waitForFunction(() => document.querySelector('.hero-feedback-layer'));
        const narrow = await page.locator('.hero-feedback-layer').boundingBox();
        const dungeon = await page.locator('#dungeon').boundingBox();
        assert(Math.abs(narrow.width - dungeon.width) < 1 && Math.abs(narrow.x - dungeon.x) < 1);
        await setMotion('reduce');
        assert.equal(await page.locator('.hero-feedback-layer, .hero-hp-echo').count(), 0);
        assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
        await page.evaluate(() => { window.qaPublish(); window.qaMembers[0].hp--; window.qaPublish(); });
        assert.equal(await page.locator('.hero-feedback-layer, .hero-hp-echo').count(), 0);
        await setMotion('no-preference');
        await page.evaluate(() => { window.qaPublish(); window.qaMembers[0].hp++; window.qaPublish(); });
        await page.waitForFunction(() => document.querySelector('.hero-feedback-layer'));
        await page.waitForFunction(() => !document.querySelector('.hero-feedback-layer'));
        await page.waitForFunction(() => document.getAnimations().length === 0);
        assert.deepEqual(errors, []);
        const result = { passed: true, proof: 'controlled-browser', checks: ['native HP labels remain immediate',
            'movement/damage/healing/level paint', 'retina geometry', 'input passes through',
            'hidden tiles', 'floor/cleanup', 'reduced motion', 'narrow viewport', 'idle cleanup'], errors };
        if (output) fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    } catch (error) {
        if (output) {
            fs.mkdirSync(output, { recursive: true });
            await page.screenshot({ path: path.join(output, 'failure.png') });
        }
        throw error;
    } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
