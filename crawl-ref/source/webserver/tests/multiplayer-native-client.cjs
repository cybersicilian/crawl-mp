/* Real native-client probes; fixture changes use the disposable wizard game. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const password = crypto.randomBytes(16).toString('hex');
const suffix = Date.now().toString(36);
const send = (page, msg, data = {}) => page.evaluate(({ msg, data }) =>
    require('comm').send_message(msg, data), { msg, data });
const key = (page, keycode) => send(page, 'key', { keycode });
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party?.state)));
const named = (page, suffix, expression) => page.evaluate(({ suffix, expression }) => {
    const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/' + suffix));
    return Function('module', 'return (' + expression + ')')(require(name));
}, { suffix, expression });
async function capture(page) {
    await page.evaluate(() => {
        window.qaPackets = []; window.qaErrors = []; window.qaInputStarts = 0; window.qaWizardPrompts = 0;
        const comm = require('comm'), original = comm.handle_message;
        comm.handle_message = function (packet) {
            window.qaPackets.push(JSON.parse(JSON.stringify(packet)));
            if (packet.msg === 'init_input') ++window.qaInputStarts;
            if (packet.msg === 'msgs' && packet.messages?.some(message => message.text.includes('Enter Wizard Command')))
                ++window.qaWizardPrompts;
            if (window.qaPackets.length > 400) window.qaPackets.shift();
            if (packet.msg === 'game_action_error') window.qaErrors.push(packet.message);
            return original.apply(this, arguments);
        };
    });
}
async function clientAs(browser, url, username, slot, errors) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('#reg_link').click();
    await page.locator('#reg_username').fill(username);
    await page.locator('#reg_password').fill(password);
    await page.locator('#reg_repeat_password').fill(password);
    await page.locator('#reg_submit').click();
    await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
    await capture(page);
    return { page, username, context, slot, wizard: false };
}
async function client(browser, url, role, errors) {
    return clientAs(browser, url, 'Multi' + role + suffix, role === 'H' ? 0 : 1, errors);
}
async function ready(page) {
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready() && !require('jquery')('#loader').is(':visible');
    });
}
async function waitText(page, text) {
    await page.waitForFunction(text => document.body.innerText.toLowerCase().includes(text.toLowerCase()), text);
}
async function lua(target, code) {
    const page = target.page;
    await ready(page);
    const wizardPrompts = await page.evaluate(() => window.qaWizardPrompts);
    await key(page, 38);
    if (!target.wizard) {
        await waitText(page, 'really want to enter wizard mode');
        await send(page, "text_input", { text: "wiz\r" });
        target.wizard = true;
    }
    await page.waitForFunction(count => window.qaWizardPrompts > count, wizardPrompts);
    const inputs = await page.evaluate(() => window.qaInputStarts);
    await key(page, 20);
    await page.waitForFunction(count => window.qaInputStarts > count, inputs);
    const marker = 'QA_DONE_' + crypto.randomBytes(4).toString('hex');
    await send(page, 'text_input', { text: code + '; crawl.mpr("' + marker + '")\r' });
    await page.waitForFunction(marker => window.qaPackets.some(packet => packet.msg === 'msgs'
        && packet.messages?.some(message => message.text.replace(/<[^>]*>/g, '').trim() === marker)), marker);
    await key(page, 27);
    await ready(page);
    const text = await page.locator('body').innerText();
    assert(!text.includes('Lua error:'), text.slice(-3000));
}
async function waitTurn(target, turns) {
    await target.page.waitForFunction(({ slot, turns }) => window.crawl_party.state.members[slot].turns > turns,
        { slot: target.slot, turns });
    await ready(target.page);
}
async function waitAction(target) {
    const before = await state(target.page);
    await key(target.page, 46);
    await waitTurn(target, before.members[target.slot].turns);
    return { before, after: await state(target.page) };
}
async function resetPackets(...clients) {
    for (const target of clients) await target.page.evaluate(() => { window.qaPackets = []; });
}
async function packets(target) { return target.page.evaluate(() => window.qaPackets); }
async function view(target) {
    return target.page.evaluate(() => {
        const names = Object.keys(require.s.contexts._.defined);
        const mod = suffix => require(names.find(name => name.endsWith('/' + suffix)));
        const center = mod('dungeon_renderer').view_center;
        const own = window.crawl_party.state.members[window.crawl_party.state.controlled_slot];
        return { center: { x: center.x, y: center.y }, slot: window.crawl_party.state.controlled_slot,
            floor: window.crawl_party.state.floor, own: { name: own.name, pos: own.pos, turns: own.turns },
            inventory: own.inventory, input: mod('game').get_input_mode() };
    });
}
module.exports = { assert, chromium, client, clientAs, send, key, state, ready, waitText, lua, waitTurn,
    waitAction, resetPackets, packets, view, capture, named };
