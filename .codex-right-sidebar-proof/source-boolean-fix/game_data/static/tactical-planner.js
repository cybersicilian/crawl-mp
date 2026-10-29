define(["jquery", "comm", "client", "key_conversion", "./game-context", "./enums", "./party-model", "./map_knowledge", "./workflow-actions", "./route-plan"],
function ($, comm, client, keys, game, enums, party, map, actions, routes) {
    "use strict";
    var queue = [], pending = null, binding = null, queueing = false, running = false;
    var sending = false, watchdog = null, status = "", active = false;
    var observedEnemies = new Set();
    var unsubscribe;
    var sequence = 0;
    function state() { return window.crawl_party && window.crawl_party.state; }
    function hero() { var data = state(); return data && (data.members || []).find(function (member) { return member.slot === party.controlledSlot(data); }); }
    function tactical() {
        var data = state(), member = hero();
        return Boolean(active && data && member && (data.combat_locked || member.region_combat || queueing || queue.length));
    }
    function canPlan() {
        var member = hero(), data = state();
        return Boolean(active && data && data.plan_acknowledgements === true && member && member.alive === true && !member.ghost_haunting && member.pos
            && !client.is_watching() && game.get_ui_state && game.get_ui_state() === enums.ui.NORMAL
            && game.get_input_mode() === enums.mouse_mode.COMMAND && !$("#ui-stack > *, dialog[open]").length);
    }
    function emit() { $(document).trigger("action_plan_changed", [view()]); render(); }
    function clear(message) {
        queue = []; running = queueing = false; binding = pending ? pending.binding : null; status = message || "";
        // An already-sent native action still owns its prompt/completion.
        emit();
    }
    function reset() {
        pending = null; clearTimeout(watchdog); watchdog = null;
        clear("");
    }
    function bind() {
        var member = hero();
        if (!binding && member) {
            binding = { slot: member.slot, place: member.place };
            observedEnemies = new Set((state().enemy_initiative || []).map(function (enemy) { return enemy.id || enemy.name; }));
        }
    }
    function endpoint() {
        var member = hero(), point = member && member.pos;
        if (pending && pending.expected) point = pending.expected;
        queue.forEach(function (entry) { if (entry.expected) point = entry.expected; });
        return point && { x: point.x, y: point.y };
    }
    function passable(point) {
        var cell = map.get(point.x, point.y), data = state();
        if (!cell.t || (cell.mon && map.visible(cell))) return false;
        var background = enums.prepare_bg_flags(cell.t.bg || 0);
        if (background.TRAV_EXCL || background.EXCL_CTR) return false;
        if (data && data.members.some(function (member) {
            return member.slot !== party.controlledSlot(data) && member.on_same_level !== false
                && member.alive && routes.equal(member.pos, point);
        })) return false;
        if (cell.route_safe !== undefined) return cell.route_safe === true;
        // Older native projections: only unambiguous ordinary terrain.
        return /^(?:a |an |the )?(?:floor|open door|stone staircase.*|staircase.*|shallow water)$/i.test(cell.feature_name || "");
    }
    function add(entries) {
        if (queue.length + entries.length + (pending ? 1 : 0) > 32) { status = "Queue full · 32 actions maximum"; emit(); return false; }
        bind(); queue.push.apply(queue, entries); status = ""; emit(); return true;
    }
    function directionEntry(direction, from) {
        var target = { x: from.x + direction.dx, y: from.y + direction.dy };
        var cell = map.get(target.x, target.y);
        var attack = map.visible(cell) && cell.mon && cell.mon.att === 0;
        return { label: (attack ? "Attack " : "Move ") + direction.arrow, point: target,
            expected: attack ? from : target, from: from, kind: attack ? "attack" : "move",
            packet: { keycode: keys.codes["Numpad" + direction.numpad] || direction.key.charCodeAt(0) }, msg: "key" };
    }
    function intercept(msg, packet) {
        if (sending || !active) return true;
        var keycode = msg === "key" ? packet.keycode : msg === "input"
            ? typeof packet.text === "string" && packet.text.length === 1 ? packet.text.charCodeAt(0)
            : Array.isArray(packet.data) && packet.data.length === 1 ? packet.data[0] : null : null;
        if (keycode === 27 && (queue.length || queueing || running)) { clear("Queue cleared"); return true; }
        if ((queue.length || pending || queueing) && ["switch_player", "cycle_player", "party_action"].includes(msg)) {
            clear("Hero control changed · queue cleared"); return true;
        }
        if (!queueing && (queue.length || pending) && ["key", "input", "click_cell", "power_action", "inv_item_use"].includes(msg)) {
            clear("Manual action · queue cleared"); return true;
        }
        if (!queueing || !canPlan()) return true;
        var from = endpoint();
        if (keycode !== null) {
            var direction = routes.directions.find(function (entry) {
                return keycode === entry.key.charCodeAt(0) || keycode === keys.codes["Numpad" + entry.numpad];
            });
            if (direction) { add([directionEntry(direction, from)]); return false; }
            if (keycode === 46 || keycode === keys.codes.Numpad5) {
                add([{ label: "Wait", kind: "wait", msg: "key", packet: { keycode: 46 } }]); return false;
            }
        }
        if (msg === "power_action") {
            add([{ label: packet.kind === "spell" ? "Cast " + packet.letter : "Ability " + packet.letter,
                kind: "power", msg: msg, packet: Object.assign({}, packet) }]); return false;
        }
        return true;
    }
    function click(event) {
        if (event.which !== 1 || event.altKey || event.ctrlKey || event.metaKey || !canPlan()
            || !(tactical() || event.shiftKey)) return false;
        if (!event.shiftKey && !queueing) clear();
        var from = endpoint(), target = event.cell, cell = map.get(target.x, target.y);
        var attack = map.visible(cell) && cell.mon && cell.mon.att === 0
            && Math.max(Math.abs(target.x - from.x), Math.abs(target.y - from.y)) === 1;
        var route = attack ? [{ point: target, direction: routes.directions.find(function (entry) {
            return entry.dx === target.x - from.x && entry.dy === target.y - from.y;
        }) }] : routes.route(from, target, passable, 32 - queue.length - (pending ? 1 : 0));
        if (!route) { status = "No safe known route within 32 steps"; emit(); return true; }
        var entries = route.map(function (step) { var entry = directionEntry(step.direction, from); from = step.point; return entry; });
        if (add(entries) && !event.shiftKey && !queueing) { running = true; advance(); }
        event.preventDefault(); return true;
    }
    function advance() {
        var member = hero();
        if (!running || pending || !queue.length || !canPlan() || actions.reason(member)) return;
        if (member.can_act === false) return;
        // The server already paces accepted intents. A remaining-ms snapshot
        // is observational; restarting that duration locally can wait forever.
        var entry = queue[0];
        if (entry.kind === "move" && (!routes.equal(entry.from, member.pos) || !passable(entry.point))) {
            running = false; status = "Route changed · review the queue"; emit(); return;
        }
        queue.shift();
        pending = Object.assign({}, entry, { turns: member.turns, hp: member.hp, binding: binding,
            id: ++sequence, origin: Object.assign({}, member.pos) });
        sending = true;
        var delivered;
        try { delivered = comm.send_message(entry.msg, Object.assign({}, entry.packet, {
            plan_id: pending.id, expected_slot: binding.slot })); }
        finally { sending = false; }
        if (delivered === false) { reset(); status = "Connection unavailable · queue cleared"; emit(); return; }
        // A refused move or canceled spell may not spend a turn. Never guess
        // that it succeeded and dispatch the next action after a timeout.
        watchdog = setTimeout(function () {
            if (!pending) return;
            running = false; status = "Awaiting action result · resume after resolving it"; emit();
        }, 4000);
        emit();
    }
    function update() {
        var member = hero();
        if (binding && (!member || member.slot !== binding.slot || member.place !== binding.place || !member.alive || member.ghost_haunting)) {
            reset(); return;
        }
        if (pending && member && member.turns > pending.turns) {
            var finished = pending;
            pending.completed = true;
            if ((finished.expected && !routes.equal(finished.expected, member.pos)) || member.hp < finished.hp) {
                pending = null; clearTimeout(watchdog); watchdog = null;
                clear("Movement interrupted · queue cleared"); return;
            }
            if (Number.isInteger(pending.ack_turns) && member.turns >= pending.ack_turns) {
                pending = null; clearTimeout(watchdog); watchdog = null;
            }
        }
        if (!queue.length && !pending) { running = false; if (!queueing) binding = null; }
        if (running && queue.length && (state().enemy_initiative || []).some(function (enemy) {
            return !observedEnemies.has(enemy.id || enemy.name);
        })) {
            running = false; status = "New enemy · review the queue";
        }
        emit(); advance();
    }
    function view() {
        var member = hero();
        return { origin: member && member.pos, pending: pending, entries: queue.slice(), running: running, queueing: queueing, status: status };
    }
    function render() {
        var root = document.getElementById("tactical_planner"); if (!root) return;
        var data = state(), supported = Boolean(data && data.plan_acknowledgements === true);
        root.hidden = !hero() || client.is_watching();
        root.querySelector("[data-plan='toggle']").disabled = !supported;
        root.querySelector("[data-plan='toggle']").setAttribute("aria-pressed", String(queueing));
        root.querySelector("[data-plan='run']").textContent = running ? "Pause" : "Go";
        root.querySelector("[data-plan='run']").disabled = !queue.length;
        var label = !supported ? "Action queues need an updated engine" : status || (pending ? "Resolving " + pending.label : running ? "Executing in turn order"
            : queueing ? "Choose moves, waits or powers · Shift-click adds waypoints" : "Shift-click a route, or Plan actions");
        root.querySelector(".plan-status").textContent = label;
        var list = root.querySelector(".plan-actions"), signature = JSON.stringify(queue);
        if (list.dataset.signature === signature) return;
        list.dataset.signature = signature; list.replaceChildren();
        queue.forEach(function (entry, index) {
            var button = document.createElement("button"); button.type = "button";
            button.textContent = (index + 1) + " " + entry.label + " ×";
            button.setAttribute("aria-label", "Remove action " + (index + 1) + ": " + entry.label);
            button.addEventListener("click", function () {
                // Removing a movement invalidates the origin of later steps.
                if (entry.expected) queue.splice(index); else queue.splice(index, 1);
                running = false; emit();
            }); list.appendChild(button);
        });
    }
    function init() {
        if (unsubscribe) unsubscribe();
        unsubscribe = comm.register_send_filter(intercept);
        active = true; reset(); $("#tactical_planner").remove();
        var root = $("<section id='tactical_planner' aria-label='Action queue'><div class='plan-tools'><button type='button' data-plan='toggle' aria-pressed='false'>Plan</button><button type='button' data-plan='run'>Go</button><button type='button' data-plan='wait'>Wait +</button><button type='button' data-plan='clear'>Clear · Esc</button></div><div class='plan-actions'></div><small class='plan-status' role='status'></small></section>");
        root.appendTo("#party_hud").on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        root.on("click", "[data-plan]", function () {
            var operation = this.dataset.plan;
            if (operation === "toggle") { queueing = !queueing; running = false; bind(); }
            if (operation === "clear") clear("Queue cleared");
            if (operation === "wait" && canPlan()) add([{ label: "Wait", kind: "wait", msg: "key", packet: { keycode: 46 } }]);
            if (operation === "run") {
                running = !running; queueing = false; if (!pending) status = "";
                observedEnemies = new Set((state().enemy_initiative || []).map(function (enemy) { return enemy.id || enemy.name; }));
            }
            if (operation === "toggle") $(document).trigger("game_actions_changed");
            emit(); advance();
        }); render();
    }
    actions.setPlanning(function () { return queueing; });
    $(document).on("game_init.tacticalPlanner", init)
        .on("party_state_rendered.tacticalPlanner", update)
        .on("game_actions_changed.tacticalPlanner game_popup_changed.tacticalPlanner", advance)
        .on("game_command_boundary.tacticalPlanner", function (event, id, turns) {
            if (!pending || pending.id !== id || !Number.isInteger(turns)) return;
            if (turns <= pending.turns) {
                pending = null; clearTimeout(watchdog); watchdog = null;
                clear("Action did not spend a turn · queue cleared");
            } else { pending.ack_turns = turns; update(); }
        })
        .on("game_action_error.tacticalPlanner", function () { reset(); status = "Action rejected · queue cleared"; emit(); })
        .on("game_connection_lost.tacticalPlanner game_cleanup.tacticalPlanner", function () {
            active = false; reset(); if (unsubscribe) unsubscribe(); unsubscribe = null;
            $("#tactical_planner").remove();
        });
    return { click: click, view: view, clear: clear, init: init };
});
