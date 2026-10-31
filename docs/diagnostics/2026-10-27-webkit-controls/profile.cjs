/* Native controls and auto-explore profiling in the existing disposable campaign. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { assert, send, ready, state } = require('../../../crawl-ref/source/webserver/tests/multiplayer-native-client.cjs');
const account = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../2026-10-27-multiplayer-performance/deploy/public/private-accounts.json'), 'utf8'));
const engine = process.env.PROFILE_ENGINE || 'webkit';
const url = 'https://dcss.iancaltabiano.com';
const output = path.join(__dirname, engine + '-baseline');
const proof = { engine, passed: false, errors: [], scenarios: [] };
let browser, page, saved = true;

async function save() {
    if (!page || !await page.evaluate(() => require('client').in_game()).catch(() => false)) return;
    await page.bringToFront(); await ready(page);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#dock_session_menu').click();
    await page.locator('#session_menu [data-session-save="quit"]').click();
    await page.waitForFunction(() => !require('client').in_game());
    const record = await (await page.request.get(url + '/api/library/games/' + account.gameId)).json();
    assert(record.loadable && record.status === 'saved'); saved = true;
}

(async () => {
    browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
        ...(engine === 'webkit' ? {} : { channel: 'chrome' }) });
    page = await browser.newPage({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => proof.errors.push(error.message));
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof require === 'function' && require.defined('client'));
        await page.locator('#username').fill(account.host);
        await page.locator('#password').fill(account.password);
        await page.locator('#login_form').evaluate(form => form.requestSubmit());
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        await send(page, 'library_load', { id: account.gameId }); saved = false;
        await page.bringToFront();
        await page.waitForFunction(() => window.crawl_party?.state?.multiplayer === true
            && window.crawl_party.state.controlled_slot === 0);
        await ready(page);
        await page.evaluate(() => {
            const modules = require.s.contexts._.defined;
            const named = suffix => require(Object.keys(modules).find(name => name.endsWith('/' + suffix)));
            const comm = require('comm'), original = comm.handle_message;
            const renderer = named('dungeon_renderer'), render = renderer.render_view;
            const stats = window.controlProfile = { handlers: {}, renders: [], raf: [], sends: [],
                keys: [], changes: [], callbackWork: [], lastFrame: null };
            let pending;
            comm.handle_message = function (message) {
                const start = performance.now(), result = original(message);
                (stats.handlers[message.msg] ||= []).push(performance.now() - start);
                return result;
            };
            renderer.render_view = function () {
                const start = performance.now(), result = render.apply(this, arguments);
                stats.renders.push({ ms: performance.now() - start, at: performance.now(),
                    ...this.last_paint, cols: this.cols, rows: this.rows });
                return result;
            };
            comm.register_send_listener(msg => {
                if (['key', 'input', 'text_input', 'click_cell'].includes(msg)) stats.sends.push({ msg, at: performance.now() });
            });
            document.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'h', 'j', 'k', 'l', '.', 'o'].includes(event.key)) return;
                pending = { key: event.key, start: performance.now(), turns: window.crawl_party.state.members[0].turns };
                stats.keys.push(pending);
            }, true);
            require('jquery')(document).on('party_state_rendered.controlProfile', function () {
                const hero = window.crawl_party.state.members[0];
                stats.changes.push({ at: performance.now(), turns: hero.turns, activity: hero.activity, pos: hero.pos });
                if (pending && hero.turns > pending.turns) {
                    pending.handled = performance.now() - pending.start;
                    const entry = pending; pending = null;
                    requestAnimationFrame(() => entry.nextFrame = performance.now() - entry.start);
                }
            });
            const raf = window.requestAnimationFrame;
            window.requestAnimationFrame = function (callback) {
                return raf.call(window, function (time) {
                    const start = performance.now(); callback(time);
                    stats.callbackWork.push(performance.now() - start);
                });
            };
            function frame(time) {
                if (stats.lastFrame !== null) stats.raf.push(time - stats.lastFrame);
                stats.lastFrame = time;
                stats.frame = raf.call(window, frame);
            }
            stats.frame = raf.call(window, frame);
            stats.environment = { dpr: devicePixelRatio, userAgent: navigator.userAgent,
                canvas: { width: renderer.element.width, height: renderer.element.height },
                presentation: document.documentElement.dataset.visualPresentation,
                graphics: localStorage.getItem('dcss_visual_presentation') };
        });
        const direction = await page.evaluate(() => {
            const modules = require.s.contexts._.defined;
            const named = suffix => require(Object.keys(modules).find(name => name.endsWith('/' + suffix)));
            const map = named('map_knowledge'), enums = named('enums'), state = window.crawl_party.state;
            const own = state.members[0].pos, walkable = [enums.MF_FLOOR, enums.MF_ITEM];
            return [[-1, 0, 'h', 'l'], [1, 0, 'l', 'h'], [0, -1, 'k', 'j'], [0, 1, 'j', 'k']]
                .find(([dx, dy]) => { const cell = map.get(own.x + dx, own.y + dy);
                    return walkable.includes(cell.mf) && !cell.mon && !state.members.some(hero =>
                        hero.pos?.x === own.x + dx && hero.pos?.y === own.y + dy); })?.slice(2) || ['.', '.'];
        });
        for (const focus of ['dungeon', 'dock_common_hotkeys']) {
            const before = await state(page);
            for (let i = 0; i < 8; i++) {
                await page.locator('#' + focus).focus();
                const turns = (await state(page)).members[0].turns;
                await page.keyboard.press(direction[i % 2]);
                await page.waitForFunction(turns => window.crawl_party.state.members[0].turns === turns + 1, turns);
                await ready(page);
            }
            const after = await state(page);
            assert.equal(after.members[0].turns, before.members[0].turns + 8);
            assert.equal(after.members[1].turns, before.members[1].turns);
            proof.scenarios.push({ focus, before: before.members[0].turns, after: after.members[0].turns });
            console.log(engine, 'native keys passed', focus);
        }
        const before = await state(page);
        await page.locator('#dungeon').focus();
        await page.keyboard.press('o');
        await page.waitForTimeout(2000);
        await page.keyboard.press('Escape');
        await ready(page);
        proof.autoExplore = { before: before.members[0].turns, after: (await state(page)).members[0].turns };
        proof.profile = await page.evaluate(() => {
            cancelAnimationFrame(window.controlProfile.frame); return window.controlProfile;
        });
        await page.screenshot({ path: output + '.png', fullPage: true });
        await save();
        assert.deepEqual(proof.errors, []); proof.passed = true;
    } catch (error) {
        proof.error = String(error.stack);
        if (page) await page.screenshot({ path: output + '-failure.png', fullPage: true }).catch(() => {});
        throw error;
    } finally {
        if (!saved) await save().catch(error => proof.cleanup_error = String(error));
        proof.saved = saved;
        fs.writeFileSync(output + '.json', JSON.stringify(proof, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
