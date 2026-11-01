/* Browser-only admission control: no network, game, account, save or native process. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { chromiumLaunchOptions } = require('./helpers/browser-launch.cjs');
const { foreground, foregroundTrace } = require('./helpers/browser-foreground.cjs');
async function main() {
    const browser = await chromium.launch(chromiumLaunchOptions(process.env.PLAYWRIGHT_CHANNEL));
    const evidence = { browser: browser.version(), foregroundTrace, switches: [], passed: false };
    try {
        const pages = [];
        for (let index = 0; index < 4; index++) {
            const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
            const page = await context.newPage();
            page.setDefaultTimeout(20000);
            await page.setContent(`<button id="player">Player ${index}</button>`);
            pages.push(page);
        }
        for (const index of [0, 1, 2, 3, 0, 3, 2, 1]) {
            const observed = await foreground(pages[index]);
            assert.equal(observed.visibility, 'visible'); assert.equal(observed.focused, true);
            await pages[index].locator('#player').focus();
            await pages[index].keyboard.press('x');
            evidence.switches.push({ index, observed });
        }
        evidence.passed = true;
    } catch (error) { evidence.error = error.stack; throw error; }
    finally {
        await browser.close();
        if (process.env.FOREGROUND_PROOF) fs.writeFileSync(process.env.FOREGROUND_PROOF, JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
