/* Trade availability must never displace the loadout or hide the backpack. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const input = process.env.EQUIPMENT_SPECIES || '/tmp/dcss-equipment-validation/species.json';
const nativeRoot = process.env.EQUIPMENT_NATIVE_ROOT || '/tmp/dcss-equipment-validation/source';
const out = process.env.EQUIPMENT_PROOF_DIR || '/tmp/dcss-equipment-layout-proof';
const species = ['Human', 'Coglin', 'Octopode', 'Poltergeist'];
const snapshots = JSON.parse(fs.readFileSync(input));
const profiles = Object.fromEntries(species.map(name => [name, snapshots[name]]));
const widths = [1280, 1024, 901, 900, 768, 390, 320];
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [], measurements = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = async (slot, trade) => {
        await page.evaluate(({ slot, trade }) => {
            const state = window.crawl_party.state;
            state.party_trade = trade; state.controlled_slot = slot; state.active_slot = slot;
            window.modules.inspector.open(slot, 'equipment');
        }, { slot, trade });
        await page.waitForFunction(() => document.querySelector('.paperdoll-hero-art')?.dataset.art === 'ready');
        await page.locator('#party_insp_body').evaluate(node => { node.scrollTop = 0; });
    };
    try {
        await require('./helpers/equipment-fixture.cjs').install(page, profiles, nativeRoot);
        for (const [slot, name] of species.entries()) {
            for (const trade of [true, false]) {
                await open(slot, trade);
                assert.equal(await page.locator('#folio_trade_open').count(), Number(trade));
                for (const width of widths) {
                    await page.setViewportSize({ width, height: 800 });
                    const bounds = await page.evaluate(() => {
                        const rect = selector => {
                            const r = document.querySelector(selector).getBoundingClientRect();
                            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
                        };
                        const body = document.getElementById('party_insp_body');
                        return { loadout: rect('.equipment-paperdoll'), inventory: rect('.folio-inventory'),
                            item: rect('.folio-inventory-row'), body: rect('#party_insp_body'),
                            overflow: body.scrollWidth > body.clientWidth + 1 };
                    });
                    const label = name + ', trade=' + trade + ', width=' + width;
                    assert.equal(bounds.overflow, false, label + ': horizontal overflow');
                    if (width > 900) {
                        assert(Math.abs(bounds.loadout.y - bounds.inventory.y) < 1, label + ': panel tops differ');
                        assert(bounds.inventory.x > bounds.loadout.right, label + ': backpack is beside loadout');
                        assert(bounds.item.bottom <= bounds.body.bottom, label + ': first item is below the fold');
                    } else {
                        assert(bounds.inventory.y >= bounds.loadout.bottom, label + ': stacked panels overlap');
                    }
                    measurements.push({ species: name, trade, width, ...bounds });
                    if (trade && [1280, 390, 320].includes(width))
                        await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, name.toLowerCase() + '-' + width + '.png') });
                }
            }
        }

        await page.setViewportSize({ width: 1280, height: 800 });
        await open(0, true);
        await page.evaluate(() => {
            window.tradeEvents = [];
            window.jQuery(document).on('party_trade_open.layoutTest', (event, target, item) => {
                window.tradeEvents.push({ target: target ?? null, item: item ?? null });
            });
        });
        await page.locator('#folio_trade_open').click();
        assert.deepEqual(await page.evaluate(() => window.tradeEvents), [{ target: null, item: null }]);
        const trade = page.locator('.folio-trade').first();
        const itemSlot = Number(await trade.locator('xpath=ancestor::li').getAttribute('data-item-slot'));
        await trade.click();
        assert.deepEqual(await page.evaluate(() => window.tradeEvents.at(-1)), { target: null, item: itemSlot });
        await page.evaluate(() => {
            window.sharedItems = [];
            window.modules.chat.tag_item = item => window.sharedItems.push(item);
        });
        const sharedSlot = Number(await page.locator('.folio-inventory-row').first().getAttribute('data-item-slot'));
        await page.locator('.folio-share').first().click();
        assert.equal(await page.evaluate(() => window.sharedItems[0].slot), sharedSlot);
        await open(0, true);

        await page.evaluate(() => {
            window.jQuery(document).trigger('game_input_changed', -1);
            window.modules.inspector.render();
        });
        assert(await page.locator('#folio_trade_open').isDisabled(), 'Trade retains the native action gate');
        await page.evaluate(() => {
            window.jQuery(document).trigger('game_input_changed', window.modules['./enums'].mouse_mode.COMMAND);
            window.modules.inspector.open(1, 'equipment');
        });
        assert.equal(await page.locator('#folio_trade_open').count(), 0, 'Inspecting a peer never offers controlled-hero Trade');

        await open(0, true);
        await page.evaluate(() => {
            const item = window.crawl_party.state.members[0].inventory[0];
            item.name = '+9 exceptionally-long-artifact-name-with-many-segments {rF+ Str+2 -Cast}';
            item.record_id = 'layout-artifact';
            window.modules.inspector.render();
        });
        assert.equal(await page.locator('.folio-item-actions a').getAttribute('href'), '/randarts/layout-artifact');
        assert.equal(await page.locator('.folio-item-open a').count(), 0, 'Randart link is independently actionable');
        for (const width of [1280, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            assert(await page.locator('#party_insp_body').evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                'Long item name and property chips overflow at ' + width);
            assert(await page.locator('.folio-item-copy').first().evaluate(node => node.getBoundingClientRect().width >= 120),
                'Item actions squeeze the name into a narrow column at ' + width);
            await page.locator('.folio-inventory').scrollIntoViewIfNeeded();
            await page.locator('#party_inspector_modal').screenshot({ path: path.join(out, 'long-name-' + width + '.png') });
        }
        await page.evaluate(() => {
            delete window.crawl_party.state.members[0].equipment_profile;
            window.modules.inspector.render();
        });
        assert.equal(await page.locator('.is-crpg-layout').count(), 0);
        assert.equal(await page.locator('.folio-loadout').count(), 1, 'Legacy snapshots keep their loadout');
        assert.equal(await page.locator('#folio_trade_open').count(), 1, 'Legacy inventory retains Trade');
        assert.deepEqual(errors, []);
        const evidence = { passed: true, widths, cases: measurements.length, tradeRouting: true,
            shareRouting: true, actionGates: true, longNames: true, independentLinks: true,
            legacyTrade: true, errors, measurements };
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ ...evidence, measurements: undefined, out }));
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
