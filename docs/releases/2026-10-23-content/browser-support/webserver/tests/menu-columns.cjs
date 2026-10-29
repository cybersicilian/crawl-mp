/* Native field layouts, responsive geometry and safe Markdown contracts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.MENU_COLUMNS_PROOF_DIR || '/tmp/dcss-menu-columns-proof';
const padded = (value, width) => value.padEnd(width);

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><main id="game"><div id="ui-stack"><section class="menu workflow-surface">'
            + '<div class="menu_title"></div><div class="menu_contents"><ol></ol></div></section></div></main><aside id="description"></aside>');
        for (const file of ['game_data/static/styles/game-menus.css', 'static/tabletop/tokens.css',
            'game_data/static/styles/gameplay-workflows.css', 'game_data/static/styles/menu-surfaces.css',
            'game_data/static/styles/menu-columns.css']) await page.addStyleTag({ path: path.join(root, file) });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery };
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(name => window.modules[name])); };
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const name of ['util', 'menu-columns']) {
            await page.evaluate(name => { window.moduleName = './' + name; }, name);
            await page.addScriptTag({ path: path.join(root, 'game_data/static', name + '.js') });
        }
        const render = async (title, text, tag = 'spell') => page.evaluate(({ title, text, tag }) => {
            const $ = window.jQuery, element = $('#ui-stack .menu');
            element.find('ol').html('<li class="selectable" tabindex="0"><canvas width="32" height="32"></canvas><kbd class="workflow-key">a</kbd></li>');
            const entry = { level: 2, text, elem: element.find('li') };
            window.testMenu = { title: { text: title }, tag, elem: element, items: [entry] };
            window.modules['./menu-columns'].title(window.testMenu);
        }, { title, text, tag });
        const title = '<w>Spells (Memorise)                   Type                      Failure  Level';
        const spell = ' a - <lightgrey>' + padded("Eringya's Surprising Crocodile", 32)
            + padded('Summoning', 26) + '</lightgrey><magenta>' + padded('100%', 9) + '</magenta>4';
        await render(title, spell);
        assert.equal(await page.locator('.menu_title').innerText(), 'Spells (Memorise)');
        assert.deepEqual(await page.locator('.workflow-table-head').locator('span').allTextContents(), ['', 'Spell', 'Type', 'Failure', 'Level', '']);
        assert.equal(await page.locator('.workflow-table-name').innerText(), "Eringya's Surprising Crocodile");
        assert.equal(await page.locator('.workflow-table-stats .fg5').innerText(), '100%', 'Failure colour survives field slicing');
        assert.equal(await page.locator('kbd').count(), 1);
        assert(!(await page.locator('li').innerText()).includes('a -'), 'No duplicate shortcut prefix');
        for (const width of [1280, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            assert(await page.locator('.menu').evaluate(node => node.scrollWidth <= node.clientWidth), 'Columns fit at ' + width);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page fits at ' + width);
            assert.equal(await page.locator('.workflow-table-head').isVisible(), width > 700);
            assert(await page.locator('.workflow-table-stats').innerText().then(text => text.includes('100%') && text.includes('4')));
            if (width > 700) assert(await page.evaluate(() => {
                const header = document.querySelectorAll('.workflow-table-head > span');
                const cells = document.querySelectorAll('.workflow-table-cell');
                return Array.from(cells).every((cell, index) => Math.abs(cell.getBoundingClientRect().left
                    - header[index + 1].getBoundingClientRect().left) <= 1);
            }), 'Headers align at ' + width);
            await page.locator('.menu').screenshot({ path: path.join(output, 'spell-' + width + '.png') });
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        await render(title, '     <darkgrey>' + padded('Unavailable spell', 32) + padded('Fire/Alchemy', 26)
            + padded('99% (80%)', 13) + '8</darkgrey>');
        assert.equal(await page.locator('.workflow-table-stats').innerText().then(text => text.replace(/\s+/g, ' ')),
            'Type: Fire/Alchemy Failure: 99% (80%) Level: 8');
        await render('Spells (Cast)                   Type                               Level',
            ' a - ' + padded('Divine spell', 32) + padded('Air', 26) + '         3');
        assert.match(await page.locator('.workflow-table-stats').innerText(), /—/);
        await render('Your spells (cast)                  Power     Damage    Range   Noise',
            ' a - ' + padded('Blink', 32) + padded('12%', 10) + padded('N/A', 10) + padded('@-->..', 8) + 'Quiet');
        assert.deepEqual(await page.locator('.workflow-table-stats .workflow-table-cell').allTextContents(),
            ['Power: 12%', 'Damage: N/A', 'Range: @-->..', 'Noise: Quiet']);
        await render('Ability - do what?                  Cost                            Failure',
            ' a - ' + padded('Berserk', 32) + padded('Hunger', 32) + '0%', 'ability');
        assert.deepEqual(await page.locator('.workflow-table-stats .workflow-table-cell').allTextContents(), ['Cost: Hunger', 'Failure: 0%']);
        await page.locator('li').focus();
        await page.evaluate(() => {
            window.testMenu.title.text = 'Ability - describe what?            Cost                            Failure';
            window.modules['./menu-columns'].title(window.testMenu);
        });
        assert(await page.locator('li').evaluate(node => node === document.activeElement), 'Mode updates preserve focus');
        await render(title, ' a - Unfamiliar short layout');
        assert.equal(await page.locator('.workflow-table-row').count(), 0, 'Unknown fields keep their native content');

        const markdown = '# Spell notes\n\n<yellow>**Strong** and *emphasized* text</yellow> with `code`.\n\n'
            + '- First effect\n- Second effect\n\n> A quotation\n\n'
            + '| School | Level |\n| :--- | ---: |\n| Fire | 3 |\n\n'
            + '[Manual](https://example.com/manual) [Unsafe](javascript:alert%281%29)\n\n'
            + '```html\n<yellow><img src=x onerror=alert(1)>\n```\n\n'
            + '<script>window.compromised=true</script>\n\n<img src=x onerror=alert(1)>\n\n'
            + '<svg onload=alert(1)>\n\n![Remote image](https://example.com/tracker.png)';
        await page.evaluate(text => {
            document.getElementById('description').innerHTML = window.modules['rich-text'].render(text,
                { colours: window.modules['./util'].colours });
        }, markdown);
        const prose = page.locator('#description');
        assert.equal(await prose.locator('h1').innerText(), 'Spell notes');
        assert.equal(await prose.locator('strong .fg14').innerText(), 'Strong');
        assert.equal(await prose.locator('em .fg14').innerText(), 'emphasized');
        assert.equal(await prose.locator('ul li').count(), 2);
        assert.equal(await prose.locator('blockquote').count(), 1);
        assert.equal(await prose.locator('table th').count(), 2);
        assert.equal(await prose.locator('th').last().evaluate(node => getComputedStyle(node).textAlign), 'right');
        assert.equal(await prose.locator('a').count(), 1, 'Unsafe links render as text');
        assert.equal(await prose.locator('a').getAttribute('rel'), 'noopener noreferrer');
        assert.equal(await prose.locator('img, script, svg, iframe, [onerror], [onload]').count(), 0);
        assert.match(await prose.locator('pre code').innerText(), /<yellow><img src=x/);
        assert.equal(await page.evaluate(() => window.compromised), undefined);
        await prose.screenshot({ path: path.join(output, 'markdown.png') });
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, widths: [1280, 768, 390, 320], layouts: 3,
            focusRetained: true, coloursRetained: true, safeMarkdown: true }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
