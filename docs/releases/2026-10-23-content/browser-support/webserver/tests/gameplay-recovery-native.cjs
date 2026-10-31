const { signInTestAccount } = require('./helpers/test-account.cjs');
/* Missing manual + intentional native crash + owner download + checkpoint resume. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8894';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const nativeRoot = process.env.QA_NATIVE_ROOT;
assert(nativeRoot && nativeRoot.startsWith('/tmp/dcss-gameplay-'), 'Use the explicitly isolated QA build');
const out = process.env.RECOVERY_PROOF_DIR || '/tmp/dcss-gameplay-recovery-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(20000);
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    const key = code => page.evaluate(code => require('comm').send_message('key', { keycode: code }), code);
    const ready = () => page.waitForFunction(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
        return name && require(name).ready();
    });
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state)));
    const shot = name => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
    const manual = path.join(nativeRoot, 'docs/crawl_manual.txt');
    const hiddenManual = manual + '.qa-hidden';
    try {
        await page.goto(url);
        evidence.account = 'RecoveryQA' + Date.now().toString().slice(-8);
        await signInTestAccount(page, evidence.account, 'crawl');
        await page.locator('#lobby_home [data-lobby-create]').click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length > 0, null, { timeout: 120000 });
        await ready(); const initial = await state();
        // First use of native help eagerly reads its documents: the original crash path.
        fs.renameSync(manual, hiddenManual);
        try {
            await key(63); await page.locator('#ui-stack > :visible').first().waitFor();
            await key(42);
            await page.waitForFunction(() => document.querySelector('#ui-stack').textContent.includes('This help document is unavailable'));
            await shot('missing-manual-safe'); await key(27); await ready();
        } finally { if (fs.existsSync(hiddenManual)) fs.renameSync(hiddenManual, manual); }
        await key(109); await page.locator('#ui-stack > :visible').first().waitFor(); await key(27); await ready();
        await page.locator('#dock_codex_btn').click(); await page.getByRole('searchbox').waitFor();
        await page.keyboard.press('Escape'); await ready();
        assert.equal((await state()).world_aut_clock, initial.world_aut_clock);
        await page.evaluate(() => {
            window.qaSaves = []; window.qaRecovery = null;
            const comm = require('comm'), original = comm.handle_message;
            comm.handle_message = function (message) {
                if (message.msg === 'record_save_result') window.qaSaves.push(message);
                if (message.msg === 'game_recovery') window.qaRecovery = message;
                return original.apply(this, arguments);
            };
        });
        await page.locator('#dock_save_btn').click();
        await page.waitForFunction(() => window.qaSaves.some(save => save.ok));
        const checkpoint = await state(); evidence.heroIds = checkpoint.members.map(member => member.player_id);
        await key(38);
        const wizardInput = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await wizardInput.fill('wiz'); await wizardInput.press('Enter');
        await page.waitForFunction(() => document.getElementById('messages').textContent.includes('Enter Wizard Command'));
        // Invoke the engine's deliberate crash command, never an OS kill or real save.
        await key(3);
        await page.locator('#game_recovery [data-library-load]').waitFor({ state: 'visible' });
        evidence.recovery = await page.evaluate(() => window.qaRecovery);
        assert(evidence.recovery.loadable && evidence.recovery.saved_at);
        assert(evidence.recovery.report_url && !evidence.recovery.report_url.includes('None'));
        const report = await page.request.get(new URL(evidence.recovery.report_url, url).href);
        assert.equal(report.status(), 200); assert((await report.text()).includes('Intentional crash'));
        const other = await browser.newContext();
        assert.equal((await other.request.get(new URL(evidence.recovery.report_url, url).href)).status(), 404);
        await other.close(); await shot('crash-recovery');
        await page.locator('#game_recovery [data-library-load]').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length > 0); await ready();
        assert.deepEqual((await state()).members.map(member => member.player_id), evidence.heroIds);
        assert.equal((await state()).world_aut_clock, checkpoint.world_aut_clock);
        assert.deepEqual(errors, []); evidence.browserErrors = errors; await shot('checkpoint-resumed');
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ success: true, missingManualSafe: true, reportDownload: true,
            reportOwnerOnly: true, checkpointResumed: true, heroIdentityPreserved: true }));
    } catch (error) {
        console.error(error); await shot('failure');
        fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText()); throw error;
    } finally {
        if (fs.existsSync(hiddenManual)) fs.renameSync(hiddenManual, manual);
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
