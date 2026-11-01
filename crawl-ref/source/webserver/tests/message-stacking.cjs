/* Combat log contract: repeated lines within a turn stack into one counted entry. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><body><div id="normal"><div id="message_pane">'
            + '<div id="messages_container"><div id="messages"></div></div><div id="more"></div></div></div></body>');
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.handlers = {};
            const modules = { jquery: window.jQuery, client: {},
                comm: { register_handlers(handlers) { Object.assign(window.handlers, handlers); } },
                './textinput': { input_active: () => false }, './util': { formatted_string_to_html: text => text },
                './options': { add_listener() {} }, './nested-tips': { linkify() {} }, './message-references': {},
                scrollback: { capture: () => null, restore() {} },
                './inspection-dialog': { showContent(title, body) { window.history_lines = [...body.children].map(p => p.textContent); } },
                './party-model': { colours: [] } };
            window.define = (deps, factory) => { window.messages = factory(...deps.map(name => modules[name])); };
        });
        await page.addScriptTag({ path: path.join(root, 'game_data/static/messages.js') });
        const send = msg => page.evaluate(msg => window.handlers.msgs(msg), msg);
        const entries = () => page.evaluate(() => [...document.querySelectorAll('#messages .game_message')].map(node => ({
            text: node.textContent.trim(), turnStart: node.classList.contains('is-turn-start') })));
        const line = (text, turn, extra) => ({ text, turn, channel: 0, ...extra });

        // Separate commands in one turn each send the same line.
        for (let i = 0; i < 4; ++i) {
            await send({ messages: [line('No target in view!', 130)] });
            await page.evaluate(() => window.messages.new_command(false));
        }
        await send({ messages: [line('No target in view!', 130)] });
        assert.deepEqual(await entries(), [{ text: '_No target in view! ×5', turnStart: true }]);
        assert.equal(await page.locator('.msg-repeat-count').getAttribute('aria-label'), 'repeated 5 times');

        // The engine's own " xN" folding adds to the count instead of breaking the stack.
        await send({ messages: [line('No target in view! x3', 130)] });
        assert.equal((await entries())[0].text, '_No target in view! ×8');

        // Rollback gives back one sent line at a time, then the entry itself.
        await send({ rollback: 1 });
        assert.equal((await entries())[0].text, '_No target in view! ×5');
        await send({ rollback: 4 });
        assert.deepEqual(await entries(), [{ text: '_No target in view!', turnStart: true }]);
        assert.equal(await page.locator('.msg-repeats').count(), 0, 'A single line shows no counter');

        // A different line, a new turn, another hero, or a prompt each start a fresh entry.
        await send({ messages: [line('No target in view!', 130),
            line('You hear a distant roar.', 130),
            line('You hear a distant roar.', 131),
            line('You hear a distant roar.', 131, { recipient: 1 }),
            line('Really attack?', 131, { channel: 2 }), line('Really attack?', 131, { channel: 2 })] });
        assert.deepEqual((await entries()).map(entry => entry.text), [
            '_No target in view! ×2', 'You hear a distant roar.', 'You hear a distant roar.',
            'You hear a distant roar.', 'Really attack?', 'Really attack?']);
        assert.deepEqual((await entries()).map(entry => entry.turnStart), [true, false, true, false, false, false]);

        // A lone engine-folded line still reads as a counted entry.
        await send({ messages: [line('The rat misses you. x2', 132)] });
        assert.equal((await entries()).at(-1).text, 'The rat misses you. ×2');

        await page.evaluate(() => window.jQuery(document).trigger('game_message_history'));
        assert.equal(await page.evaluate(() => window.history_lines[0]), '_No target in view! ×2', 'History copies the count');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, messageStacking: true }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
