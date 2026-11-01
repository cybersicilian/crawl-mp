define(["jquery", "comm", "client", "key_conversion", "./game-context", "./enums", "./party-model", "./map_knowledge", "./workflow-actions", "./route-plan"],
function ($, comm, client, keys, game, enums, party, map, actions, routes) {
    "use strict";
    var queue = [], pending = null, binding = null, queueing = false, running = false;
    var sending = false, watchdog = null, status = "", active = false;
    var observedEnemies = new Set();
    var unsubscribe;
    var sequence = 0;
    // Presentation only: how many actions the current Go started with.
    var runTotal = 0;
    function state() { return window.crawl_party && window.crawl_party.state; }
    function hero() { var data = state(); return data && (data.members || []).find(function (member) { return member.slot === party.controlledSlot(data); }); }
    function tactical() {
        var data = state(), member = hero();
        return Boolean(active && data && member && (party.inCombat(data, member) || queueing || queue.length));
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
    // Names come from the hero's own native spell/ability lists; letters stay the command.
    function powerLabel(packet) {
        var member = hero(), list = member && (packet.kind === "spell" ? member.spells : member.abilities);
        var power = Array.isArray(list) && list.find(function (entry) { return entry && entry.letter === packet.letter; });
        return (packet.kind === "spell" ? "Cast " : "Use ") + (power && power.name ? power.name : packet.letter);
    }
    // Estimated aut from the hero's native delays; powers are priced by the engine.
    function cost(entry) {
        var member = hero() || {};
        if (entry.kind === "move") return Number.isFinite(member.move_aut) && member.move_aut > 0 ? member.move_aut : 10;
        if (entry.kind === "attack") return Number.isFinite(member.atk_aut) && member.atk_aut > 0 ? member.atk_aut : 10;
        if (entry.kind === "wait") return 10;
        return null;
    }
    function startRun() { runTotal = queue.length + (pending ? 1 : 0); }
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
            add([{ label: powerLabel(packet), kind: "power", msg: msg, packet: Object.assign({}, packet) }]); return false;
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
        if (add(entries) && !event.shiftKey && !queueing) { running = true; startRun(); advance(); }
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
    // Interruptions the engine or the map forced; Go resumes, Clear discards.
    function paused() { return /New enemy|Route changed|interrupted|Awaiting|rejected|did not spend|Connection/.test(status); }
    function phase(supported) {
        if (!supported) return "unsupported";
        if (paused() && (queue.length || pending)) return "paused";
        if (running || pending) return "running";
        if (queueing) return "planning";
        return queue.length ? "ready" : "idle";
    }
    function span(className, text) {
        var node = document.createElement("span"); node.className = className; node.textContent = text; return node;
    }
    function renderChips(root, member) {
        var list = root.querySelector(".plan-actions");
        var signature = JSON.stringify([queue, member && member.move_aut, member && member.atk_aut]);
        if (list.dataset.signature === signature) return;
        list.dataset.signature = signature; list.replaceChildren();
        queue.forEach(function (entry, index) {
            var item = document.createElement("li"), button = document.createElement("button"), aut = cost(entry);
            item.className = "plan-chip-item"; button.type = "button"; button.className = "plan-chip";
            button.dataset.kind = entry.kind;
            button.append(span("plan-chip-index", String(index + 1)), span("plan-chip-label", entry.label),
                span("plan-chip-cost", aut === null ? "engine" : aut + " aut"), span("plan-chip-remove", "×"));
            button.lastChild.setAttribute("aria-hidden", "true");
            button.setAttribute("aria-label", "Remove action " + (index + 1) + ": " + entry.label
                + (aut === null ? "" : ", about " + aut + " aut") + (entry.expected ? ". Later steps are removed too" : ""));
            button.title = entry.expected ? "Remove this step and the steps after it" : "Remove this action";
            button.addEventListener("click", function () {
                // Removing a movement invalidates the origin of later steps.
                if (entry.expected) queue.splice(index); else queue.splice(index, 1);
                running = false; emit();
            });
            item.appendChild(button); list.appendChild(item);
        });
    }
    function render() {
        var root = document.getElementById("tactical_planner"); if (!root) return;
        var data = state(), member = hero(), supported = Boolean(data && data.plan_acknowledgements === true);
        root.hidden = !member || client.is_watching();
        var mode = phase(supported), remaining = queue.length + (pending ? 1 : 0);
        if (remaining > runTotal) runTotal = remaining;
        if (!remaining) runTotal = 0;
        root.dataset.planState = mode;
        root.querySelector(".plan-hero").textContent = member ? member.name : "";
        var known = 0, unknown = 0;
        queue.forEach(function (entry) { var aut = cost(entry); if (aut === null) unknown++; else known += aut; });
        root.querySelector(".plan-count").textContent = queue.length ? queue.length + (queue.length === 1 ? " action" : " actions") : "Empty";
        root.querySelector(".plan-cost").textContent = queue.length ? "≈ " + known + (unknown ? " + ?" : "") + " aut" : "";
        var toggle = root.querySelector("[data-plan='toggle']"), run = root.querySelector("[data-plan='run']");
        toggle.disabled = !supported; toggle.setAttribute("aria-pressed", String(queueing));
        run.textContent = running ? "Stop" : "Go"; run.disabled = !queue.length && !running;
        run.classList.toggle("plan-primary", !running); run.classList.toggle("plan-stop", running);
        run.setAttribute("aria-label", running ? "Stop after the current action" : "Go: execute the queue in turn order");
        root.querySelector("[data-plan='wait']").disabled = !supported;
        root.querySelector("[data-plan='clear']").disabled = !queue.length && !pending && !queueing;
        var progress = root.querySelector(".plan-progress"), done = Math.max(0, runTotal - remaining);
        progress.hidden = !(running || pending) || !runTotal;
        progress.querySelector(".plan-progress-fill").style.width = runTotal ? Math.round(100 * done / runTotal) + "%" : "0%";
        progress.setAttribute("aria-valuenow", String(done)); progress.setAttribute("aria-valuemax", String(runTotal));
        progress.querySelector(".plan-progress-text").textContent = runTotal ? "Step " + Math.min(runTotal, done + 1) + " of " + runTotal : "";
        var callout = root.querySelector(".plan-callout");
        callout.hidden = !paused(); callout.textContent = paused() ? status : "";
        var label = !supported ? "Action queues need an updated engine" : mode === "paused" ? "Paused · Go resumes, Clear discards"
            : status || (pending ? "Resolving " + pending.label : running ? "Executing in turn order"
            : queueing ? "Choose moves, waits or powers · Shift-click adds waypoints" : "Shift-click a route, or Plan actions");
        root.querySelector(".plan-status").textContent = label;
        renderChips(root, member);
    }
    function init() {
        if (unsubscribe) unsubscribe();
        unsubscribe = comm.register_send_filter(intercept);
        active = true; runTotal = 0; reset(); $("#tactical_planner").remove();
        var root = $("<section id='tactical_planner' aria-label='Action queue' data-plan-state='idle'>"
            + "<header class='plan-header'><span class='plan-title'>Plan for <b class='plan-hero'></b></span>"
            + "<span class='plan-meta'><span class='plan-count'></span><span class='plan-cost'></span></span></header>"
            + "<ol class='plan-actions' aria-label='Queued actions'></ol>"
            + "<div class='plan-callout' role='alert' hidden></div>"
            + "<div class='plan-progress' role='progressbar' aria-label='Queue progress' aria-valuemin='0' hidden>"
            + "<span class='plan-progress-fill'></span><span class='plan-progress-text'></span></div>"
            + "<div class='plan-tools'><button type='button' data-plan='toggle' aria-pressed='false' title='Collect moves, waits and powers without acting'>Plan</button>"
            + "<button type='button' data-plan='wait' title='Queue a wait (10 aut)'>Wait</button>"
            + "<button type='button' data-plan='run' class='plan-primary'>Go</button>"
            + "<button type='button' data-plan='clear' class='plan-quiet'>Clear <kbd>Esc</kbd></button></div>"
            + "<small class='plan-status' role='status'></small></section>");
        root.appendTo("#party_hud").on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        root.on("click", "[data-plan]", function () {
            var operation = this.dataset.plan;
            if (operation === "toggle") { queueing = !queueing; running = false; bind(); }
            if (operation === "clear") clear("Queue cleared");
            if (operation === "wait" && canPlan()) add([{ label: "Wait", kind: "wait", msg: "key", packet: { keycode: 46 } }]);
            if (operation === "run") {
                running = !running; queueing = false; if (!pending) status = "";
                if (running) startRun();
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
    function preview(target) {
        var member = hero();
        return member && member.pos && canPlan() && !queue.length && !pending
            ? routes.route(member.pos, target, passable) : null;
    }
    return { click: click, view: view, clear: clear, init: init, preview: preview };
});
