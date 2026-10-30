/* Real browser checks of the lobby save controls with a controlled protocol fixture. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const verifyCollection = require('./helpers/library-browser-checks.cjs');

(async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
        : { headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.route('https://save-manager.test/**', route => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/') return route.fulfill({ contentType: 'text/html',
                body: '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                    + '<body><main id="lobby" class="has-chapter-index">'
                    + '<section id="party_lobby_panel"></section></main></body></html>' });
            return route.fulfill({ path: path.join(root, pathname) });
        });
        await page.goto('https://save-manager.test/');
        for (const file of ['style.css', 'tabletop/navigation.css', 'tabletop/lobby-workspace.css',
            'fonts/fonts.css', 'tabletop/lobby-dashboard.css', 'tabletop/layout-rhythm.css',
            'tabletop/ui-themes.css', 'tabletop/theme-lobby.css', 'tabletop/library.css'])
            await page.addStyleTag({ url: 'https://save-manager.test/static/' + file });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/contrib/jquery.js') });
        await page.evaluate(() => {
            window.qaPackets = [];
            window.qaHandlers = {};
            window.qaModules = { require: { toUrl: value => "https://save-manager.test/static/scripts/" + value }, jquery: window.jQuery, comm: {
                send_message(msg, fields) { window.qaPackets.push({ msg, ...fields }); },
                register_handlers(handlers) { Object.assign(window.qaHandlers, handlers); }
            } };
            window.define = (dependencies, factory) => {
                window.qaModules[window.qaModule] = typeof dependencies === 'function'
                    ? dependencies() : factory(...dependencies.map(name => window.qaModules[name]));
            };
            window.qaModule = 'expedition-url';
            window.qaGames = Array.from({ length: 4 }, (_, i) => ({
                id: 'save-' + i, name: i === 0 ? '<Amber> expedition' : 'Amber expedition ' + i,
                status: i === 3 ? 'active' : 'saved', loadable: true, deletable: i !== 3, running: i === 3,
                state: { place: 'D:3', turns: 42, players: [{ name: 'Lyra', species: 'Human', job: 'Fighter' }] }
            }));
            window.qaRender = () => window.qaHandlers.game_library({ player_id: 'owner', games: window.qaGames });
        });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/expedition-url.js') });
        for (const name of ['text-query', 'library-browser']) {
            await page.evaluate(name => { window.qaModule = name; }, name);
            await page.addScriptTag({ path: path.join(root, 'static/scripts', name + '.js') });
        }
        await page.evaluate(() => { window.qaModule = 'library-ui'; });
        await page.addScriptTag({ path: path.join(root, 'static/scripts/library-ui.js') });
        await page.evaluate(() => window.qaRender());
        assert.equal(await page.locator('[data-library-delete]').count(), 4);
        assert(await page.locator('[data-library-delete="save-3"]').isDisabled());
        assert.equal(await page.locator('.game-library-entry h3').first().textContent(), '<Amber> expedition');
        assert.equal(await page.locator('[data-game-id="save-3"] .library-state').textContent(), 'Running');
        assert.equal(await page.locator('[data-game-id="save-0"] .library-state').textContent(), 'Saved');
        assert.equal(await page.getByRole('link', { name: 'Return to game', exact: true }).getAttribute('href'), '#expedition-save-3');
        assert.equal(await page.getByRole('link', { name: 'My history', exact: true }).getAttribute('href'), '/players/owner');
        await verifyCollection(page);
        const primary = page.locator('[data-library-load="save-0"]');
        const contrast = await primary.evaluate(el => {
            const style = getComputedStyle(el);
            const luminance = color => {
                const linear = color.match(/[\d.]+/g).slice(0, 3).map(value => {
                    const channel = Number(value) / 255;
                    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                });
                return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
            };
            const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => a - b);
            return (values[1] + 0.05) / (values[0] + 0.05);
        });
        assert(contrast >= 4.5, 'The primary Resume label must have readable contrast');
        const row = await page.locator('.game-library-entry').first().boundingBox();
        assert(row.height < 180, 'Desktop save rows should be compact');
        if (process.env.LIBRARY_MANAGEMENT_SCREENSHOT)
            await page.screenshot({ path: process.env.LIBRARY_MANAGEMENT_SCREENSHOT.replace('.png', '-desktop.png'), fullPage: true });

        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: 'Delete save for <Amber> expedition', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [], 'Cancel must send no deletion command');

        const search = page.getByRole('searchbox', { name: 'Find a saved expedition' });
        await search.fill('no matching expedition');
        assert.equal(await page.locator('.game-library-entry:visible').count(), 0);
        assert(await page.locator('#library_no_matches').isVisible());
        await search.fill('Amber');
        let confirmation = '';
        page.once('dialog', async dialog => { confirmation = dialog.message(); await dialog.accept(); });
        const deletion = page.locator('[data-library-delete="save-0"]');
        await deletion.focus();
        await deletion.press('Enter');
        assert(confirmation.includes('<Amber> expedition'));
        assert(confirmation.includes('public record will remain'));
        assert.deepEqual(await page.evaluate(() => window.qaPackets), [{ msg: 'library_delete', id: 'save-0' }]);
        assert.equal(await deletion.textContent(), 'Deleting…');
        assert(await deletion.isDisabled());
        assert(await page.locator('[data-library-delete="save-1"]').isDisabled());
        await page.evaluate(() => {
            window.qaGames = window.qaGames.filter(game => game.id !== 'save-0');
            window.qaHandlers.library_delete_result({ id: 'save-0' });
            window.qaRender();
        });
        assert.equal(await page.locator('[data-game-id="save-0"]').count(), 0);
        assert.equal(await search.inputValue(), 'Amber', 'Deletion must preserve the current search');
        assert(await page.locator('#library_refresh_btn').evaluate(button => button === document.activeElement));
        assert((await page.locator('#library_notice').textContent()).includes('Save deleted'));

        // A background refresh preserves both the query and typing focus.
        await search.focus();
        await page.evaluate(() => window.qaRender());
        assert(await search.evaluate(input => input === document.activeElement));
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-library-delete="save-1"]').click();
        await page.evaluate(() => window.qaHandlers.library_error({ message: 'This expedition is running.' }));
        assert(await page.locator('[data-library-delete="save-1"]').isEnabled());
        assert((await page.locator('#library_notice').textContent()).includes('running'));

        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.locator('[data-library-delete="save-1"]').isVisible());
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'Delete, Resume and record links must wrap within a narrow viewport');
        await page.mouse.move(1, 1);
        await page.evaluate(() => { document.getElementById('library_notice').hidden = true; });
        if (process.env.LIBRARY_MANAGEMENT_SCREENSHOT)
            await page.screenshot({ path: process.env.LIBRARY_MANAGEMENT_SCREENSHOT, fullPage: true });

        await search.fill('');
        for (const width of [320, 768, 1280, 1920, 2674]) {
            await page.setViewportSize({ width, height: 900 });
            await page.evaluate(() => {
                window.qaGames[0].name = 'AnExtremelyLongExpeditionName'.repeat(6);
                window.qaGames[0].state.players.push({ name: 'MrBlueSky', species: 'Deep Elf', job: 'Conjurer' });
                window.qaRender();
            });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
                'Long names and actions must fit at width ' + width);
        }
        await page.evaluate(() => { window.qaGames = []; window.qaRender(); });
        assert(await page.getByText('No saved expeditions yet.', { exact: false }).isVisible());
        assert(await page.getByRole('link', { name: 'My history', exact: true }).isVisible());
        assert.equal(await page.locator('[data-library-delete]').count(), 0);
        assert.deepEqual(errors, []);
        console.log('Save manager: compact rows, readable Resume, running/history links, empty state, cancellation, keyboard deletion, busy/error states, retained search/focus and layouts at 320–2674px passed.');
    } catch (error) {
        if (process.env.LIBRARY_MANAGEMENT_SCREENSHOT)
            await page.screenshot({ path: process.env.LIBRARY_MANAGEMENT_SCREENSHOT.replace('.png', '-failure.png'), fullPage: true });
        throw error;
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
