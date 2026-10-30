const assert = require('node:assert/strict');
module.exports = async function verifyCollection(page) {
    const search = page.getByRole('searchbox', { name: 'Find a saved expedition' });
    const status = page.getByLabel('Status', { exact: true });
    const sort = page.getByLabel('Sort by', { exact: true });
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
    const ids = () => page.locator('.game-library-entry:visible').evaluateAll(rows => rows.map(row => row.dataset.gameId));
    assert.equal(await page.getByRole('table', { name: 'Saved expeditions' }).count(), 1);
    assert.deepEqual(await page.locator('.library-expeditions th').allTextContents(), ['Expedition', 'Progress', 'Last saved', 'Actions']);
    await search.fill('d:3 LYRA');
    assert.equal((await ids()).length, 4, 'Terms in separate fields match in either order');
    await status.selectOption('running');
    assert.deepEqual(await ids(), ['save-3']);
    assert.equal(await page.locator('#library_result_count').textContent(), '1 of 4 expeditions');
    await search.press('Escape');
    assert.equal(await search.inputValue(), '');
    assert.deepEqual(await ids(), ['save-3'], 'Escape clears text while retaining the status facet');
    await page.evaluate(() => window.qaRender());
    assert.equal(await status.inputValue(), 'running', 'Authoritative updates retain the facet');
    await clear.click();
    assert.equal(await status.inputValue(), 'all');
    assert(await search.evaluate(node => node === document.activeElement));
    await page.evaluate(() => {
        window.qaGames[0].saved_at = '2026-10-28T12:00:00Z';
        window.qaGames[1].saved_at = '2026-10-29T12:00:00Z';
        window.qaGames[2].state.turns = 999;
        window.qaRender();
    });
    assert.deepEqual(await ids(), ['save-1', 'save-0', 'save-2', 'save-3'], 'Recent saves lead by default, with stable ties');
    await sort.selectOption('progress');
    assert.equal((await ids())[0], 'save-2');
    await page.evaluate(() => window.qaRender());
    assert.equal(await sort.inputValue(), 'progress');
    assert.equal((await ids())[0], 'save-2');
    await search.fill('Amber');
    await search.evaluate(node => { node.focus(); node.setSelectionRange(1, 3); });
    await page.evaluate(() => window.qaRender());
    assert.deepEqual(await search.evaluate(node => [node === document.activeElement, node.selectionStart, node.selectionEnd]),
        [true, 1, 3], 'Background data does not replace the search or its selection');
    await clear.click();
    const resume = page.locator('[data-library-load="save-2"]');
    await resume.focus();
    await page.evaluate(() => window.qaRender());
    assert(await resume.evaluate(node => node === document.activeElement), 'Focused row action survives refresh');
    await page.evaluate(() => {
        window.qaGames.push({ id: 'unavailable', name: 'Café Expedition', loadable: false,
            state: { place: 'Lair:2', turns: 20, players: [] } });
        window.qaRender();
    });
    await status.selectOption('unavailable');
    await search.fill('cafe');
    assert.deepEqual(await ids(), ['unavailable']);
    assert.equal(await page.locator('[data-game-id="unavailable"] [data-library-load]').count(), 0);
    await search.fill('missing');
    assert(await page.locator('#library_no_matches').isVisible());
    await clear.click();
    assert.equal((await ids()).length, 5);
    await page.evaluate(() => { window.qaGames.pop(); window.qaRender(); });
    await sort.selectOption('recent');
    for (const theme of ['folio', 'dungeon', 'contrast']) {
        await page.evaluate(theme => { document.documentElement.dataset.uiThemeChanging = ""; document.documentElement.dataset.uiTheme = theme; }, theme);
        const colors = await resume.evaluate(node => {
            const style = getComputedStyle(node);
            return [style.color, style.backgroundColor];
        });
        function luminance(color) {
            const values = color.match(/[\d.]+/g).slice(0, 3).map(value => {
                const channel = Number(value) / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            });
            return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        }
        const light = colors.map(luminance).sort((a, b) => a - b);
        assert((light[1] + .05) / (light[0] + .05) >= 4.5, 'Resume contrast in ' + theme);
        if (process.env.LIBRARY_MANAGEMENT_SCREENSHOT)
            await page.screenshot({ path: process.env.LIBRARY_MANAGEMENT_SCREENSHOT.replace('.png', '-' + theme + '.png'), fullPage: true });
    }
    await page.evaluate(() => {
        document.documentElement.dataset.uiTheme = 'folio';
        // Match the app's atomic palette change before allowing transitions again.
        getComputedStyle(document.querySelector('[data-library-load]')).color;
        delete document.documentElement.dataset.uiThemeChanging;
    });
    assert.deepEqual(await page.evaluate(() => window.qaPackets), [], 'View controls send no game or server commands');
};
