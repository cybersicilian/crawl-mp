/* Prefer Playwright's matching browser; reuse installed Chrome when it is absent. */
const fs = require('node:fs');
const { chromium } = require('playwright');
function chromiumLaunchOptions(channel = process.env.PLAYWRIGHT_CHANNEL) {
    if (channel) return { headless: true, channel };
    return fs.existsSync(chromium.executablePath()) ? { headless: true } : { headless: true, channel: 'chrome' };
}
module.exports = { chromiumLaunchOptions };
