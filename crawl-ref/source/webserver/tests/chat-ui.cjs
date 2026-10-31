/* Isolated browser contract test. No server connection or outgoing chat. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = process.env.CHAT_PROOF_DIR || '/tmp/dcss-chat-proof';
fs.mkdirSync(output, { recursive: true });

async function load(page, name, filename) {
    await page.evaluate(name => { window.qaModuleName = name; }, name);
    await page.addScriptTag({ path: path.join(root, filename) });
}

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await require('./helpers/ui-sprite-fixture.cjs').install(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent(`<!doctype html><html><head></head><body style="background:#0e1714">
            <button id="dock_chat_btn">Chat</button><div id="chat_hidden"><a href="#">+</a></div>
            <div id="chat" style="display:none"><a id="chat_hide_button" href="#"><span id="chat_hide_button_span">×</span></a>
            <a id="chat_caption" href="#"><span id="spectator_count">0 spectators</span><span id="message_count"></span></a>
            <div id="chat_body" style="display:none"><span id="spectator_list"></span><div id="chat_history_container"><span id="chat_history"></span></div>
            <div class="chat-compose"><input id="chat_input" type="text"><button id="chat_send_btn" type="button">Send</button></div>
            <div id="chat_login_text" style="display:none">Log in to chat</div></div></div></body></html>`);
        await page.addStyleTag({ path: path.join(root, 'static/tabletop/tokens.css') });
        await page.addStyleTag({ path: path.join(root, 'static/tabletop/typography.css') });
        await page.addStyleTag({ path: path.join(root, 'static/tabletop/chat.css') });
        await page.addStyleTag({ path: path.join(root, 'static/tabletop/properties.css') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/ba-linkify.min.js') });
        await page.evaluate(() => {
            window.qaMessages = [];
            window.qaHandlers = {};
            window.qaModules = { jquery: window.jQuery, 'contrib/ba-linkify.min': {}, comm: {
                send_message(name, payload) { window.qaMessages.push({ name, payload }); },
                register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }
            } };
            window.define = (deps, factory) => { window.qaModules[window.qaModuleName] = factory(...deps.map(name => window.qaModules[name])); };
            window.qaReceive = data => window.qaHandlers.chat(data);
        });
        await require('./helpers/rich-text-fixture.cjs').install(page);
        await load(page, 'linkify', 'static/scripts/linkify.js');
        await load(page, 'item-properties', 'static/scripts/item-properties.js');
        await load(page, 'chat-items', 'static/scripts/chat-items.js');
        await load(page, 'scrollback', 'static/scripts/scrollback.js');
        await load(page, 'chat', 'static/scripts/chat.js');
        await page.locator('#chat_tag_btn').waitFor({ state: 'attached' });
        // Match client.receive_game_client: loading a native game removes every
        // document-level jQuery listener, while the persistent chat DOM remains.
        await page.evaluate(() => window.jQuery(document).off());

        await page.evaluate(() => {
            window.qaItem = { id: 'inventory:a', name: 'war axe', description: 'A broad-bladed axe.\nKnown description supplied by the game.', source: 'Inventory' };
            window.qaArga = { id: 'inventory:c', name: 'Arga {speed, MR+}', description: 'Native item-description fixture.', source: 'Inventory' };
            window.jQuery(document).trigger('chat_items_changed', [[window.qaItem, window.qaArga, { id: 'inventory:b', name: 'potion of curing', description: 'A known potion.', source: 'Inventory' }]]);
            window.qaReceive({ sender: 'Lyra', text: 'Could you use this [item:WAR   AXE]? <img src=x onerror=alert(1)> https://example.com', tags: [window.qaItem] });
        });
        assert((await page.locator('#message_count').innerText()).startsWith('1 new message'));
        await page.evaluate(() => window.qaModules.chat.focus());
        assert(await page.locator('#chat_input').evaluate(node => node === document.activeElement));
        assert.equal(await page.locator('.chat-item-chip').count(), 1, 'Whitespace and case variants match canonical item metadata');
        const sharedGlyph = page.locator('.chat-item-chip .chat-item-glyph .tt-icon');
        assert.equal(await sharedGlyph.getAttribute('data-ui-icon'), 'inventory');
        assert(await sharedGlyph.evaluate(async node => {
            const style = getComputedStyle(node), image = new Image(); image.src = node.querySelector('image').href.baseVal;
            await image.decode(); return style.width === '16px' && style.height === '16px' && image.naturalWidth > 16;
        }), 'Chat item fallbacks reuse the loaded native16 sprite family');
        assert.equal(await page.locator('#chat_history img').count(), 0, 'Message text never creates arbitrary HTML');
        assert.equal(await page.locator('#chat_history a').getAttribute('rel'), 'noopener noreferrer');
        await page.locator('.chat-item-chip').focus();
        await page.locator('#chat_item_tooltip').waitFor({ state: 'visible' });
        assert((await page.locator('#chat_item_tooltip').innerText()).includes('Known description supplied by the game.'));
        assert((await page.locator('#chat_item_tooltip').innerText()).includes('Shared by Lyra'));
        assert.equal(await page.locator('.chat-item-chip').getAttribute('aria-describedby'), 'chat_item_tooltip');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#chat_item_tooltip').isVisible(), false);

        await page.locator('#chat_tag_btn').click();
        await page.evaluate(() => {
            window.qaLeakedKeys = [];
            document.addEventListener('keydown', event => window.qaLeakedKeys.push(event.key));
            document.addEventListener('keypress', event => window.qaLeakedKeys.push(event.key));
        });
        await page.locator('#chat_item_search').fill('war');
        await page.locator('#chat_item_search').press('a');
        await page.locator('#chat_item_search').press('Backspace');
        assert.equal(await page.locator('.chat-item-choice').count(), 1);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.qaLeakedKeys), [], 'Chat search and item buttons cannot send game commands');
        assert.equal(await page.locator('#chat_input').inputValue(), '[item:war axe] ');
        await page.locator('#chat_send_btn').click();
        const sent = await page.evaluate(() => window.qaMessages);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].name, 'chat_msg');
        assert.equal(sent[0].payload.tags[0].description, 'A broad-bladed axe.\nKnown description supplied by the game.');
        assert.equal(await page.locator('#chat_input').inputValue(), '');
        await page.locator('#chat_input').fill('Unsent plan');
        await page.keyboard.press('ArrowUp');
        assert.equal(await page.locator('#chat_input').inputValue(), '[item:war axe] ');
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.locator('#chat_input').inputValue(), 'Unsent plan', 'History preserves the unsent draft');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.qaMessages[1].payload.tags[0].name), 'war axe', 'History preserves item snapshots');

        await page.evaluate(() => {
            window.qaReceive({ content: '<script>throw new Error("unsafe")</script><span class="chat_sender" onclick="alert(1)">Server</span>: <span class="chat_msg"><img src=x onerror=alert(1)>A safe legacy notification</span>', meta: true });
            window.qaReceive({ sender: '<img src=x onerror=alert(1)>', text: '[item:dangerous item]', tags: [{ name: 'dangerous item', description: '<script>bad()</script>', icon: 'javascript:alert(1)' }] });
        });
        assert.equal(await page.locator('#chat_history [onclick], #chat_history script, #chat_history img').count(), 0);
        await page.locator('.chat-item-chip').last().focus();
        assert((await page.locator('#chat_item_tooltip').innerText()).includes('<script>bad()</script>'));
        assert.equal(await page.locator('#chat_item_tooltip script, #chat_item_tooltip img').count(), 0);
        await page.evaluate(() => {
            window.jQuery('#chat_history').empty();
            window.qaReceive({ sender: 'Lyra', text: 'Found a [item:war axe] by the stairs. Anyone need it?', tags: [window.qaItem] });
            window.qaReceive({ sender: 'Marek', text: 'I can use it. Let’s regroup before the next floor.', tags: [] });
        });
        await page.locator('#chat_input').focus();
        await page.evaluate(() => {
            for (let i = 0; i < 60; i++) window.qaReceive({ sender: 'Reader', text: 'History line ' + i });
            document.getElementById('chat_history_container').scrollTop = 150;
        });
        const readingPosition = await page.locator('#chat_history_container').evaluate(node => node.scrollTop);
        await page.evaluate(() => window.qaReceive({ sender: 'Reader', text: 'A new turn arrived' }));
        assert.equal(await page.locator('#chat_history_container').evaluate(node => node.scrollTop), readingPosition);
        await page.locator('#chat_input').press('Escape');
        await page.evaluate(() => window.qaReceive({ sender: 'Reader', text: 'Arrived while chat was closed' }));
        await page.evaluate(() => window.qaModules.chat.focus());
        assert.equal(await page.locator('#chat_history_container').evaluate(node => node.scrollTop), readingPosition,
            'Closing and reopening chat preserves scrollback even with new messages');
        await page.locator('#chat_history_container').focus();
        await page.keyboard.press('PageUp');
        assert.deepEqual(await page.evaluate(() => window.qaLeakedKeys), []);
        await page.evaluate(() => {
            window.jQuery('#chat_history').empty();
            window.qaReceive({ sender: 'Lyra', text: 'Found a [item:war axe] by the stairs. Anyone need it?', tags: [window.qaItem] });
            window.qaReceive({ sender: 'Marek', text: 'I can use it. Let’s regroup before the next floor.', tags: [] });
        });
        await page.locator('#chat_input').focus();
        await page.screenshot({ path: path.join(output, 'chat-1280x800.png') });
        await page.locator('.chat-item-chip').hover();
        await page.locator('#chat_item_tooltip').hover();
        await page.waitForTimeout(180);
        assert(await page.locator('#chat_item_tooltip').isVisible(), 'Hover cards stay open while the pointer enters their readable contents');
        await page.screenshot({ path: path.join(output, 'chat-item-hover-1280x800.png') });
        await page.mouse.move(5, 5);

        await page.evaluate(() => window.qaReceive({ sender: 'Lyra', text: '[item:Arga {speed, MR+}]', tags: [window.qaArga] }));
        const argaChip = page.locator('.chat-item-chip').filter({ hasText: 'Arga' });
        assert(!(await argaChip.innerText()).includes('{'), 'Received item tags render property badges instead of brace inscriptions');
        assert.equal(await argaChip.locator('[data-property="brand-speed"] svg').count(), 1);
        assert.equal(await argaChip.locator('[data-property="will"]').getAttribute('data-property-value'), '+');
        assert.equal(await argaChip.getAttribute('aria-label'), 'Arga {speed, MR+}, show item details', 'Wire names remain available to assistive technology');
        assert.equal(await argaChip.locator('[tabindex]').count(), 0, 'Property badges do not add nested tab stops inside item buttons');
        await argaChip.focus();
        assert(!(await page.locator('.chat-tooltip-title').innerText()).includes('{'));
        assert.equal(await page.locator('.chat-tooltip-title [data-property="will"] svg').count(), 1);
        await page.screenshot({ path: path.join(output, 'chat-arga-properties-1280x800.png') });
        await page.locator('#chat_tag_btn').click();
        await page.locator('#chat_item_search').fill('Arga');
        const argaChoice = page.locator('.chat-item-choice').filter({ hasText: 'Arga' });
        assert(!(await argaChoice.innerText()).includes('{'));
        assert.equal(await argaChoice.locator('[data-property="brand-speed"] svg').count(), 1);
        await argaChoice.click();
        assert.equal(await page.locator('#chat_input').inputValue(), '[item:Arga {speed, MR+}] ', 'Decorated display never changes the canonical wire token');
        await page.locator('#chat_input').fill('');

        await page.locator('#chat_input').press('Escape');
        assert.equal(await page.locator('#chat').isVisible(), false, 'Escape returns to the game');
        await page.evaluate(() => window.qaReceive({ sender: 'Lyra', text: 'Next room?', tags: [] }));
        assert((await page.locator('#message_count').innerText()).startsWith('1 new message'));
        await page.evaluate(() => window.qaModules.chat.focus());
        await page.locator('#chat_input').press('F12');
        assert.equal(await page.locator('#chat').isVisible(), false, 'F12 also returns to the game');
        await page.evaluate(() => window.qaModules.chat.focus());
        await page.setViewportSize({ width: 390, height: 680 });
        await page.locator('#chat_tag_btn').click();
        const bounds = await page.locator('#chat').boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Chat fits a compact viewport');
        await page.screenshot({ path: path.join(output, 'chat-390x680.png') });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#chat_item_picker').isVisible(), false);
        assert(await page.locator('#chat_input').evaluate(node => node === document.activeElement));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ success: true, interceptedMessages: await page.evaluate(() => window.qaMessages.length), output }));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
