/* Enter native wizard commands without replacing the game's prompt pipeline. */
const { ready, key, send, named } = require('../multiplayer-native-client.cjs');

async function clear(page) {
    for (let attempt = 0; attempt < 6; attempt++) {
        if (await named(page, 'workflow-actions', 'module.ready()')) return;
        await key(page, 27);
        await page.waitForTimeout(400);
    }
    await ready(page);
}

async function wizard(target, code, ...answers) {
    const page = target.page;
    await clear(page);
    const prompts = await page.evaluate(() => window.qaWizardPrompts);
    await key(page, 38);
    await page.waitForFunction(count => window.qaWizardPrompts > count, prompts);
    await key(page, code);
    for (const answer of answers) {
        await page.waitForTimeout(800);
        if (typeof answer === 'number') await key(page, answer);
        else await send(page, 'text_input', { text: answer + '\r' });
    }
    await page.waitForTimeout(800);
    await clear(page);
}

async function promptLua(target, code) {
    const page = target.page;
    await ready(page);
    const prompts = await page.evaluate(() => window.qaWizardPrompts);
    await key(page, 38);
    await page.waitForFunction(count => window.qaWizardPrompts > count, prompts);
    const inputs = await page.evaluate(() => window.qaInputStarts);
    await key(page, 20);
    await page.waitForFunction(count => window.qaInputStarts > count, inputs);
    await send(page, 'text_input', { text: code + '\r' });
}

module.exports = { clear, wizard, promptLua };
