const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Native co-op save/reload and visitable identity regression. Local QA accounts only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const source = process.env.WEBTILES_SOURCE || path.resolve(__dirname, '../..');
const project = path.resolve(__dirname, '../../../..');
const url = process.env.WEBTILES_URL || 'http://localhost:8889';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.LIBRARY_PROOF_DIR || '/tmp/dcss-library-proof';
fs.mkdirSync(out, { recursive: true });
const evidence = {}, errors = [];
let server, browser, page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    for (const directory of ['rcs', 'saves/logfile', 'saves/milestones', 'webserver/run'])
        fs.mkdirSync(path.join(source, directory), { recursive: true });
    const log = fs.openSync(path.join(out, 'server.log'), 'a');
    server = spawn(path.join(project, '.venv/bin/python'),
        ['webserver/server.py', '--live-debug', '-p', new URL(url).port],
        { cwd: source, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw new Error('QA server exited; inspect server.log');
        try { if ((await fetch(url)).ok) return; } catch {}
        await pause(100);
    }
    throw new Error('QA server did not start');
}
async function stopServer() {
    if (!server || server.exitCode !== null) return;
    const finished = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await finished;
    server = null;
}
async function login(target, name) {
    await target.goto(url);
    await signInTestAccount(target, name, 'crawl');
    await target.locator('#lobby_navigation').waitFor({ state: 'visible' });
}
async function key(value) {
    await page.evaluate(value => require('comm').send_message('key', { keycode: value.codePointAt(0) }), value);
}
async function text(value) {
    const input = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
    await input.waitFor({ state: 'visible' });
    await input.fill(value.trim());
    await input.press('Enter');
}
async function state() {
    return page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
}
async function record(id) {
    const response = await fetch(url + '/api/library/games/' + id);
    assert.equal(response.status, 200);
    return response.json();
}
async function commandReady() {
    await page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(module => module.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
}
async function saveExit() {
    await commandReady();
    await page.evaluate(() => {
        window.qaLibraryEnds = [];
        if (window.qaLibraryEndHook) return;
        window.qaLibraryEndHook = true;
        const comm = require('comm'), original = comm.handle_message;
        comm.handle_message = function (message) {
            if (message.msg === 'game_ended') window.qaLibraryEnds.push(JSON.parse(JSON.stringify(message)));
            return original.apply(this, arguments);
        };
    });
    await page.locator('#workflow_expedition_details > summary').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#dock_save_exit_btn').click();
    await page.waitForFunction(() => window.qaLibraryEnds.length > 0);
    const ended = await page.evaluate(() => window.qaLibraryEnds[window.qaLibraryEnds.length - 1]);
    evidence.exitReasons = (evidence.exitReasons || []).concat(ended.reason);
    assert.equal(ended.reason, 'saved', 'Save & lobby must end normally, without a native crash: ' + JSON.stringify(ended));
    await page.locator('#game_library_panel [data-library-load]').first().waitFor({ state: 'visible' });
}

(async () => {
    if (process.env.START_WEBTILES === '1') await startServer();
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    try {
        const username = 'SaveQA' + Date.now().toString().slice(-8);
        evidence.account = username;
        console.log('Isolated native library account: ' + username);
        evidence.stage = 'fresh native expedition';
        await login(page, username);
        await page.locator('#game_library_panel').waitFor({ state: 'visible' });
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#party_room_view').waitFor({ state: 'visible' });
        await page.locator(".party-slot-box[data-slot='2'] .party-mode-btn[data-mode='companion']").click();
        await page.waitForFunction(() => document.querySelector('#btn_launch_party_room').textContent.includes('3 heroes'));
        await page.locator('#btn_launch_party_room').click();
        console.log('Launching first native expedition');
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3);
        await page.locator('#dock_save_btn').waitFor({ state: 'visible' });
        const gameId = (await page.locator('.library-game-link').getAttribute('href')).split('/').pop();
        evidence.gameId = gameId;
        const initial = await state();
        const ids = initial.members.map(member => member.player_id);
        assert.equal(new Set(ids).size, 3);
        assert(ids.every(id => /^[0-9a-f-]{36}$/.test(id)));
        evidence.heroIds = ids;
        console.log('Native expedition created with three distinct hero IDs');
        // Direct hero pages must work before anyone opens the game page.
        for (const id of ids) assert.equal((await fetch(url + '/players/' + id)).status, 200);

        // Create a real native randart on this disposable wizard-mode QA run.
        evidence.stage = 'create and identify native randart';
        await key('&');
        await page.waitForTimeout(200);
        await text('wiz\n');
        await page.waitForTimeout(200);
        await key('%');
        await page.waitForTimeout(200);
        await text('randart war axe\n');
        await page.waitForTimeout(200);
        await key('g');
        await page.waitForTimeout(200);
        await key('&');
        await key('i');
        await page.waitForFunction(() => document.querySelector('#messages')?.textContent.includes('rush of knowledge'));
        // Wizard identification is turn-free. A real native redraw publishes
        // its current inventory before checking the persistent item identity.
        await key('\u0012');
        await page.waitForFunction(() => window.crawl_party.state.members.some(m => m.inventory.some(item => item.record_id)));
        const withItem = await state();
        const randart = withItem.members.flatMap(m => m.inventory).find(item => item.record_id);
        evidence.randartId = randart.record_id;
        console.log('Native randart created and identified');
        assert.equal((await fetch(url + '/randarts/' + randart.record_id)).status, 200);

        evidence.stage = 'save without leaving';
        await commandReady();
        await page.locator('#dock_save_btn').click();
        await page.waitForFunction(() => document.getElementById('library_notice')?.textContent.includes('saved.'));
        assert(await page.locator('#dungeon').isVisible());
        const checkpoint = await record(gameId);
        assert(checkpoint.saved_at);
        assert.equal(checkpoint.state.players.length, 3);
        await page.screenshot({ path: path.join(out, 'saved-in-game.png'), fullPage: true });
        await saveExit();
        const saved = await record(gameId);
        assert.equal(saved.status, 'saved');
        assert(saved.loadable);
        evidence.saved = saved;
        console.log('First expedition saved and closed');

        // A fresh expedition must preserve the earlier native package.
        evidence.stage = 'independent second expedition';
        await page.locator('#btn_launch_party_room').click();
        await page.locator('#dock_save_btn').waitFor({ state: 'visible' });
        await page.waitForFunction(id => {
            const link = document.querySelector('.library-game-link');
            return link && !link.href.endsWith(id);
        }, gameId);
        const secondId = (await page.locator('.library-game-link').getAttribute('href')).split('/').pop();
        assert.notEqual(secondId, gameId);
        evidence.secondGameId = secondId;
        await saveExit();
        assert((await record(gameId)).loadable);
        console.log('Second expedition preserved the first save');

        // Restart both the browser session and, when owned by this test, server.
        await context.close();
        if (process.env.START_WEBTILES === '1') {
            await stopServer();
            await startServer();
            evidence.serverRestart = true;
        }
        const resumedContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        page = await resumedContext.newPage();
        page.setDefaultTimeout(45000);
        page.on('pageerror', error => errors.push(error.message));
        evidence.stage = 'resume original native package';
        await login(page, username);
        await page.locator(`#game_library_panel [data-library-load='${gameId}']`).click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 3);
        const restored = await state();
        assert.deepEqual(restored.members.map(m => m.player_id), ids);
        assert.equal((await page.locator('.library-game-link').getAttribute('href')).split('/').pop(), gameId);
        assert(restored.members.flatMap(m => m.inventory).some(it => it.record_id === randart.record_id));
        for (const hero of saved.state.players) {
            const loaded = restored.members.find(m => m.player_id === hero.id);
            assert.equal(loaded.hp, hero.hp);
            assert.equal(loaded.hp_max, hero.hp_max, 'Restored hero keeps its maximum HP');
            assert.equal(loaded.mp, hero.mp);
            assert.equal(loaded.mp_max, hero.mp_max, 'Restored hero keeps its maximum MP');
            assert.equal(loaded.xl, hero.xl);
            assert.equal(loaded.place, hero.place);
        }
        evidence.restored = (await record(gameId)).state;
        console.log('IDs, hero state and randart survived restart and reload');
        await saveExit();
        await page.screenshot({ path: path.join(out, 'saved-games.png'), fullPage: true });

        // A different authenticated account can visit records, but cannot load.
        evidence.stage = 'owner isolation';
        const stranger = await browser.newContext();
        const otherPage = await stranger.newPage();
        evidence.otherAccount = 'OtherQA' + Date.now().toString().slice(-7);
        await login(otherPage, evidence.otherAccount);
        await otherPage.evaluate(id => require('comm').send_message('library_load', { id }), gameId);
        await otherPage.waitForFunction(() => document.getElementById('library_notice')?.textContent.includes('not owned'));
        assert(await otherPage.locator('#party_lobby_panel').isVisible());
        await stranger.close();

        for (const route of ['/games/' + gameId, '/players/' + ids[0], '/randarts/' + randart.record_id]) {
            evidence.stage = 'native record page ' + route.split('/')[1];
            const profile = await resumedContext.newPage();
            await profile.goto(url + route);
            assert(await profile.locator('h1').innerText());
            if (route.startsWith('/randarts/')) {
                const description = await profile.locator('.library-description').innerText();
                assert(description.trim(), 'Identified artefact has native descriptive facts');
                assert(!/<\/?(?:white|black|darkgrey|lightgrey|red|lightred|green|lightgreen|blue|lightblue|cyan|lightcyan|magenta|lightmagenta|brown|yellow)\b[^>]*>/i.test(description),
                    'Public artefact facts must not expose native colour markup');
            }
            await profile.locator('.library-record-reference summary').click();
            assert.equal((await profile.locator('.library-id').innerText()).trim(), route.split('/')[2]);
            await profile.screenshot({ path: path.join(out, route.split('/')[1] + '-record.png'), fullPage: true });
            await profile.close();
        }
        assert.deepEqual(errors, []);
        evidence.errors = errors;
        evidence.stage = 'passed';
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, out, gameId, heroIds: ids, randartId: randart.record_id }));
    } catch (error) {
        if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
        const current = page && !page.isClosed() ? await page.evaluate(() => ({
            party: window.crawl_party?.state,
            messages: document.querySelector('#messages')?.textContent,
            libraryNotice: document.querySelector('#library_notice')?.textContent
        })).catch(() => null) : null;
        fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ evidence, errors, current,
            error: String(error.stack || error) }, null, 2));
        throw error;
    } finally {
        await browser.close();
        await stopServer();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
