/* Serve real UI sprite pixels in isolated DOM tests without a network server. */
const fs = require('node:fs');
const path = require('node:path');
const spriteRoot = path.resolve(__dirname, '../../static/ui-sprites');
async function install(page) {
    await page.route('http://hud.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') {
            await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
            return;
        }
        const name = path.posix.basename(url.pathname);
        if (url.pathname === '/static/ui-sprites/' + name && /^hud-sprites\.[a-f0-9]+\.png$/.test(name)) {
            const file = path.join(spriteRoot, name);
            if (fs.existsSync(file)) {
                await route.fulfill({ contentType: 'image/png', path: file }); return;
            }
        }
        await route.fulfill({ status: 404, body: 'Unknown fixture resource' });
    });
    // setContent() retains this mocked origin, so root-relative atlas URLs work.
    await page.goto('http://hud.test/');
}
module.exports = { install };
