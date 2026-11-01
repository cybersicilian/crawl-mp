/* Ordinary native exploration/combat only. No level edits, teleportation or hidden-map reads. */
const assert = require('node:assert/strict');
const { foreground } = require('./browser-foreground.cjs');
const { send, key, state, ready } = require('../multiplayer-native-client.cjs');

async function inspect(page) {
    return page.evaluate(() => {
        const names = Object.keys(require.s.contexts._.defined);
        const mod = suffix => require(names.find(name => name.endsWith('/' + suffix)));
        const map = mod('map_knowledge'), enums = mod('enums'), routes = mod('route-plan'), game = mod('game-context');
        const party = window.crawl_party.state, own = party.members[party.controlled_slot], bounds = map.bounds();
        const blocked = new Set(party.members.filter(hero => hero.slot !== own.slot && hero.on_same_level !== false
            && hero.alive !== false && hero.pos).map(hero => hero.pos.x + ',' + hero.pos.y));
        // Native map visibility also includes remembered in-range terrain. Reuse
        // the creature model's threat classification, then require current LoS.
        const contacts = mod('monster_list').contacts().filter(contact => {
            const cell = map.get(contact.x, contact.y);
            return contact.perception === 'visible' && map.visible(cell) && !cell.t?.bg?.OOR;
        });
        const enemies = contacts.filter(contact => contact.att === 0 && !contact.non_threatening);
        const occupied = new Set(contacts.map(contact => contact.x + ',' + contact.y));
        const stairs = []; let known = 0;
        if (bounds) for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) {
            const cell = map.get(x, y);
            if (cell.route_safe) known++;
            if (cell.mf === enums.MF_STAIR_DOWN && cell.route_safe) stairs.push({x, y});
        }
        function path(goal) {
            return routes.route(own.pos, goal, point => {
                const cell = map.get(point.x, point.y);
                if (!cell.route_safe || blocked.has(point.x + ',' + point.y)) return false;
                return !occupied.has(point.x + ',' + point.y) || point.x === own.pos.x && point.y === own.pos.y
                    || point.x === goal.x && point.y === goal.y;
            }, 32);
        }
        const byDistance = (a, b) => Math.max(Math.abs(a.x - own.pos.x), Math.abs(a.y - own.pos.y))
            - Math.max(Math.abs(b.x - own.pos.x), Math.abs(b.y - own.pos.y));
        function firstRoute(goals) {
            for (const goal of goals.sort(byDistance)) {
                const steps = path(goal);
                if (steps) return {goal, step: steps[0] || null, length: steps.length};
            }
            return null;
        }
        return {floor: party.floor, own: {slot: own.slot, pos: own.pos, turns: own.turns, hp: own.hp,
            alive: own.alive, canAct: own.can_act, activity: own.activity}, mode: game.get_input_mode(),
            busyMode: enums.mouse_mode.NORMAL, commandMode: enums.mouse_mode.COMMAND, moreMode: enums.mouse_mode.MORE, known,
            down: firstRoute(stairs), enemy: firstRoute(enemies), enemies: enemies.length,
            contacts: contacts.map(({name, x, y, att, non_threatening}) => ({name, x, y, att, non_threatening})),
            statPrompt: game.get_input_mode() === enums.mouse_mode.PROMPT && (window.qaNavigation?.messages || []).some(text => /^Increase \([Ss]\)trength,.*ntelligence.*exterity/.test(text)),
            commandReady: window.qaNavigation?.ready || 0, inputEpoch: window.qaNavigation?.inputEpoch || 0,
            rejections: (window.qaNavigation?.rejections || []).slice()};
    });
}

async function installProbe(page) {
    await page.evaluate(() => {
        if (window.qaNavigation) return;
        window.qaNavigation = {ready: 0, inputEpoch: 0, messages: [], rejections: []};
        const comm = require('comm'), original = comm.handle_message;
        comm.handle_message = function (packet) {
            if (packet.msg === 'msgs') window.qaNavigation.messages = (packet.messages || []).map(row => row.text.replace(/<[^>]*>/g, '').trim()).slice(-8);
            if (packet.msg === 'input_mode') window.qaNavigation.inputEpoch++;
            if (packet.msg === 'game_action_error') window.qaNavigation.rejections.push(packet.message);
            if (packet.msg === 'input_mode' && packet.mode === 1) { window.qaNavigation.ready++; window.qaNavigation.messages = []; }
            return original.apply(this, arguments);
        };
    });
}

async function reachLowerFloor(target, clients, evidence, options = {}) {
    const budgetMs = options.budgetMs || 160000, maxCommands = options.maxCommands || 220;
    const started = Date.now(), trace = evidence.stairNavigation = {ordinaryPlay: true, budgetMs, maxCommands, commands: []};
    for (const actor of clients) await installProbe(actor.page);
    await foreground(target.page); await ready(target.page);
    const origin = await inspect(target.page); trace.origin = origin;
    let lastSignature, stalled = 0;
    function budget() {
        assert(Date.now() - started < budgetMs, 'Ordinary stair navigation exceeded its fixed preparation budget');
        assert(trace.commands.length < maxCommands, 'Ordinary stair navigation exceeded its fixed command budget');
    }
    async function command(actor, code, reason) {
        budget();
        const deadline = Date.now() + 20000;
        await servicePrompts(deadline);
        budget();
        const before = await inspect(actor.page);
        const row = {slot: actor.slot, code, reason, before}; trace.commands.push(row);
        await key(actor.page, code);
        for (;;) {
            assert(Date.now() < deadline, 'Native preparation command exceeded its unchanged20s completion limit');
            await servicePrompts(deadline);
            const after = await inspect(actor.page);
            assert(Date.now() < deadline, 'Native preparation command exceeded its unchanged20s completion limit');
            const rejected = after.rejections.slice(before.rejections.length);
            assert.equal(rejected.length, 0, 'Native preparation command rejected: ' + rejected.join('; '));
            if (after.own.turns > before.own.turns || after.own.activity || after.own.alive === false
                    || code === 111 && after.commandReady > before.commandReady) {
                row.after = after; return;
            }
            assert(Date.now() < deadline, 'Native preparation command exceeded its unchanged20s completion limit');
            await actor.page.waitForTimeout(100);
        }
    }
    async function servicePrompts(deadline = Date.now() + 20000) {
        let serviced = false;
        for (const actor of clients) {
            for (;;) {
                assert(Date.now() < deadline, 'Native prompt service exceeded its unchanged20s completion limit');
                const current = await inspect(actor.page);
                if (current.mode === current.busyMode || current.mode === current.commandMode) break;
                assert(current.mode === current.moreMode || current.statPrompt,
                    'Unexpected native prompt during ordinary exploration for slot ' + actor.slot);
                budget();
                const code = current.mode === current.moreMode ? 32 : 83;
                trace.commands.push({slot: actor.slot, code, reason: code === 32
                    ? 'Acknowledge the actual owner native MORE prompt' : 'Choose Strength at the actual owner attribute-gain prompt', before: current});
                await foreground(actor.page); await key(actor.page, code);
                await actor.page.waitForFunction(({epoch, rejected}) => window.qaNavigation.inputEpoch > epoch
                    || window.qaNavigation.rejections.length > rejected,
                    {epoch: current.inputEpoch, rejected: current.rejections.length},
                    {polling: 100, timeout: Math.max(1, deadline - Date.now())});
                const after = await inspect(actor.page);
                const rejected = after.rejections.slice(current.rejections.length);
                assert.equal(rejected.length, 0, 'Native prompt reply rejected: ' + rejected.join('; '));
                serviced = true;
            }
        }
        if (serviced) await foreground(target.page);
        return serviced;
    }
    async function stop() {
        const current = await inspect(target.page);
        if (current.own.activity) {
            await send(target.page, 'party_activity', {action: 'cancel'});
            await target.page.waitForFunction(slot => !window.crawl_party.state.members[slot].activity, target.slot, {polling: 100});
        }
        await ready(target.page);
    }
    try {
        for (;;) {
            budget();
            if (await servicePrompts()) continue;
            const current = await inspect(target.page);
            assert.equal(current.floor, origin.floor, 'Only the explicit ordinary stair command may change the test floor');
            assert(current.own.alive && current.own.hp > 0, 'The ordinary explorer must stay alive');
            if (current.mode === current.busyMode) { await target.page.waitForTimeout(100); continue; }
            assert.equal(current.mode, current.commandMode, 'Unexpected native prompt during ordinary exploration');
            if (current.own.activity) {
                if (current.down || current.enemies) await stop();
                else await target.page.waitForTimeout(100);
                continue;
            }
            if (current.own.canAct === false) {
                let advanced = false;
                for (const peer of clients.filter(peer => peer.slot !== target.slot)) {
                    const party = await state(peer.page), own = party.members[peer.slot];
                    if (party.floor === origin.floor && own.can_act && own.alive) {
                        await foreground(peer.page); await installProbe(peer.page);
                        await command(peer, 46, 'Ordinary peer wait to complete a required combat round'); advanced = true;
                    }
                }
                await foreground(target.page);
                if (!advanced) await target.page.waitForTimeout(100);
                continue;
            }
            if (current.enemy) {
                await command(target, current.enemy.step.direction.key.charCodeAt(0), 'Ordinary move or melee against a visible hostile');
                continue;
            }
            if (current.enemies) {
                await command(target, 46, 'Wait for an unreachable visible hostile to approach'); continue;
            }
            if (current.down) {
                if (current.down.length === 0) {
                    trace.stair = current.down.goal;
                    await key(target.page, 62);
                    await target.page.waitForFunction(floor => window.crawl_party.state.floor !== floor, origin.floor, {polling: 100});
                    trace.destination = await inspect(target.page);
                    assert(trace.destination.own.alive && trace.destination.own.hp > 0);
                    trace.elapsedMs = Date.now() - started; trace.passed = true;
                    return trace;
                }
                await command(target, current.down.step.direction.key.charCodeAt(0), 'Follow known safe terrain to an ordinary downstairs');
                continue;
            }
            const signature = JSON.stringify([current.own.pos, current.own.turns, current.known]);
            stalled = signature === lastSignature ? stalled + 1 : 0; lastSignature = signature;
            assert(stalled < 4, 'Native exploration stopped without new terrain, a reachable stair or a hostile');
            await command(target, 111, 'Start native auto-explore to discover an ordinary staircase');
            await target.page.waitForTimeout(100);
        }
    } catch (error) {
        trace.failure = String(error.stack); throw error;
    } finally {
        trace.elapsedMs = Date.now() - started;
        try { await stop(); } catch (error) {
            trace.cleanupError = String(error.stack);
            if (!trace.failure) throw error;
        }
    }
}
module.exports = {reachLowerFloor, inspect};
