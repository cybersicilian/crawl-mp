/* Chromium's supported focus emulation admits one active test page at a time. */
const sessions = new WeakMap(), activePages = new WeakMap();
const foregroundTrace = [];
async function observe(page, stage) {
    const observation = await page.evaluate(() => ({ visibility: document.visibilityState,
        hidden: document.hidden, focused: document.hasFocus(), readyState: document.readyState,
        activeElement: document.activeElement?.id || document.activeElement?.tagName,
        width: innerWidth, height: innerHeight, url: location.href }));
    foregroundTrace.push({ stage, at: new Date().toISOString(), ...observation });
    if (foregroundTrace.length > 80) foregroundTrace.shift();
    return observation;
}
async function foreground(page) {
    const browser = page.context().browser(), previous = activePages.get(browser);
    if (previous && previous !== page && !previous.isClosed())
        await sessions.get(previous).send('Emulation.setFocusEmulationEnabled', { enabled: false });
    if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
    try {
        await observe(page, 'before');
        await page.bringToFront();
        await sessions.get(page).send('Emulation.setFocusEmulationEnabled', { enabled: true });
        activePages.set(browser, page);
        await observe(page, 'after-activation');
        await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus(),
            undefined, { polling: 100 });
        return await observe(page, 'admitted');
    } catch (error) {
        await observe(page, 'failed').catch(() => {});
        error.foregroundTrace = foregroundTrace.slice();
        throw error;
    }
}
module.exports = { foreground, foregroundTrace };
