/* Extra assertions inside the existing two-owner native Oozle expedition. */
const path = require('node:path');
const { assert, send, key, state, ready } = require('./multiplayer-native-client.cjs');

async function confirmation(page) {
    await page.waitForFunction(() => document.querySelector('#ui-stack')?.innerText
        .includes('Consumes one item after 5 of your turns.'));
    const text = await page.locator('#ui-stack').innerText();
    assert.match(text, /Assimilate .*\?/);
    assert.match(text, /Stores its extracted properties in one memory\./);
    assert.match(text, /Uses a random empty memory slot|Replaces the oldest memory/);
    assert(!text.includes('Assimilate which carried item?'), 'Direct selection must not reopen the picker');
    assert.match(text, /Yes/);
    assert.match(text, /No/);
    return text;
}

async function menu(target, source, folio) {
    await ready(target.page);
    if (folio) {
        await target.page.evaluate(slot => window.crawl_party.open_inspector(slot, 'equipment'), target.slot);
    } else if (await target.page.locator('#party_inspector_modal[open]').count()) {
        await target.page.locator('#party_inspector_close_btn').click();
    }
    const selector = '#' + (folio ? 'party_item_' : 'hud_item_') + target.slot + '_' + source.slot;
    await target.page.locator(selector).click({ button: 'right' });
    const entry = target.page.locator('.game-context-menu').getByRole('menuitem', { name: /Assimilate…/ });
    await entry.waitFor({ state: 'visible' });
    return entry;
}

async function start(target, source, folio = false) {
    const entry = await menu(target, source, folio);
    assert.equal(await entry.getAttribute('aria-disabled'), 'false');
    await entry.click();
    return confirmation(target.page);
}

function unchanged(before, after, source, owner) {
    for (const old of before.members) {
        const current = after.members.find(hero => hero.player_id === old.player_id);
        assert(current, 'Every native owner identity survives cancellation/rejection');
        assert.equal(current.turns, old.turns);
        assert.deepEqual(current.pos, old.pos);
    }
    const old = before.members[owner], current = after.members[owner];
    assert.deepEqual(current.equipment_profile.assimilation, old.equipment_profile.assimilation);
    assert.deepEqual(current.inventory.find(item => item.slot === source.slot),
        old.inventory.find(item => item.slot === source.slot));
}

async function rejected(target, fields) {
    const count = await target.page.evaluate(() => window.qaErrors.length);
    await send(target.page, 'inv_item_use', fields);
    await target.page.waitForFunction(count => window.qaErrors.length > count, count);
    await ready(target.page);
    const errors = await target.page.evaluate(count => window.qaErrors.slice(count), count);
    assert.equal(errors.length, 1, 'Only the intentional rejection is expected');
    assert.match(errors[0], /changed|unavailable|own|hero/i);
    // Keep this rejection in the proof, then leave the expedition's original
    // no-unexpected-native-errors assertion intact for all later mechanics.
    await target.page.evaluate(count => window.qaErrors.splice(count, 1), count);
    return errors[0];
}

async function probe(host, guest, source, out) {
    assert(source.assimilation?.uid > 0, 'Carried unequippable armour gets native item identity');
    const before = await state(host.page), results = [];
    for (const [folio, cancel] of [[false, 78], [true, 13], [false, 27]]) {
        const entry = await menu(host, source, folio);
        assert.equal(await entry.getAttribute('aria-disabled'), 'false');
        assert.match(await entry.innerText(), /Consumes one item.*5 of your turns/);
        await entry.click();
        const text = await confirmation(host.page);
        assert.match(text, /plate armour/);
        if (!results.length) await host.page.screenshot({ path: path.join(out, 'item-assimilation-confirmation.png') });
        await key(host.page, cancel);
        await ready(host.page);
        await host.page.locator('#ui-stack').locator('.menu').waitFor({ state: 'hidden' });
        if (folio) await host.page.locator('#party_inspector_modal[open]').waitFor({ state: 'visible' });
        unchanged(before, await state(host.page), source, host.slot);
        results.push({ surface: folio ? 'equipment folio' : 'inventory HUD', cancelKey: cancel });
    }
    const fields = { slot: source.slot, expected_slot: host.slot, expected_name: source.name,
        action: 'assimilate', expected_uid: source.assimilation.uid, expected_qty: source.qty };
    results.push({ staleIdentityRejected: await rejected(host, { ...fields, expected_uid: source.assimilation.uid + 1 }) });
    results.push({ staleQuantityRejected: await rejected(host, { ...fields, expected_qty: source.qty + 1 }) });
    results.push({ wrongOwnerRejected: await rejected(guest, fields) });
    unchanged(before, await state(host.page), source, host.slot);
    return { native: true, noOwnerOrPeerTurnsConsumed: true, results };
}

module.exports = { confirmation, probe, start };
