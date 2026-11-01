/* Real browsers, one native engine: how quickly actions reach every player.
 * Scenarios: one hero walking, both walking, a held key, a partner's open
 * prompt, shared combat and separate floors. Disposable localhost wizard games. */
const fs = require('node:fs');
const { assert, chromium, client, clientAs, send, key, state, ready, lua } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8895';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Disposable local wizard games only');
const output = process.env.SMOOTHNESS_PROOF || '/tmp/dcss-multiplayer-smoothness.json';
const count = Number(process.env.SMOOTHNESS_SAMPLES || 30);
const only = process.env.SMOOTHNESS_SCENARIOS?.split(',');
const players = Number(process.env.SMOOTHNESS_PLAYERS || 2);
const pace = ms => new Promise(resolve => setTimeout(resolve, ms));
const summary = values => {
    const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
    if (!sorted.length) return { count: 0 };
    const at = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    return { count: sorted.length, median: +at(.5).toFixed(1), p90: +at(.9).toFixed(1),
        p99: +at(.99).toFixed(1), max: +sorted.at(-1).toFixed(1) };
};
const evidence = { url, count, scenarios: {}, errors: [] };

// Wall-clock stamps compare across pages; both pages share this machine's clock.
async function instrument(target) {
    await target.page.evaluate(() => {
        const wall = () => performance.timeOrigin + performance.now();
        const proof = window.smoothProof = { wall, seen: [], longTasks: [], handlers: {}, frames: 0, bytes: 0 };
        const comm = require('comm'), handle = comm.handle_message;
        comm.handle_message = function (message) {
            const start = performance.now(), result = handle.apply(this, arguments);
            (proof.handlers[message.msg] ||= []).push(performance.now() - start);
            return result;
        };
        require('jquery')(document).on('party_state_rendered.smoothProof', (event, data) => {
            const members = (data.members || []).map(hero => [hero.slot, hero.aut_clock, hero.pos?.x, hero.pos?.y, hero.can_act]);
            proof.seen.push({ at: wall(), members });
            if (proof.seen.length > 5000) proof.seen.shift();
        });
        if (PerformanceObserver.supportedEntryTypes?.includes('longtask'))
            new PerformanceObserver(list => proof.longTasks.push(...list.getEntries().map(entry => entry.duration)))
                .observe({ type: 'longtask' });
        const socket = window.socket;
        if (socket) socket.addEventListener('message', event => {
            proof.frames++;
            proof.bytes += typeof event.data === 'string' ? event.data.length : event.data.byteLength;
        });
    });
}
const clear = (...targets) => Promise.all(targets.map(target => target.page.evaluate(() => {
    const proof = window.smoothProof;
    proof.seen = []; proof.longTasks = []; proof.handlers = {}; proof.frames = 0; proof.bytes = 0;
})));
const proofOf = target => target.page.evaluate(() => {
    const proof = window.smoothProof;
    return { seen: proof.seen, longTasks: proof.longTasks, handlers: proof.handlers, frames: proof.frames, bytes: proof.bytes };
});
// Time from pressing a real key to the action's state reaching each player.
async function act(actor, partner, keycode, advanced) {
    const before = await state(actor.page);
    const hero = before.members.find(member => member.slot === actor.slot);
    const marker = await actor.page.evaluate(() => window.smoothProof.wall());
    await key(actor.page, keycode);
    const landed = page => page.waitForFunction(({ slot, clock, marker }) => {
        const entry = window.smoothProof.seen.find(item => item.at >= marker
            && item.members.some(member => member[0] === slot && member[1] > clock));
        if (entry && !entry.painted) {
            entry.painted = true;
            requestAnimationFrame(() => { entry.paint = window.smoothProof.wall(); });
        }
        return entry?.paint;
    }, { slot: actor.slot, clock: hero.aut_clock, marker }, { polling: 2 });
    const own = await (await landed(actor.page)).jsonValue();
    const peer = partner ? await (await landed(partner.page)).jsonValue() : undefined;
    return { own: own - marker, partner: peer === undefined ? undefined : peer - marker };
}
function aggregate(host, guest, hostProof, guestProof, samples, seconds) {
    const handlers = proof => Object.fromEntries(Object.entries(proof.handlers)
        .map(([name, values]) => [name, { ...summary(values), total: +values.reduce((a, b) => a + b, 0).toFixed(1) }]));
    return { own: summary(samples.map(sample => sample.own)), partner: summary(samples.map(sample => sample.partner)),
        seconds, hostLongTasks: summary(hostProof.longTasks), guestLongTasks: summary(guestProof.longTasks),
        hostFrames: hostProof.frames, guestFrames: guestProof.frames, hostBytes: hostProof.bytes, guestBytes: guestProof.bytes,
        hostHandlers: handlers(hostProof), guestHandlers: handlers(guestProof) };
}
async function scenario(name, host, guest, run) {
    if (only && !only.includes(name)) return;
    await clear(host, guest);
    console.log('start', name);
    const started = Date.now();
    const samples = await run();
    const [hostProof, guestProof] = await Promise.all([proofOf(host), proofOf(guest)]);
    evidence.scenarios[name] = aggregate(host, guest, hostProof, guestProof, samples, (Date.now() - started) / 1000);
    const result = evidence.scenarios[name];
    console.log(name, JSON.stringify({ own: result.own, partner: result.partner, seconds: result.seconds,
        bytes: [result.hostBytes, result.guestBytes], frames: [result.hostFrames, result.guestFrames],
        longTasks: [result.hostLongTasks, result.guestLongTasks] }));
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
}
const walkKey = index => index % 2 ? 0x68 : 0x6c; // h and l step back and forth.
// Real browser auto-repeat: repeated down() calls set KeyboardEvent.repeat.
async function hold(target, letter, repeats) {
    await target.page.evaluate(() => document.activeElement?.blur());
    for (let index = 0; index < repeats; index++) {
        await target.page.keyboard.down(letter);
        await pace(33);
    }
    await target.page.keyboard.up(letter);
    return Date.now();
}
async function settled(target) {
    await target.page.waitForFunction(() => {
        const proof = window.smoothProof;
        return proof.seen.length && proof.wall() - proof.seen.at(-1).at > 400;
    });
}
async function untilEligible(target) {
    await target.page.waitForFunction(slot => {
        const hero = window.crawl_party?.state?.members?.find(member => member.slot === slot);
        return hero?.can_act !== false && !hero?.queued_action;
    }, target.slot);
}
// In combat a hero ahead of the region clock waits for the others, so both are
// rarely eligible at once. Return whoever can act now.
async function nextEligible(first, second) {
    const eligible = target => target.page.evaluate(slot => {
        const hero = window.crawl_party.state.members.find(member => member.slot === slot);
        return hero.can_act !== false && !hero.queued_action;
    }, target.slot);
    for (let attempt = 0; attempt < 2000; attempt++) {
        if (await eligible(first)) return first;
        if (await eligible(second)) return second;
        await pace(5);
    }
    throw new Error('Neither hero became eligible');
}
async function main() {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const host = await client(browser, url, 'H', evidence.errors);
        const guest = await client(browser, url, 'G', evidence.errors);
        const others = [];
        for (let slot = 2; slot < players; slot++)
            others.push(await clientAs(browser, url, 'Multi' + slot + Date.now().toString(36), slot, evidence.errors));
        await host.page.locator('#lobby_home [data-lobby-create]').click();
        await send(host.page, 'party_room_apply_comp', { seed: '9548842358735470601' });
        for (const target of [guest, ...others])
            await send(target.page, 'party_room_join', { room_id: host.username, slot: target.slot });
        await host.page.waitForFunction(count => document.querySelector('#btn_launch_party_room').textContent.includes(count + ' heroes'), players);
        await host.page.locator('#btn_launch_party_room').click();
        for (const target of [host, guest, ...others]) {
            await target.page.waitForFunction(({ slot, players }) => window.crawl_party?.state?.members?.length === players
                && window.crawl_party.state.controlled_slot === slot, { slot: target.slot, players }, { timeout: 120000 });
            await ready(target.page);
            await instrument(target);
        }
        // A quiet walled arena keeps samples comparable between runs.
        await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); debug.disable("death",true); dgn.dismiss_monsters("harmful"); for x=30,52 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35)');
        await lua(guest, 'you.moveto(42,35); crawl.redraw_view()');
        for (const [index, target] of others.entries())
            await lua(target, `you.moveto(${38 - index * 2},37); crawl.redraw_view()`);
        await scenario('solo-walk', host, guest, async () => {
            const samples = [];
            for (let index = 0; index < count; index++) {
                samples.push(await act(host, guest, walkKey(index)));
                await pace(120);
            }
            return samples;
        });
        await scenario('both-walk', host, guest, async () => {
            const walk = async (actor, partner, offset) => {
                const samples = [];
                for (let index = 0; index < count; index++) {
                    samples.push(await act(actor, partner, walkKey(index + offset)));
                    await pace(90 + offset * 37);
                }
                return samples;
            };
            return (await Promise.all([walk(host, guest, 0), walk(guest, host, 1)])).flat();
        });
        await lua(host, 'for x=5,75 do dgn.grid(x,35,"floor") end; you.moveto(8,35); crawl.redraw_view()');
        await scenario('held-key', host, guest, async () => {
            const start = (await state(host.page)).members[host.slot].turns;
            const released = await hold(host, 'l', 40);
            await settled(host);
            const last = await host.page.evaluate(() => window.smoothProof.seen.at(-1).at);
            evidence.heldKey = { keys: 40, turns: (await state(host.page)).members[host.slot].turns - start,
                overshootMs: last - released };
            console.log('held-key', JSON.stringify(evidence.heldKey));
            return [];
        });
        await scenario('peer-prompt', host, guest, async () => {
            const samples = [];
            let rejected = 0;
            for (let index = 0; index < Math.min(count, 12); index++) {
                await Promise.all([untilEligible(host), untilEligible(guest)]);
                await key(host.page, 0x69); // i opens a native inventory on the host.
                await host.page.waitForFunction(() => require('jquery')('#ui-stack > *').length > 0);
                await pace(150);
                const before = (await state(guest.page)).members[guest.slot].aut_clock;
                const errors = await guest.page.evaluate(() => window.qaErrors.length);
                await key(guest.page, walkKey(index));
                await pace(250);
                const refused = await guest.page.evaluate(() => window.qaErrors.length) > errors;
                const marker = await host.page.evaluate(() => window.smoothProof.wall());
                await key(host.page, 27);
                const landed = guest.page.waitForFunction(({ slot, clock }) => {
                    const hero = window.crawl_party.state.members.find(member => member.slot === slot);
                    return hero.aut_clock > clock && window.smoothProof.wall();
                }, { slot: guest.slot, clock: before }, { polling: 2 });
                // A refused player has to notice and press again.
                if (refused) {
                    rejected++;
                    await host.page.waitForFunction(() => !require('jquery')('#ui-stack > *').length);
                    await pace(40);
                    await key(guest.page, walkKey(index));
                }
                samples.push({ own: await (await landed).jsonValue() - marker });
                await pace(120);
            }
            evidence.peerPrompt = { attempts: Math.min(count, 12), rejected };
            console.log('peer-prompt', JSON.stringify(evidence.peerPrompt));
            return samples;
        });
        await lua(host, 'you.moveto(40,35); qa_mon=dgn.create_monster(38,33,"generate_awake orc"); crawl.redraw_view()');
        await host.page.waitForFunction(slot => window.crawl_party.state.members[slot].region_combat === true, host.slot);
        await scenario('combat', host, guest, async () => {
            const samples = [];
            for (let index = 0; index < count * 2; index++) {
                const actor = await nextEligible(...(index % 2 ? [guest, host] : [host, guest]));
                samples.push(await act(actor, actor === host ? guest : host, 0x2e));
                await pace(60);
            }
            return samples;
        });
        await scenario('combat-held-key', host, guest, async () => {
            while (await nextEligible(host, guest) !== host) await act(guest, null, 0x2e);
            const start = (await state(host.page)).members[host.slot].turns;
            await hold(host, 'j', 30);
            await pace(100);
            const peak = await host.page.evaluate(slot => window.crawl_party.state.members[slot].queued_action_count || 0, host.slot);
            // Partner turns must not keep walking a hero whose key is up.
            let partnerTurns = 0;
            for (let attempt = 0; attempt < 6 && partnerTurns < 3; attempt++) {
                if (await nextEligible(guest, host) === guest) {
                    await act(guest, null, 0x2e);
                    partnerTurns++;
                }
                await pace(300);
            }
            const after = await state(host.page);
            evidence.combatHeldKey = { keys: 30, queuedAtRelease: peak, partnerTurns,
                heroTurnsAfterRelease: after.members[host.slot].turns - start,
                stillQueued: after.members[host.slot].queued_action_count || 0 };
            console.log('combat-held-key', JSON.stringify(evidence.combatHeldKey));
            await key(host.page, 27);
            return [];
        });
        // A wizard key sent during recovery would queue instead of opening.
        while (await nextEligible(host, guest) !== host) await act(guest, null, 0x2e);
        await lua(host, 'dgn.dismiss_monsters("harmful"); crawl.redraw_view()');
        await untilEligible(host); await untilEligible(guest);
        await lua(guest, 'local x, y = you.pos(); dgn.grid(x, y, "stone_stairs_down_i"); crawl.redraw_view()');
        await key(guest.page, 62);
        await guest.page.waitForFunction(() => window.crawl_party.state.floor === 'D:2');
        await ready(guest.page);
        await scenario('split-floors', host, guest, async () => {
            const samples = [];
            for (let index = 0; index < count; index++) {
                samples.push(await act(host, null, 0x2e));
                await pace(40);
                samples.push(await act(guest, null, 0x2e));
                await pace(40);
            }
            return samples;
        });
        assert.deepEqual(evidence.errors, []);
    } catch (error) {
        evidence.failure = error.stack;
        console.error(error);
        process.exitCode = 1;
    } finally {
        fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
        await browser.close();
    }
}
main();
