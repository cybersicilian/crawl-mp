/* Browser contract checks for nested tooltips and glossary linking. No server needed. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent(`<!doctype html><html><head><style>
            body { margin: 0; font: 14px sans-serif; }
            #messages { position: absolute; left: 20px; top: 600px; width: 700px; }
            #dcss_rich_tooltip { position: fixed; left: 20px; top: 60px; width: 300px; padding: 10px;
                background: #eee; pointer-events: none; }
            #anchor { position: absolute; left: 20px; top: 20px; width: 120px; height: 30px; background: #ccc; }
            #far { position: absolute; left: 900px; top: 300px; width: 50px; height: 50px; }
            </style></head><body>
            <div id="anchor">anchor</div><div id="far">far</div>
            <div id="messages"><div class="game_message" id="m1"></div></div>
            <div id="dcss_rich_tooltip" style="display:none"></div>
            </body></html>`);
        for (const css of ['static/tabletop/tokens.css', 'static/tabletop/materials.css',
            'static/tabletop/typography.css', 'static/tabletop/properties.css',
            'static/tabletop/tooltip-content.css', 'game_data/static/styles/nested-tips.css'])
            await page.addStyleTag({ path: path.join(root, css) });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.modules = { jquery: window.jQuery };
            window.define = (dependencies, factory) => {
                window.modules[window.moduleName] = factory(...dependencies.map(name => window.modules[name]));
            };
            window.moduleName = './tooltip-glossary';
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        for (const name of ['item-properties', 'tooltip-content']) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, 'static/scripts', name + '.js') });
        }
        await page.evaluate(() => { window.moduleName = './tooltip-glossary'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/tooltip-glossary.js') });
        await page.evaluate(() => { window.moduleName = './persistent-help'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/persistent-help.js') });
        await page.evaluate(() => { window.moduleName = 'tooltip-policy'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/tooltip-policy.js') });
        await page.evaluate(() => { window.moduleName = 'tooltip-layout'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/tooltip-layout.js') });
        await page.evaluate(() => { window.moduleName = './tip-placement'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/tip-placement.js') });
        await page.evaluate(() => { window.moduleName = './nested-tips'; });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/nested-tips.js') });

        // --- Linking ------------------------------------------------------
        const linked = await page.evaluate(() => {
            const nested = window.modules['./nested-tips'];
            const m = document.getElementById('m1');
            m.innerHTML = '<span class="fg2">You are poisoned!</span> Your rF++ holds; you might feel Might. ' +
                'The lurking horror is constricted. <input value="poisoned"> Death\u2019s Door. SInv EV AC';
            nested.linkify(m);
            const again = nested.linkify(m);
            return { terms: [...m.querySelectorAll('.dcss-term')].map(t => [t.textContent, t.dataset.term]),
                again, text: m.textContent, input: m.querySelector('input').value };
        });
        assert.deepEqual(linked.terms, [['poisoned', 'poisoned'], ['rF', 'rF'], ['Might', 'might'],
            ['constricted', 'constricted'], ['Death\u2019s Door', 'deaths-door'], ['SInv', 'see-invisible'],
            ['EV', 'evasion'], ['AC', 'armour-class']]);
        assert.equal(linked.again, 0, 'linkify is idempotent');
        assert.match(linked.text, /rF\+\+ holds; you might feel Might\. The lurking horror/);
        assert.equal(linked.input, 'poisoned');

        // --- Message log term -> nested chain ---------------------------------
        const center = async selector => {
            const box = await page.locator(selector).first().boundingBox();
            assert(box, 'missing ' + selector);
            return [box.x + box.width / 2, box.y + box.height / 2];
        };
        await page.mouse.move(...await center('#m1 .dcss-term[data-term="poisoned"]'));
        await wait(350);
        let cards = await page.$$eval('.dcss-nested-tip', els => els.map(e =>
            [e.dataset.depth, e.querySelector('.dcss-tip-title').textContent]));
        assert.deepEqual(cards, [['0', 'Poisoned']]);
        assert.equal(await page.$eval('.dcss-nested-tip', e => getComputedStyle(e).pointerEvents), 'auto');
        // Poisoned's card links rPois; hovering it nests a second card.
        await page.mouse.move(...await center('.dcss-nested-tip[data-depth="0"] .dcss-term[data-term="rPois"]'));
        await wait(350);
        await page.mouse.move(...await center('.dcss-nested-tip[data-depth="1"] .dcss-term[data-term="poisoned"]'));
        await wait(350);
        cards = await page.$$eval('.dcss-nested-tip', els => els.map(e =>
            [e.dataset.depth, e.querySelector('.dcss-tip-title').textContent]));
        assert.deepEqual(cards, [['0', 'Poisoned'], ['1', 'Poison Resistance (rPois)'], ['2', 'Poisoned']]);
        // Back onto the depth-0 card: deeper cards close after the grace period.
        await page.mouse.move(...await center('.dcss-nested-tip[data-depth="0"] .dcss-tip-title'));
        await wait(500);
        assert.equal(await page.locator('.dcss-nested-tip').count(), 1);
        // Leave everything: all close.
        await page.mouse.move(...await center('#far'));
        await wait(500);
        assert.equal(await page.locator('.dcss-nested-tip').count(), 0);

        // Escape closes immediately.
        await page.mouse.move(...await center('#m1 .dcss-term[data-term="constricted"]'));
        await wait(350);
        assert.equal(await page.locator('.dcss-nested-tip').count(), 1);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.dcss-nested-tip').count(), 0);

        // --- Base tooltip host: lock, enter, nest, release ------------------
        await page.mouse.move(...await center('#anchor'));
        await page.evaluate(() => {
            const nested = window.modules['./nested-tips'];
            const tip = document.getElementById('dcss_rich_tooltip');
            window.hidden_count = 0;
            window.host = nested.host('rich', () => tip, () => {
                window.hidden_count++;
                window.host.hidden();
                tip.style.display = 'none';
            });
            tip.innerHTML = '<div class="dcss-tip-header"><span class="dcss-tip-title">Robe ' +
                '<span class="item-property" data-property="fire" data-tip-title="Fire resistance +" ' +
                'data-tip-body="Resistance to fire.">rF+</span></span></div>' +
                '<div class="dcss-tip-body">Wearing it while confused is unwise.</div>';
            tip.style.display = 'block';
            window.host.shown(document.getElementById('anchor'));
        });
        let state = await page.evaluate(() => ({ locked: window.host.locked,
            bar: !!document.querySelector('#dcss_rich_tooltip .dcss-tip-lockbar'),
            linked: !!document.querySelector('#dcss_rich_tooltip .dcss-term[data-term="confused"]') }));
        assert.deepEqual(state, { locked: true, bar: false, linked: true });
        // Re-rendering for the same anchor (live refresh) keeps the lock progress.
        await wait(400);
        await page.evaluate(() => window.host.shown(document.getElementById('anchor')));
        await wait(450);
        state = await page.evaluate(() => ({ locked: window.host.locked,
            cls: document.getElementById('dcss_rich_tooltip').className,
            pe: getComputedStyle(document.getElementById('dcss_rich_tooltip')).pointerEvents }));
        assert.deepEqual(state, { locked: true, cls: 'is-locked', pe: 'auto' });

        await page.mouse.move(...await center('#dcss_rich_tooltip .dcss-term[data-term="confused"]'), { steps: 6 });
        await wait(350);
        cards = await page.$$eval('.dcss-nested-tip', els => els.map(e => e.querySelector('.dcss-tip-title').textContent));
        assert.deepEqual(cards, ['Confused']);
        // A property badge inside the tooltip nests with its glossary text.
        await page.mouse.move(...await center('#dcss_rich_tooltip .item-property'), { steps: 4 });
        await wait(400);
        const badge = await page.$$eval('.dcss-nested-tip', els => els.map(e =>
            [e.querySelector('.dcss-tip-title').textContent, e.querySelector('.dcss-tip-body').textContent]));
        assert.deepEqual(badge.map(b => b[0]), ['Fire resistance +']);
        assert.match(badge[0][1], /rF\+\+\+/);
        assert.equal(await page.evaluate(() => window.hidden_count), 0, 'host stays while pointer is inside');
        // Leaving the chain hides the host and its cards after the grace period.
        await page.mouse.move(...await center('#far'), { steps: 3 });
        await wait(500);
        assert.equal(await page.evaluate(() => window.hidden_count), 1);
        assert.equal(await page.locator('.dcss-nested-tip').count(), 0);

        // Plain text also offers an immediate persistent detail path.
        await page.evaluate(() => {
            const tip = document.getElementById('dcss_rich_tooltip');
            tip.innerHTML = '<div class="dcss-tip-body">Plain text only.</div>';
            tip.style.display = 'block';
            window.host.shown(document.getElementById('far'));
        });
        await wait(900);
        assert.equal(await page.evaluate(() => window.host.locked), true);
        assert.equal(await page.locator('#dcss_rich_tooltip .dcss-tip-lockbar').count(), 0);

        await page.locator('#dcss_rich_tooltip .workflow-help-open').click();
        await page.locator('#workflow_help_dialog[open]').waitFor();
        assert((await page.locator('#workflow_help_dialog').innerText()).includes('Plain text only.'));
        await page.keyboard.press('Escape');
        await page.locator('#workflow_help_dialog').waitFor({ state: 'detached' });
        assert.deepEqual(errors, []);
        console.log('nested tooltip checks passed');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
