const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Disposable native expedition: every settled frame must match a clean repaint. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18988';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Use an isolated local QA server');
const output = process.env.FRAME_PROOF_DIR || '/tmp/dcss-display-frames-proof';
fs.mkdirSync(output, { recursive: true });

(async () => {
    // Repeated readbacks can switch a canvas from GPU to CPU rasterization.
    // Keep both canvases on the same backend so text edges compare exactly.
    const browser = await chromium.launch({ headless: true, channel: 'chrome',
        args: ['--disable-accelerated-2d-canvas'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: Number(process.env.FRAME_DPR || 1) });
    page.setDefaultTimeout(20000);
    const errors = [], samples = [];
    page.on('pageerror', error => errors.push(error.message));
    const settle = () => page.evaluate(() => new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const compare = label => page.evaluate(label => {
        const proof = window.frameProof, renderer = proof.renderer;
        const canvas = renderer.element, context = renderer.ctx;
        const actual = context.getImageData(0, 0, canvas.width, canvas.height);
        const reference = document.createElement('canvas');
        reference.width = canvas.width; reference.height = canvas.height;
        renderer.ctx = reference.getContext('2d');
        const started = performance.now();
        try {
            renderer.clear();
            for (let y = renderer.view.y; y < renderer.view.y + renderer.rows; y++)
                for (let x = renderer.view.x; x < renderer.view.x + renderer.cols; x++)
                    renderer.render_grid_cell(x, y);
        } finally { renderer.ctx = context; }
        const repaintMs = performance.now() - started;
        const expected = reference.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let stalePixels = 0;
        for (let offset = 0; offset < actual.data.length; offset += 4)
            if ([0, 1, 2, 3].some(channel => actual.data[offset + channel] !== expected.data[offset + channel]))
                stalePixels++;
        proof.reference = reference;
        return { label, stalePixels, repaintMs, cols: renderer.cols, rows: renderer.rows,
            frames: proof.frames, position: { ...window.crawl_party.state.members[0].pos } };
    }, label);
    try {
        await page.goto(url);
        await signInTestAccount(page, 'FrameQA' + Date.now().toString().slice(-9), 'crawl');
        await page.locator('#lobby_home [data-lobby-create]').click();
        for (let index = 0; index < 4; index++) {
            const slot = page.locator('.party-slot-box[data-slot="' + index + '"]');
            if (index) await slot.locator('[data-mode="companion"]').click();
            await slot.locator('.party-slot-species').selectOption('Human');
            await slot.locator('.party-slot-job').selectOption('Fighter');
        }
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4);
        await page.waitForFunction(() => document.getElementById('dungeon')?.width > 0);
        await page.evaluate(() => {
            const get = suffix => require(Object.keys(require.s.contexts._.defined)
                .find(name => name.endsWith('/' + suffix)));
            const renderer = get('dungeon_renderer'), options = get('options');
            if (typeof renderer.render_view !== 'function') throw new Error('Updated frame renderer is not loaded');
            const originalGet = options.get;
            options.get = name => ['tile_realtime_anim', 'tile_water_anim', 'tile_misc_anim'].includes(name)
                ? false : originalGet(name);
            const render = renderer.render_view;
            window.frameProof = { renderer, frames: 0, display: get('display') };
            renderer.render_view = function () {
                window.frameProof.frames++;
                return render.apply(this, arguments);
            };
            window.frameProof.display.display();
        });
        await page.mouse.move(1, 1);
        await settle();
        await page.waitForFunction(() => window.frameProof.frames > 0);
        samples.push(await compare('initial'));
        for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', '.', '.',
            'ArrowRight', 'ArrowRight', 'ArrowDown']) {
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press(key);
            await page.waitForTimeout(150);
            await settle();
            samples.push(await compare(key));
        }
        const coalescing = await page.evaluate(() => {
            const proof = window.frameProof, before = proof.frames;
            proof.originalCenter = { ...proof.renderer.view_center };
            proof.renderer.set_view_center(proof.originalCenter.x + 5, proof.originalCenter.y - 3);
            for (let index = 0; index < 20; index++) proof.display.display();
            return { before, immediate: proof.frames };
        });
        assert.equal(coalescing.immediate, coalescing.before, 'Camera cannot paint stale pixels synchronously');
        await settle();
        assert.equal(await page.evaluate(() => window.frameProof.frames), coalescing.before + 1,
            'Twenty refresh requests and a camera change share one paint');
        samples.push(await compare('camera-pan'));
        await page.evaluate(() => {
            const proof = window.frameProof;
            proof.renderer.set_view_center(proof.originalCenter.x, proof.originalCenter.y);
        });
        await settle();
        samples.push(await compare('camera-return'));
        const images = await page.evaluate(() => ({ actual: window.frameProof.renderer.element.toDataURL(),
            reference: window.frameProof.reference.toDataURL() }));
        for (const [name, data] of Object.entries(images))
            fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
        assert(samples.every(sample => sample.stalePixels === 0), JSON.stringify(samples));
        assert(new Set(samples.map(sample => JSON.stringify(sample.position))).size > 1,
            'The native hero must actually move during pixel verification');
        assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(output, 'native-frames.png') });
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ url,
            dpr: Number(process.env.FRAME_DPR || 1), samples, coalescing, errors }, null, 2));
        console.log(JSON.stringify({ passed: true, samples: samples.length, stalePixels: 0, output }));
    } catch (error) {
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ samples, errors }, null, 2));
        await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 5000 }).catch(() => {});
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
