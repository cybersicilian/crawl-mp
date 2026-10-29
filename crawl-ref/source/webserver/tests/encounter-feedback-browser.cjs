/* Real map/flag/cursor modules, controlled native-shaped packets, no native game. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.ENCOUNTER_FEEDBACK_PROOF_DIR;
const asset = file => 'data:image/png;base64,' + fs.readFileSync(path.join(root, file)).toString('base64');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 960, height: 680 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<main><h1>Combat feedback</h1><p>Spell sparks · wound impacts · target settling</p>'
            + '<canvas id="dungeon" width="1440" height="960"></canvas>'
            + '<footer>Controlled presentation fixture · confirmed map changes · native tile art</footer></main>');
        await page.addStyleTag({ content: 'body{margin:0;background:#10151a;color:#bdb5a0;font:14px/1.5 system-ui}'
            + 'main{max-width:780px;margin:0 auto;padding:30px}h1{font:30px Georgia;color:#efd6a2;margin:0}'
            + 'p{margin:8px 0 22px}canvas{display:block;width:720px;max-width:100%;height:auto;image-rendering:pixelated;outline:1px solid #6d5b3c}'
            + 'footer{font-size:12px;margin-top:18px;color:#96917f}' });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaHandlers = {}; window.qaTargeting = false;
            window.qaModules = { jquery: window.jQuery,
                comm: { register_handlers: handlers => Object.assign(window.qaHandlers, handlers) },
                './game-context': { can_target: () => window.qaTargeting } };
            window.define = (names, factory) => {
                if (typeof names === 'function') { factory = names; names = []; }
                window.qaModules[window.qaName] = factory(...names.map(name => window.qaModules[name]));
            };
        });
        for (const name of ['util', 'enums', 'map_knowledge', 'view_data', 'map-effect-layer',
            'encounter-feedback-model', 'encounter-feedback-paint', 'encounter-feedback']) {
            await page.evaluate(name => { window.qaName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        await page.evaluate(async images => {
            const canvas = document.getElementById('dungeon'), ctx = canvas.getContext('2d');
            const art = {};
            for (const [name, src] of Object.entries(images)) {
                art[name] = new Image(); art[name].src = src; await art[name].decode();
            }
            ctx.imageSmoothingEnabled = false;
            const knowledge = window.qaModules['./map_knowledge'];
            window.qaRenderer = { element: canvas, viewX: 0,
                in_view(x, y) { return x >= this.viewX && x < this.viewX + 15 && y >= 0 && y < 10; },
                canvas_coords(x, y) { return { x: (x - this.viewX) * 96, y: y * 96, width: 96, height: 96 }; } };
            window.qaModules['./encounter-feedback'].attach(window.qaRenderer);
            window.qaClicks = 0; canvas.addEventListener('click', () => window.qaClicks++);
            window.jQuery(document).trigger('game_init');
            const cells = [];
            for (let y = 0; y < 10; y++) for (let x = 0; x < 15; x++) {
                ctx.drawImage(!x || !y || x === 14 || y === 9 ? art.wall : art.floor, x * 96, y * 96, 96, 96);
                cells.push({ x, y, t: { bg: 0, fg: 0 }, flc: 0 });
            }
            knowledge.merge(cells);
            ctx.drawImage(art.hero, 3 * 96, 5 * 96, 96, 96);
            ctx.drawImage(art.monster, 8 * 96, 5 * 96, 96, 96);
            knowledge.merge([{ x: 8, y: 5, t: { fg: 1 }, mon: { id: 7, type: 10 } }]);
            window.qaImpact = () => knowledge.merge([
                { x: 8, y: 5, t: { fg: [0xc0000001, 0] } },
                { x: 5, y: 3, flc: 12 }, { x: 7, y: 3, flc: 9 }, { x: 9, y: 3, flc: 11 }
            ]);
            window.qaCursor = loc => window.qaModules['./view_data'].place_cursor(window.qaModules['./enums'].CURSOR_MOUSE, loc);
        }, { floor: asset('../rltiles/dngn/floor/grey_dirt_b_0.png'),
            wall: asset('../rltiles/dngn/wall/stone_dark0.png'),
            hero: asset('static/player-tiles/human_f-adb2b8f37b92.png'),
            monster: asset('../rltiles/mon/humanoids/orcs/orc_warrior.png') });
        assert.equal(await page.locator('.encounter-feedback-layer').count(), 0);
        await page.evaluate(() => window.qaCursor({ x: 8, y: 5 }));
        assert.equal(await page.locator('.encounter-feedback-layer').count(), 0, 'hovering is quiet outside targeting');
        await page.evaluate(() => { window.qaTargeting = true; window.qaCursor({ x: 8, y: 5 }); window.qaImpact(); });
        await page.waitForFunction(() => document.querySelector('.encounter-feedback-layer')?.dataset.effects === '5');
        const pixels = await page.locator('.encounter-feedback-layer').evaluate(el => {
            const ctx = el.getContext('2d'), colours = [];
            for (const x of [5, 7, 9]) {
                const data = ctx.getImageData(x * 96, 3 * 96, 96, 96).data;
                let best = [0, 0, 0, 0];
                for (let i = 0; i < data.length; i += 4) if (data[i + 3] > best[3]) best = Array.from(data.slice(i, i + 4));
                colours.push(best);
            }
            return { width: el.width, pointer: getComputedStyle(el).pointerEvents, colours };
        });
        assert.equal(pixels.width, 1440); assert.equal(pixels.pointer, 'none');
        const [red, blue, cyan] = pixels.colours;
        assert(red[0] > red[1] && red[3] > 0);
        assert(blue[2] > blue[0] && blue[3] > 0);
        assert(cyan[1] > cyan[0] && cyan[2] > cyan[0] && cyan[3] > 0);
        if (output) { fs.mkdirSync(output, { recursive: true });
            await page.screenshot({ path: path.join(output, 'encounter-preview.png') }); }
        await page.locator('#dungeon').click({ position: { x: 410, y: 260 } });
        assert.equal(await page.evaluate(() => window.qaClicks), 1);
        await page.evaluate(() => window.qaModules['./map_knowledge'].clear());
        assert.equal(await page.locator('.encounter-feedback-layer').count(), 0, 'map clear removes all old-floor effects');

        // Native cursor removal cancels its transient without clearing unrelated state.
        await page.evaluate(() => {
            window.qaModules['./map_knowledge'].merge([{ x: 8, y: 5, t: { bg: 0, fg: 1 } }]);
            window.qaCursor({ x: 8, y: 5 });
        });
        await page.waitForFunction(() => document.querySelector('.encounter-feedback-layer'));
        await page.evaluate(() => window.qaCursor(null));
        assert.equal(await page.locator('.encounter-feedback-layer').count(), 0);
        // Visible-to-hidden transitions may never emit or paint remembered combat.
        await page.evaluate(() => {
            const map = window.qaModules['./map_knowledge'];
            map.merge([{ x: 8, y: 5, t: { bg: 0x40000 }, flc: 0 }]);
            map.merge([{ x: 8, y: 5, flc: 12 }]); window.qaCursor({ x: 8, y: 5 });
        });
        assert.equal(await page.locator('.encounter-feedback-layer').count(), 0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => {
            const map = window.qaModules['./map_knowledge'];
            map.merge([{ x: 8, y: 5, t: { bg: 0 }, flc: 0 }]);
            map.merge([{ x: 8, y: 5, flc: 12 }]); window.qaCursor({ x: 8, y: 5 });
        });
        assert.equal(await page.locator('.encounter-feedback-layer').count(), 0);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.setViewportSize({ width: 390, height: 620 });
        await page.evaluate(() => window.qaCursor({ x: 8, y: 5 }));
        await page.waitForFunction(() => document.querySelector('.encounter-feedback-layer'));
        const geometry = await page.locator('.encounter-feedback-layer').boundingBox();
        const dungeon = await page.locator('#dungeon').boundingBox();
        assert(Math.abs(geometry.width - dungeon.width) < 1 && Math.abs(geometry.x - dungeon.x) < 1);
        await page.waitForFunction(() => !document.querySelector('.encounter-feedback-layer'));
        await page.evaluate(() => window.jQuery(document).trigger('game_cleanup'));
        assert.deepEqual(errors, []);
        const result = { passed: true, proof: 'controlled-browser', checks: ['real native flag and cursor contracts',
            'three native flash palettes', 'wound crescents', 'target-mode gating and removal', 'click-through',
            'map clear', 'hidden tiles', 'reduced motion', 'retina/narrow geometry', 'idle cleanup'], errors };
        if (output) fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    } catch (error) {
        if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'failure.png') }); }
        throw error;
    } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
