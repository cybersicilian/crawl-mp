/* Clipboard success, denied/unavailable access and keyboard isolation in a dialog. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('https://share.test/**', route => route.fulfill({ contentType: 'text/html',
            body: '<!doctype html><dialog><div id="controls"></div></dialog>' }));
        await page.goto('https://share.test/?view=game#expedition-example');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.addStyleTag({ path: path.join(root, 'static/tabletop/share-link.css') });
        await page.evaluate(() => {
            window.define = (deps, factory) => { window.shareLink = factory(window.jQuery); };
            window.leakedKeys = []; window.leakedClicks = 0;
            window.jQuery(document).on('keydown keypress keyup', event => window.leakedKeys.push(event.key))
                .on('click', () => window.leakedClicks++);
            document.querySelector('dialog').showModal();
        });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/share-link.js') });
        const expected = 'https://share.test/randarts/93ef1a44-d39f-42ad-85fb-62e71fd98889';
        const setup = mode => page.evaluate(mode => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'unavailable' ? undefined : {
                writeText(url) {
                    if (mode === 'throw') throw new Error('Blocked');
                    if (mode === 'denied') return Promise.reject(new Error('Denied'));
                    window.copiedURL = url; return Promise.resolve();
                }
            } });
            window.jQuery('#controls').empty().append(window.shareLink.controls(
                '/randarts/93ef1a44-d39f-42ad-85fb-62e71fd98889', 'The axe of <Sharing>'));
            window.leakedKeys = []; window.leakedClicks = 0;
        }, mode);
        for (const activation of ['click', 'Enter', 'Space']) {
            await setup('success');
            const button = page.getByRole('button', { name: 'Copy link to The axe of <Sharing>' });
            if (activation === 'click') await button.click();
            else { await button.focus(); await page.keyboard.press(activation); }
            await page.getByRole('status').filter({ hasText: 'Link copied. Ready to paste.' }).waitFor();
            assert.equal(await page.evaluate(() => window.copiedURL), expected);
            assert.deepEqual(await page.evaluate(() => window.leakedKeys), []);
            assert.equal(await page.evaluate(() => window.leakedClicks), 0);
            assert(await page.locator('dialog').evaluate(node => node.open));
            assert.equal(new URL(page.url()).hash, '#expedition-example');
        }
        for (const mode of ['denied', 'unavailable', 'throw']) {
            await setup(mode);
            await page.getByRole('button', { name: /^Copy link to/ }).click();
            const field = page.getByRole('textbox', { name: 'Link to The axe of <Sharing>' });
            await field.waitFor();
            assert.equal(await field.inputValue(), expected);
            assert.deepEqual(await field.evaluate(node => [node.selectionStart, node.selectionEnd, node === document.activeElement]),
                [0, expected.length, true]);
            await page.keyboard.press('Control+c');
            await page.keyboard.press('Enter');
            assert.deepEqual(await page.evaluate(() => window.leakedKeys), []);
            assert.equal(await page.evaluate(() => window.leakedClicks), 0);
            // Retrying after permission changes removes the manual field.
            await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
                value: { writeText: () => Promise.resolve() } }));
            await page.getByRole('button', { name: /^Copy link to/ }).click();
            await field.waitFor({ state: 'detached' });
        }
        assert.deepEqual(errors, []);
        console.log('Share link: absolute URL, pointer/keyboard copy, denied/missing clipboard, retry, focus and input isolation passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
