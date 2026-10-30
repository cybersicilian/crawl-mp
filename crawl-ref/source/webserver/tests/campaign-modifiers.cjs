/* Staging rules use the real AMD module and native form controls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.setContent('<!doctype html><html><body><div id="lobby"><div class="party-setup-tools"></div></div></body></html>');
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'static/tabletop/party-setup.css'), 'utf8') });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.ruleChanges = [];
            window.define = (dependencies, factory) => { window.rules = factory(window.jQuery); };
        });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/client-staging-modifiers.js') });
        await page.evaluate(() => {
            window.jQuery('.party-setup-tools').append(window.rules.create(change => window.ruleChanges.push(change)));
            window.rules.render({}, true);
        });
        const fate = page.getByRole('checkbox', { name: 'Shared Fate' });
        assert.equal(await fate.isChecked(), false, 'Legacy rooms default to recoverable deaths');
        await fate.check();
        assert.deepEqual(await page.evaluate(() => window.ruleChanges), [{ shared_fate: true }]);
        await page.evaluate(() => window.rules.render({ shared_fate: true }, false));
        assert.equal(await fate.isChecked(), true);
        assert.equal(await fate.isDisabled(), true, 'Guests can inspect the rule but cannot change it');
        await page.evaluate(() => window.rules.render({ shared_fate: true }, true));
        await fate.uncheck();
        assert.deepEqual(await page.evaluate(() => window.ruleChanges), [{ shared_fate: true }, { shared_fate: false }]);
        assert.match(await page.locator('#campaign_shared_fate_help').innerText(), /one player dies, everyone loses/);
        assert.match(await page.locator('.party-campaign-options').innerText(), /replacement scrolls are rare/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        if (process.env.CAMPAIGN_RULES_SCREENSHOT)
            await page.screenshot({ path: process.env.CAMPAIGN_RULES_SCREENSHOT });
        console.log('Campaign rules: default, one-click changes, host authority, explanation and narrow layout passed.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
