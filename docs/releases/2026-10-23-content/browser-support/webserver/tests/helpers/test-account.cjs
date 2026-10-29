/* Disposable browser fixtures use the public registration/sign-in forms. */
const assert = require('node:assert/strict');

async function signInTestAccount(page, username, password) {
    assert(username && password, 'Test accounts require explicit credentials');
    await page.locator('#reg_link').click();
    await page.locator('#reg_username').fill(username);
    await page.locator('#reg_password').fill(password);
    await page.locator('#reg_repeat_password').fill(password);
    await page.locator('#reg_submit').click();
    await page.waitForFunction(() => document.querySelector('.welcome-entry')?.classList.contains('signed-in')
        || document.querySelector('#register_message')?.textContent.trim());
    if (await page.locator('.welcome-entry').evaluate(element => element.classList.contains('signed-in'))) return;

    // Save/resume and logout scenarios reuse their existing personal fixture.
    assert.equal(await page.locator('#register_message').innerText(), 'User already exists!');
    await page.locator('#reg_cancel').click();
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#login_form').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('.welcome-entry')?.classList.contains('signed-in'));
}

module.exports = { signInTestAccount };
