/* Immediate acknowledgement of every command. The instant a dock button, quick slot,
   view tool or gameplay key leaves the client, the control shows a pressed state, the
   controlled hero's medallion pulses and a chip over the dungeon names what was sent;
   the chip ticks when the engine's next update lands. This module only observes the
   existing input paths: it never sends, translates or repeats a native command. */
define(["jquery", "./game-context", "./enums"], function ($, game, enums) {
    "use strict";
    var FLASH = 120, DONE = 600, HOLD = 1500;
    var chip = null, chipTimer = null, pulseTimer = null, awaiting = false;
    var labels = { o: "Explore", "\t": "Fight", "5": "Rest", g: "Pick up", "<": "Up stairs", ">": "Down stairs",
        i: "Inventory", I: "Hero sheet", z: "Cast", Z: "Cast again", a: "Ability", m: "Skills", A: "Traits", "%": "Resists", "^": "Religion",
        ".": "Wait", s: "Wait", x: "Examine", X: "Map", f: "Fire", F: "Fire", v: "Evoke", V: "Evoke", q: "Quaff", r: "Read", w: "Wield",
        W: "Wear", T: "Take off", P: "Put on", R: "Remove", t: "Shout", d: "Drop", G: "Travel", "_": "Help", "\\": "Knowledge",
        "}": "Runes", "@": "Overview", "!": "Shout", "&": "Debug", "'": "Swap weapon", ",": "Pick up", ";": "Look here", "/": "Help",
        "=": "Reassign", "#": "Dump", "~": "Macros", "$": "Shopping", "0": "Rest", "9": "Rest" };
    var moves = { h: "\u2190", j: "\u2193", k: "\u2191", l: "\u2192", y: "\u2196", u: "\u2197", b: "\u2199", n: "\u2198",
        ArrowLeft: "\u2190", ArrowRight: "\u2192", ArrowUp: "\u2191", ArrowDown: "\u2193",
        Home: "\u2196", PageUp: "\u2197", End: "\u2199", PageDown: "\u2198",
        Numpad4: "\u2190", Numpad6: "\u2192", Numpad8: "\u2191", Numpad2: "\u2193",
        Numpad7: "\u2196", Numpad9: "\u2197", Numpad1: "\u2199", Numpad3: "\u2198", Numpad5: "Wait" };

    function keyName(key) {
        return key === "\t" ? "Tab" : key === " " ? "Space" : key.length === 1 ? key : key.replace("Arrow", "").replace("Numpad", "Num ");
    }
    function mount() {
        if (chip && chip.isConnected) return chip;
        var host = document.getElementById("dungeon_viewport");
        if (!host) return null;
        chip = document.getElementById("mission_ack");
        if (!chip) {
            chip = document.createElement("span");
            chip.id = "mission_ack"; chip.className = "mission-ack";
            chip.setAttribute("role", "status"); chip.setAttribute("aria-live", "polite");
            chip.hidden = true;
            host.appendChild(chip);
        }
        return chip;
    }
    function flash(element) {
        if (!element || element.disabled) return;
        element.classList.add("is-activated");
        clearTimeout(element.feedbackTimer);
        element.feedbackTimer = setTimeout(function () { element.classList.remove("is-activated"); }, FLASH);
    }
    function pulse() {
        var ring = document.querySelector("#party_hud_members .party-card.is-controlled-card .hud-hero-medallion");
        if (!ring) return;
        ring.classList.remove("is-acting");
        void ring.offsetWidth; // restart the pulse for rapid repeats
        ring.classList.add("is-acting");
        clearTimeout(pulseTimer);
        pulseTimer = setTimeout(function () { ring.classList.remove("is-acting"); }, 240);
    }
    function show(label, key, state) {
        var node = mount(); if (!node) return;
        node.replaceChildren();
        if (key) {
            var cap = document.createElement("kbd"); cap.className = "mission-ack-key"; cap.textContent = keyName(key);
            node.appendChild(cap);
        }
        node.appendChild(document.createTextNode(label));
        node.dataset.state = state;
        node.hidden = false;
    }
    function settle(state) {
        if (!chip || chip.hidden) return;
        awaiting = false;
        chip.dataset.state = state;
        clearTimeout(chipTimer);
        chipTimer = setTimeout(function () { chip.hidden = true; }, DONE);
    }
    // One command: pressed control, medallion pulse, "sent" chip that waits for the engine.
    function acknowledge(label, key, source) {
        flash(source);
        pulse();
        show(label, key, "sent");
        awaiting = true;
        clearTimeout(chipTimer);
        chipTimer = setTimeout(function () { settle("done"); }, HOLD);
    }
    function blocked(label, key, source) {
        show(label, key, "blocked");
        awaiting = false;
        clearTimeout(chipTimer);
        chipTimer = setTimeout(function () { chip.hidden = true; }, DONE);
    }
    function dockButton(key) {
        return document.querySelector("#dcss_quick_dock [data-dock-key='" + (key === "\t" ? "\\9" : key.replace(/(['\\])/g, "\\$1")) + "']");
    }
    function playing() {
        if (!game.get_input_mode) return false;
        if (![enums.mouse_mode.NORMAL, enums.mouse_mode.COMMAND].includes(game.get_input_mode())) return false;
        return !document.querySelector("#ui-stack > *, dialog[open]");
    }
    function typing(target) {
        return $(target).closest("input, textarea, select, [contenteditable='true'], #chat, .text").length > 0;
    }
    // Keys: the same native route client-input.js forwards (game_keydown for navigation
    // keys, game_keypress for characters). Observed only; nothing is consumed.
    function onKey(event) {
        if (event.isDefaultPrevented() || event.ctrlKey || event.altKey || event.metaKey || typing(event.target) || !playing()) return;
        var original = event.originalEvent || event, label = null, key = null;
        if (event.type === "game_keydown") {
            if (original.key === "Tab" && !event.shiftKey) { key = "\t"; label = labels["\t"]; }
            else if (moves[original.code] && /^Numpad/.test(original.code || "")) { key = original.code; label = moves[original.code]; }
            else if (moves[original.key] && original.key.length > 1) { key = original.key; label = moves[original.key]; }
        } else if (event.type === "game_keypress") {
            var ch = String.fromCharCode(event.which);
            if (event.shiftKey && !/[A-Z<>%^_\\}@!&',;/=#~$]/.test(ch)) return;
            if (moves[ch] && !event.shiftKey) { key = ch; label = "Move " + moves[ch]; }
            else if (labels[ch]) { key = ch; label = labels[ch]; }
        }
        if (!label) return;
        if (label.length === 1) label = "Move " + label;
        acknowledge(label, key, dockButton(key));
    }
    function onClick(event) {
        var target = event.target.closest("#dcss_quick_dock .dcss-dock-btn[data-dock-key], .hud-quick-slot, #direction_pad .direction-pad-button, #party_turn_banner .party-banner-btn, #party_turn_banner .mission-tools button, #quickbar_commands .dcss-dock-btn, #tactical_planner .plan-primary");
        if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
        var label = target.getAttribute("data-tip-title") || target.getAttribute("aria-label") || target.textContent.trim();
        label = label.replace(/\s*\(.*\)\s*$/, "").replace(/\s+·.*$/, "").slice(0, 32);
        var key = target.getAttribute("data-dock-key") || target.getAttribute("data-tip-key") || "";
        if (/^Key:\s*/.test(key)) key = key.replace(/^Key:\s*/, "");
        if (key.length > 3 && !/^(Tab|F\d\d?)$/.test(key)) key = "";
        if (target.matches("#party_turn_banner button")) { flash(target); return; } // view tools: no engine round trip
        acknowledge(label, key, target);
    }
    function engineUpdate() { if (awaiting) settle("done"); }
    function cleanup() {
        clearTimeout(chipTimer); clearTimeout(pulseTimer); awaiting = false;
        if (chip) { chip.hidden = true; chip.replaceChildren(); }
        chip = null;
        document.removeEventListener("click", onClick, true);
        $(document).off(".actionFeedback");
    }
    function init() {
        cleanup();
        mount();
        document.addEventListener("click", onClick, true);
        $(document).on("game_keydown.actionFeedback game_keypress.actionFeedback", onKey)
            .on("player_state_changed.actionFeedback party_state_rendered.actionFeedback", engineUpdate)
            .on("game_cleanup.actionFeedback", cleanup);
    }
    return { init: init, acknowledge: acknowledge, blocked: blocked, flash: flash, pulse: pulse };
});
