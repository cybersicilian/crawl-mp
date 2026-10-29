/* Shared-material samples prove browser presentation, not native gameplay. */
const assert = require('node:assert/strict');
const path = require('node:path');
function luminance(color) {
    const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
        value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function ratio(first, second) {
    const a = luminance(first), b = luminance(second);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
module.exports = async function checkThemes(page, probe, output, saved) {
    const results = {};
    for (const theme of ['folio', 'dungeon', 'contrast']) {
        await page.locator('[data-graphics-field="ui_theme"]').selectOption(theme); await saved(page);
        await probe.waitForFunction(value => document.documentElement.dataset.uiTheme === value, theme);
        assert.equal(await page.locator('.graphics-current').textContent(), 'Classic');
        const colors = await probe.evaluate(() => {
            const style = selector => getComputedStyle(document.querySelector(selector));
            const surface = style('.workflow-surface'), selected = style('.workflow-selected');
            const field = style('.workflow-surface input'), folio = style('.party-insp-body');
            return { page: surface.backgroundColor, text: surface.color,
                selected: selected.backgroundColor, selectedText: style('.workflow-selected .fg7').color,
                field: field.backgroundColor, fieldText: field.color,
                folioText: folio.color, folioPage: getComputedStyle(document.documentElement).getPropertyValue('--ui-page').trim() };
        });
        const ratios = { text: ratio(colors.page, colors.text), selected: ratio(colors.selected, colors.selectedText),
            field: ratio(colors.field, colors.fieldText) };
        await probe.screenshot({ path: path.join(output, `theme-${theme}-surfaces.png`), fullPage: true });
        for (const [state, value] of Object.entries(ratios)) assert(value >= 4.5, `${theme} ${state} readability target: ${value}; ${JSON.stringify(colors)}`);
        await probe.locator('.workflow-surface input').focus();
        assert.equal(await probe.locator('.workflow-surface input').evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
        await page.screenshot({ path: path.join(output, `theme-${theme}-settings.png`), fullPage: true });
        results[theme] = { colors, ratios };
    }
    await probe.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    assert.equal(await probe.locator('[aria-selected="true"]').evaluate(node => getComputedStyle(node).outlineWidth), '2px');
    await probe.screenshot({ path: path.join(output, 'theme-forced-colors.png'), fullPage: true });
    await probe.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await probe.setViewportSize({ width: 390, height: 844 });
    await probe.screenshot({ path: path.join(output, 'theme-contrast-mobile.png'), fullPage: true });
    const overflow = await probe.evaluate(() => [...document.querySelectorAll('#theme_samples *')]
        .map(node => ({ tag: node.tagName, id: node.id, className: node.className,
            right: Math.round(node.getBoundingClientRect().right) })).filter(node => node.right > innerWidth));
    assert(await probe.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Theme samples fit a narrow screen: ' + JSON.stringify(overflow.slice(0, 6)));
    await probe.setViewportSize({ width: 1280, height: 960 });
    await page.locator('[data-graphics-field="ui_theme"]').selectOption('dungeon'); await saved(page);
    await probe.waitForFunction(() => document.documentElement.dataset.uiTheme === 'dungeon');
    return results;
};
