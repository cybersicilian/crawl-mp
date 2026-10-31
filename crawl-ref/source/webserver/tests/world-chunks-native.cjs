/* Four independent native heroes: bounded projections and exact refresh parity. */
const fs = require('node:fs');
const path = require('node:path');
const { verifyBanners } = require('./enemy-banners-native.cjs');
const { assert, chromium, clientAs, send, key, state, ready, lua, waitTurn,
    resetPackets, packets, capture } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:18997';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const output = process.env.CHUNK_PROOF_DIR || '/tmp/dcss-world-chunks/browser';
fs.mkdirSync(output, { recursive: true });
const evidence = { checks: [], errors: [] }, clients = [];
let browser;
function check(name, data) { evidence.checks.push({ name, data }); console.log(name); }
async function cell(target, x, y) {
    return target.page.evaluate(({ x, y }) => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/map_knowledge'));
        const cell = JSON.parse(JSON.stringify(require(name).get(x, y)));
        delete cell.dirty;
        return cell;
    }, { x, y });
}
async function region(target) {
    return target.page.evaluate(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/map_knowledge'));
        const map = require(name), result = [];
        for (let y = 10; y <= 58; ++y) for (let x = 10; x <= 70; ++x) {
            const cell = JSON.parse(JSON.stringify(map.get(x, y)));
            delete cell.dirty;
            // Derived reference counts are internal to the browser table.
            if (cell.mon) delete cell.mon.refs;
            result.push(cell);
        }
        return result;
    });
}
(async () => {
    browser = await chromium.launch({ headless: true,
        ...(process.env.TACTICAL_BROWSER_CHANNEL ? { channel: process.env.TACTICAL_BROWSER_CHANNEL } : {}) });
    const suffix = Date.now().toString(36);
    for (let slot = 0; slot < 4; ++slot)
        clients.push(await clientAs(browser, url, 'Chunk' + slot + suffix, slot, evidence.errors));
    const [host, guest, third, fourth] = clients;
    await host.page.locator('#lobby_home [data-lobby-create]').click();
    await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
    for (let slot = 1; slot < 4; ++slot)
        await send(clients[slot].page, 'party_room_join', { room_id: host.username, slot });
    await host.page.waitForFunction(() => /4 heroes/.test(document.querySelector('#btn_launch_party_room').textContent));
    await host.page.locator('#btn_launch_party_room').click();
    for (const target of clients) {
        await target.page.waitForFunction(slot => window.crawl_party?.state?.members?.length === 4
            && window.crawl_party.state.controlled_slot === slot, target.slot, { timeout: 120000 });
        await ready(target.page);
    }
    await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=10,70 do for y=10,58 do dgn.grid(x,y,"floor") end end; you.moveto(20,18); crawl.redraw_view()');
    for (const [target, x, y] of [[guest, 60, 18], [third, 20, 50], [fourth, 60, 50]])
        await lua(target, `you.moveto(${x},${y}); crawl.redraw_view()`);
    const idleBefore = await Promise.all(clients.slice(1).map(target => state(target.page)));
    await resetPackets(...clients);
    const elapsed = [];
    for (let step = 0; step < 6; ++step) {
        const before = await state(host.page), start = Date.now();
        await key(host.page, 108);
        await waitTurn(host, before.members[0].turns);
        elapsed.push(Date.now() - start);
    }
    for (let index = 1; index < clients.length; ++index) {
        const after = await state(clients[index].page);
        assert.deepEqual(after.members[index].pos, idleBefore[index - 1].members[index].pos);
        assert.equal(after.members[index].turns, idleBefore[index - 1].members[index].turns);
    }
    const streams = await Promise.all(clients.map(target => packets(target)));
    const projections = streams.map(list => list.filter(packet => packet.msg === 'map' && packet.view_work));
    for (const maps of projections) {
        assert(maps.length >= 6, 'Each recipient gets a native refresh for movement');
        assert(maps.every(packet => !packet.clear), 'Normal movement never clears the floor');
        assert(maps.every(packet => packet.view_work.los < 600), 'Sight checks are bounded by personal radius');
        assert(maps.every(packet => packet.view_work.cells < 1200), 'Projection does not walk all 5600 floor cells');
        assert(maps.some(packet => packet.cells.length < 150), 'Transport emits only changed records');
    }
    check('Four spread-out owners retain independent movement with bounded native projection', {
        elapsedMs: elapsed,
        recipients: projections.map(maps => ({ frames: maps.length,
            maxLos: Math.max(...maps.map(packet => packet.view_work.los)),
            maxCells: Math.max(...maps.map(packet => packet.view_work.cells)),
            sent: maps.reduce((sum, packet) => sum + packet.cells.length, 0),
            bytes: maps.reduce((sum, packet) => sum + JSON.stringify(packet).length, 0) }))
    });
    // A visible entity and cloud must disappear in-place after sparse updates.
    await lua(host, 'dgn.create_monster(29,18,"generate_awake orc"); dgn.place_cloud(29,19,"thin mist",100); crawl.redraw_view()');
    assert.match((await cell(host, 29, 18)).mon.name, /orc/);
    assert((await cell(host, 29, 19)).t.cloud);
    assert.equal((await cell(guest, 29, 18)).mon, undefined, 'A distant owner never receives the orc');
    await verifyBanners(host, guest, output, check);
    await lua(host, 'dgn.dismiss_monsters("harmful"); dgn.delete_cloud(29,19); dgn.grid(29,18,"rock_wall"); crawl.redraw_view()');
    assert.equal((await cell(host, 29, 18)).mon, undefined);
    assert(!(await cell(host, 29, 19)).t.cloud);
    assert.match((await cell(host, 29, 18)).feature_name, /wall/);
    check('Sparse replacement removes a native entity and carries changed terrain without leaking it to distant owners');

    // Compare the incrementally reconstructed client with native full projection
    // requested by reconnect, which evaluates the entire floor as an oracle.
    const beforeRefresh = await region(host);
    const peerCamera = await guest.page.evaluate(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
        const renderer = require(name);
        renderer.set_view_center(renderer.view_center.x - 4, renderer.view_center.y + 2);
        return { ...renderer.view_center };
    });
    await resetPackets(guest);
    await host.page.addInitScript(() => {
        window.chunkNativeBaselines = [];
        function hook(loader) {
            const previous = loader.onResourceLoad;
            loader.onResourceLoad = function (context, info) {
                if (info.id === 'comm') {
                    const comm = context.defined.comm, seen = new WeakSet();
                    for (const method of ['handle_message', 'handle_message_immediately']) {
                        const original = comm[method];
                        comm[method] = function (packet) {
                            if (packet && !seen.has(packet)) {
                                seen.add(packet);
                                if (packet.msg === 'map' && packet.clear && packet.view_work?.cells === 5600)
                                    window.chunkNativeBaselines.push(packet.view_seq);
                            }
                            return original.apply(this, arguments);
                        };
                    }
                }
                if (previous) return previous.apply(this, arguments);
            };
        }
        let loader = window.requirejs;
        if (typeof loader === 'function') hook(loader);
        else Object.defineProperty(window, 'requirejs', { configurable: true,
            get: () => loader, set(value) {
                loader = value;
                if (typeof value !== 'function') return;
                Object.defineProperty(window, 'requirejs', { value, configurable: true, writable: true });
                hook(value);
            } });
    });
    await host.page.reload();
    await host.page.waitForFunction(() => window.crawl_party?.state?.members?.length === 4);
    await host.page.waitForFunction(() => window.chunkNativeBaselines.length > 0);
    await ready(host.page);
    await capture(host.page);
    assert.deepEqual(await region(host), beforeRefresh);
    assert.deepEqual(await guest.page.evaluate(() => {
        const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/dungeon_renderer'));
        return { ...require(name).view_center };
    }), peerCamera, 'Another hero reconnecting cannot recenter a manually panned peer');
    const peerMaps = (await packets(guest)).filter(packet => packet.msg === 'map');
    assert(peerMaps.length > 0, 'Observe actual peer refresh packets during reconnect');
    assert(peerMaps.every(packet => !packet.clear), 'A view request forces only the selected hero baseline');
    check('Incremental map equals a complete native reconnect baseline, including tile decoration and entity removal');
    check('A selected hero reconnect preserves an unchanged peer camera and incremental map');
    await host.page.screenshot({ path: path.join(output, 'four-owner-personal-map.png') });

    // A door changes native opacity without moving this hero. The old LOS edge
    // must be cleared, then populated again when the door opens.
    await lua(host, 'for y=10,28 do dgn.grid(28,y,"rock_wall") end; dgn.grid(28,18,"closed_door"); dgn.create_monster(30,18,"generate_awake orc"); crawl.redraw_view()');
    assert.equal((await cell(host, 30, 18)).mon, undefined);
    await lua(host, 'dgn.grid(28,18,"open_door"); crawl.redraw_view()');
    assert.match((await cell(host, 30, 18)).mon.name, /orc/);
    const occludedId = (await state(host.page)).enemy_initiative.find(entry => entry.x === 30 && entry.y === 18).id;
    await lua(host, 'dgn.grid(28,18,"closed_door"); crawl.redraw_view()');
    assert.equal((await cell(host, 30, 18)).mon, undefined);
    assert(!(await state(host.page)).enemy_initiative.some(entry => entry.id === occludedId),
        'An ordinary remembered monster leaves the banner rail when LOS closes');
    check('Stationary opacity changes rebuild personal LOS and clear entities behind the closed door');

    await lua(host, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
    await lua(guest, 'dgn.grid(60,18,"stone_stairs_down_i"); crawl.redraw_view()');
    await key(guest.page, 62);
    await guest.page.waitForFunction(() => window.crawl_party.state.floor === 'D:2');
    await ready(guest.page);
    const otherFloor = await state(guest.page);
    const hostOnD1 = await state(host.page);
    assert.equal(hostOnD1.floor, 'D:1');
    await resetPackets(...clients);
    for (const target of [host, guest, host, guest]) {
        const before = await state(target.page);
        await key(target.page, 46);
        await waitTurn(target, before.members[target.slot].turns);
    }
    const switched = (await Promise.all(clients.map(target => packets(target))))
        .flat().filter(packet => packet.msg === 'map' && packet.view_work);
    assert(switched.length >= 4);
    assert(switched.every(packet => !packet.clear), 'Returning native floor packages reuse personal maps');
    assert(switched.every(packet => packet.view_work.cells < 1200), 'Floor context switches avoid full personal tile rebuilds');
    assert.equal((await state(guest.page)).floor, 'D:2');
    assert.equal((await state(guest.page)).members[1].turns, otherFloor.members[1].turns + 2);
    assert.equal((await state(host.page)).members[0].turns, hostOnD1.members[0].turns + 2);
    check('Alternating actions on separate floors reuse personal caches and preserve independent turns', {
        maxCells: Math.max(...switched.map(packet => packet.view_work.cells)),
        floorReconciliations: switched.filter(packet => packet.view_work.terrain_reconcile).length
    });
    assert.deepEqual(evidence.errors, []);
})().catch(error => { evidence.failure = error.stack; console.error(error); process.exitCode = 1; })
    .finally(async () => {
        if (browser) await browser.close();
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    });
