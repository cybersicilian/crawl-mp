/* No-op .text() and .hide() calls leave the DOM alone; real changes still happen. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const page = await browser.newPage();
        await page.setContent('<!doctype html><div id="value">1</div><div id="rich"><b>bold</b> tail</div>'
            + '<div id="empty"></div><div id="clear">gone</div><p class="pair">a</p><p class="pair">b</p>'
            + '<i id="shown">x</i><i id="hidden" style="display: none">y</i><i id="stale" style="display: none">z</i>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => { window.define = (deps, factory) => factory(window.jQuery); });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/quiet-jquery.js') });
        const result = await page.evaluate(async () => {
            const $ = window.jQuery, value = document.getElementById('value'), node = value.firstChild;
            const records = [];
            const observer = new MutationObserver(list => records.push(...list));
            observer.observe(value, { childList: true, characterData: true, subtree: true });
            $(value).text('1');
            await Promise.resolve();
            const unchanged = records.length;
            $(value).text('2').text(3);
            await Promise.resolve();
            observer.disconnect();
            $('#rich').text('plain');
            $('#empty').text('');
            $('#clear').text('');
            $('.pair').text('same');
            return { unchanged, kinds: records.map(record => record.type), keptNode: value.firstChild === node, read: $(value).text(),
                rich: document.getElementById('rich').innerHTML, empty: document.getElementById('empty').childNodes.length,
                clear: document.getElementById('clear').textContent, pair: $('.pair').toArray().map(element => element.textContent),
                computed: $('#value').text(function () { return 'computed'; }).text(), nothing: $('#missing').text('x').length,
                ...(() => {
                    const reads = [], read = window.getComputedStyle;
                    window.getComputedStyle = (...args) => { reads.push(args[0].id); return read.apply(window, args); };
                    $('#hidden').hide();
                    const quietReads = reads.length;
                    $('#shown, #stale').hide();
                    $('#stale').toggle(false);
                    window.getComputedStyle = read;
                    return { quietReads, shownDisplay: document.getElementById('shown').style.display,
                        restored: $('#shown').show()[0].style.display, chained: $('#hidden').hide().attr('id'),
                        animated: typeof $('#hidden').hide(0).promise };
                })() };
        });
        assert.equal(result.unchanged, 0, 'The same text must not touch the DOM');
        assert.deepEqual([...new Set(result.kinds)], ['characterData'], 'Changed text must edit the existing node');
        assert.equal(result.keptNode, true);
        assert.equal(result.read, '3', 'Numbers and the getter keep working');
        assert.equal(result.rich, 'plain', 'Element children are still replaced');
        assert.equal(result.empty, 0);
        assert.equal(result.clear, '', 'Clearing removes the old text');
        assert.deepEqual(result.pair, ['same', 'same'], 'Every element in a set updates');
        assert.equal(result.computed, 'computed', 'The function form stays with jQuery');
        assert.equal(result.nothing, 0);
        assert.equal(result.quietReads, 0, 'Hiding hidden elements must not read computed style');
        assert.equal(result.shownDisplay, 'none', 'A mixed set still hides its visible elements');
        assert.equal(result.restored, 'inline', 'show() still restores what hide() remembered');
        assert.equal(result.chained, 'hidden', 'hide() stays chainable');
        assert.equal(result.animated, 'function', 'Arguments stay with jQuery');
        console.log('In-place text, quiet hide, structural replacement, sets and jQuery fallbacks passed.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
