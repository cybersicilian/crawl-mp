/* Ordinary Linux/public gameplay: new species, owner isolation, save and resume. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.env.CONTENT_SOURCE;
const out = process.env.CONTENT_PROOF;
const url = process.env.WEBTILES_URL;
const { assert, chromium, client, send, state, ready, packets, waitAction } =
    require(path.join(source, 'webserver/tests/multiplayer-native-client.cjs'));
const origin = new URL(url);
assert(origin.hostname === '127.0.0.1' || origin.origin === 'https://dcss.iancaltabiano.com');
fs.mkdirSync(out, { recursive: true });
const proof = { url, phase: process.env.CONTENT_PHASE, checks: [], errors: [], assetErrors: [] };
const clients = [];
const own = async target => (await state(target.page)).members[target.slot];
const check = name => { proof.checks.push(name); console.log(name); };
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const host = await client(browser, url, 'H', proof.errors); clients.push(host);
        const guest = await client(browser, url, 'G', proof.errors); clients.push(guest);
        for (const target of clients) target.page.on('response', response => {
            if (response.status() >= 400 && /\.(css|js|png|svg)(\?|$)/.test(response.url()))
                proof.assetErrors.push(response.status() + ' ' + response.url());
        });
        await host.page.locator('#lobby_home [data-lobby-create]').click();
        await host.page.locator('#party_slot_species_0').selectOption('Chain Devil');
        await host.page.locator('#party_slot_job_0').selectOption('Fighter');
        for (const slot of [2, 3])
            await host.page.locator(`.party-slot-box[data-slot="${slot}"] [data-mode="closed"]`).click();
        await send(guest.page, 'party_room_join', { room_id: host.username, slot: 1 });
        await guest.page.locator('#party_slot_species_1').selectOption('Eldritch');
        await guest.page.locator('#party_slot_job_1').selectOption('Conjurer');
        await host.page.waitForFunction(() => document.querySelector('#party_slot_species_1').value === 'Eldritch');
        await host.page.locator('#btn_launch_party_room').click();
        for (const target of clients) {
            await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 2
                && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 120000 });
            await ready(target.page);
            assert.deepEqual((await state(target.page)).controllable_slots, [target.slot]);
        }
        assert.equal((await own(host)).species, 'Chain Devil');
        assert.equal((await own(guest)).species, 'Eldritch');
        assert((await own(host)).abilities.some(row => row.name === 'Chain Lash'));
        assert((await own(guest)).abilities.some(row => row.name === 'Profane Altar'));
        assert.equal((await own(guest)).defiance, 0);
        assert(['', 'No God'].includes((await own(guest)).god));
        assert(await guest.page.locator('#party_defiance_1').isVisible());
        assert.match(await guest.page.locator('#party_defiance_1').innerText(), /Defiance 0\/100 · Rites 0\/3/);
        const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'overlay-manifest.json')));
        proof.assetHashes = {};
        for (const file of ['chain-view.js', 'party-card-status.js', 'dungeon_renderer.js', 'workflow-actions.js']) {
            const assetUrl = await host.page.evaluate(file => performance.getEntriesByType('resource')
                .map(entry => entry.name).find(name => name.includes('/gamedata/') && name.includes('/' + file)), file);
            assert(assetUrl, 'The actual client must request ' + file);
            const response = await host.page.request.get(assetUrl);
            assert(response.ok());
            const hash = crypto.createHash('sha256').update(await response.body()).digest('hex');
            assert.equal(hash, expected['webserver/game_data/static/' + file], file);
            proof.assetHashes[file] = hash;
        }
        check('Ordinary fresh Chain Devil and Eldritch games expose native powers and visible Defiance');
        const readyFile = process.env.CONTENT_PHASE === 'linux-private' ? 'linux-prepared.json' : 'activation.json';
        const release = JSON.parse(fs.readFileSync(path.join(__dirname, readyFile)));
        proof.contentArt = await require('./verify-content-art.cjs')(host.page, out, release);
        check('All ten served Vellum/species/ability sprites match the finished native pixels exactly');
        assert.equal((await own(host)).abilities.find(row => row.name === 'Chain Lash').tile,
            proof.contentArt.ABILITY_CHAIN_LASH.index);
        assert.equal((await own(guest)).abilities.find(row => row.name === 'Profane Altar').tile,
            proof.contentArt.ABILITY_PROFANE_ALTAR.index);
        const verifyDolls = async key => {
            proof[key] = {};
            for (const target of clients) {
            const layers = [];
            const collect = node => {
                if (!node || typeof node !== 'object') return;
                if (Array.isArray(node.doll)) layers.push(...node.doll.map(row => row[0]));
                for (const value of Object.values(node)) collect(value);
            };
            for (const packet of await packets(target)) collect(packet);
            const symbol = target.slot === 0 ? 'BASE_CHAIN_DEVIL' : 'BASE_ELDRITCH';
            proof['observedDollLayers' + target.slot + key] = [...new Set(layers)];
            assert(layers.includes(proof.contentArt[symbol].index), 'Native map must use ' + symbol);
            proof[key][symbol] = proof.contentArt[symbol].index;
            }
        };
        await verifyDolls('nativeDollLayers');
        check('Actual native map dolls and initial ability tiles select the new species artwork');
        const record = (await packets(host)).find(row => row.msg === 'record_identity').game_id;
        for (const target of clients) {
            const other = clients[1 - target.slot];
            const peerTurns = (await own(other)).turns;
            const before = await own(target);
            await waitAction(target);
            assert((await own(target)).turns > before.turns);
            assert.equal((await own(other)).turns, peerTurns);
        }
        check('Both human owners take real native actions independently');
        proof.saved = [await own(host), await own(guest)];
        proof.gameId = record;
        for (const target of clients)
            await target.page.screenshot({ path: path.join(out, target.slot + '-native.png') });
        await send(host.page, 'record_save', { exit: true });
        await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        for (const target of clients) await target.page.evaluate(() => { window.qaPackets = []; });
        await send(host.page, 'library_load', { id: record });
        await host.page.waitForFunction(record => window.qaPackets.some(packet =>
            packet.msg === 'record_identity' && packet.game_id === record)
            && window.qaPackets.some(packet => packet.msg === 'party_state' && packet.multiplayer),
            record, { timeout: 120000 });
        await send(guest.page, 'watch', { username: host.username });
        await guest.page.locator('#lobby_navigation').waitFor({ state: 'hidden' });
        await guest.page.waitForFunction(() => window.qaPackets.some(packet =>
            packet.msg === 'party_state' && packet.multiplayer), null, { timeout: 120000 });
        if (!(await state(guest.page)).controllable_slots.includes(guest.slot))
            await send(guest.page, 'join_party');
        await guest.page.waitForFunction(() => window.crawl_party?.state?.controlled_slot === 1);
        for (const target of clients) {
            await ready(target.page);
            const current = await own(target), saved = proof.saved[target.slot];
            for (const key of ['species', 'player_id', 'defiance', 'elder_summary', 'turns', 'hp', 'mp'])
                assert.equal(current[key], saved[key], key);
            assert.deepEqual(current.pos, saved.pos);
        }
        check('Native save/resume preserves new species, stable identities, resources, positions and turns');
        await verifyDolls('resumedDollLayers');
        check('Both native race sprites remain correct after save/resume');
        await send(host.page, 'record_save', { exit: true });
        await host.page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        assert.deepEqual(proof.errors, []);
        assert.deepEqual(proof.assetErrors, []);
        proof.passed = true;
    } catch (error) {
        proof.failure = String(error.stack);
        for (const target of clients) {
            proof['client' + target.slot] = { state: await state(target.page).catch(() => null),
                text: (await target.page.locator('body').innerText().catch(() => '')).slice(-10000) };
            proof['resources' + target.slot] = await target.page.evaluate(() =>
                performance.getEntriesByType('resource').map(entry => entry.name)).catch(() => []);
            await target.page.screenshot({ path: path.join(out, 'failure-' + target.slot + '.png') }).catch(() => {});
            try { await send(target.page, 'record_save', { exit: true }); } catch {}
        }
        throw error;
    } finally {
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(proof, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
