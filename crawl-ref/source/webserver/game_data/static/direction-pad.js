/* Eight native direction commands; the engine owns movement, attacks and warnings. */
define(["jquery", "comm", "key_conversion", "./game-context", "./enums", "./party-model", "./workflow-actions", "./frame-update", "./route-plan", "./status-icons"],
function ($, comm, keys, game, enums, party, actions, frameUpdate, routes, icons) {
    "use strict";
    var observer, highlightTimer;
    var directions = routes.directions, storageKey = "dcss.direction-pad.minimized";
    function minimized() {
        try { return localStorage.getItem(storageKey) === "true"; } catch (_) { return false; }
    }
    function minimize(value) {
        try { localStorage.setItem(storageKey, String(value)); } catch (_) { /* Session-only choice. */ }
        applyMinimized(value);
    }
    function applyMinimized(value) {
        var pad = $("#direction_pad").toggleClass("is-minimized", value);
        var label = value ? "Show direction pad" : "Hide direction pad";
        pad.find(".direction-pad-toggle").attr({ "aria-label": label, "aria-expanded": String(!value), title: label,
            "data-tip-title": label, "data-tip-body": "The keyboard and clicking on the map still move your hero." });
        refresh();
    }
    function reason() {
        if (!game.get_ui_state || game.get_ui_state() !== enums.ui.NORMAL)
            return "Return to the dungeon to move or attack.";
        if ($("#ui-stack > *, dialog[open]").length) return "Finish or close the current menu first.";
        var state = window.crawl_party && window.crawl_party.state;
        var member = state && state.members.find(function (hero) { return hero.slot === party.controlledSlot(state); });
        return actions.reason(member, true);
    }
    function clearHighlight() {
        clearTimeout(highlightTimer);
        highlightTimer = null;
        $("#direction_pad .is-activated").removeClass("is-activated");
    }
    function highlight(direction) {
        clearHighlight();
        $("#direction_pad [data-direction='" + direction.name.toLowerCase() + "']").addClass("is-activated");
        highlightTimer = setTimeout(clearHighlight, 120);
    }
    function onKey(event) {
        if (event.isDefaultPrevented() || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
            || $(event.target).closest("input, textarea, select, [contenteditable], .text").length || reason()) return;
        var original = event.originalEvent || event;
        var direction = directions.find(function (entry) {
            return event.type === "game_keypress" ? String.fromCharCode(event.which) === entry.key
                : original.code === "Numpad" + entry.numpad || original.key === entry.navigation;
        });
        // Observe native input without consuming, translating or sending another command.
        if (direction) highlight(direction);
    }
    function position() {
        var pad = document.getElementById("direction_pad");
        var canvas = document.getElementById("dungeon"), root = document.getElementById("left_column");
        if (!pad || !canvas || !root) return;
        // Whole tiles bleed behind the HUD; align controls to the visible frame.
        var viewport = document.getElementById("dungeon_viewport") || canvas;
        var bounds = viewport.getBoundingClientRect(), parent = root.getBoundingClientRect();
        var inset = 10;
        pad.style.visibility = bounds.width < pad.offsetWidth + inset * 2
            || bounds.height < pad.offsetHeight + inset * 2 ? "hidden" : "";
        var left = Math.max(bounds.left + inset, bounds.right - pad.offsetWidth - inset);
        var top = Math.max(bounds.top + inset, bounds.bottom - pad.offsetHeight - inset);
        var rail = document.getElementById("enemy_initiative_rail");
        if (rail && !rail.hidden && !rail.classList.contains("is-compact") && getComputedStyle(rail).visibility !== "hidden") {
            var occupied = rail.getBoundingClientRect();
            if (left < occupied.right && left + pad.offsetWidth > occupied.left
                && top < occupied.bottom && top + pad.offsetHeight > occupied.top)
                left = Math.max(bounds.left + inset, occupied.left - pad.offsetWidth - inset);
        }
        pad.style.left = left - parent.left + "px";
        pad.style.top = top - parent.top + "px";
    }
    function update() {
        var blocked = reason();
        if (blocked) clearHighlight();
        $("#direction_pad .direction-pad-button").prop("disabled", Boolean(blocked)).each(function (index) {
            var direction = directions[index];
            var label = "Move or attack " + direction.name.toLowerCase() + ": " + direction.key
                + " or Numpad " + direction.numpad;
            $(this).attr("aria-label", label);
            this.title = blocked || label;
        });
        position();
    }
    var refresh = frameUpdate(update);
    function init() {
        var root = document.getElementById("left_column");
        if (!root) return;
        if (observer) observer.disconnect();
        clearHighlight();
        $("#direction_pad").remove();
        var pad = $("<div id='direction_pad' role='group' aria-label='Move or melee attack in eight directions'></div>");
        var grid = $("<div class='direction-pad-grid'></div>").appendTo(pad);
        directions.forEach(function (direction, index) {
            if (index === 4) $("<button type='button' class='direction-pad-toggle'></button>")
                .append(icons.icon("compass-rose"))
                .on("click", function (event) {
                    event.stopPropagation(); minimize(!pad.hasClass("is-minimized"));
                    if (event.originalEvent && event.originalEvent.detail) this.blur();
                }).appendTo(grid);
            var label = "Move or attack " + direction.name.toLowerCase() + ": " + direction.key
                + " or Numpad " + direction.numpad;
            $("<button type='button' class='direction-pad-button'></button>")
                .attr({ "data-direction": direction.name.toLowerCase(), "aria-label": label,
                    "aria-keyshortcuts": direction.key, title: label })
                .append($("<span class='direction-pad-arrow' aria-hidden='true'></span>").text(direction.arrow),
                    $("<span class='direction-pad-keys' aria-hidden='true'></span>")
                        .append($("<kbd></kbd>").text(direction.key),
                            $("<span class='direction-pad-numpad'></span>")
                                .append($("<kbd></kbd>").text(direction.numpad))))
                .on("click", function (event) {
                    event.stopPropagation();
                    if (reason()) { update(); return; }
                    // Use the physical numpad contract, independent of quickbar digit assignments.
                    comm.send_message("key", { keycode: keys.codes["Numpad" + direction.numpad] });
                    highlight(direction);
                    if (event.originalEvent && event.originalEvent.detail) this.blur();
                }).appendTo(grid);
        });
        // Native button activation spends one action, without leaking Enter or Space.
        pad.on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        pad.appendTo(root);
        observer = new ResizeObserver(refresh);
        observer.observe(root);
        observer.observe(document.getElementById("dungeon"));
        var viewport = document.getElementById("dungeon_viewport");
        if (viewport) observer.observe(viewport);
        observer.observe(pad[0]);
        applyMinimized(minimized());
        update();
    }
    $(document).on("game_init.directionPad", init)
        .on("game_keydown.directionPad game_keypress.directionPad", onKey)
        .on("party_state_rendered.directionPad game_actions_changed.directionPad game_popup_changed.directionPad game_ui_changed.directionPad hud_workspace_changed.directionPad creature_rail_positioned.directionPad", refresh)
        .on("game_cleanup.directionPad", function () {
            refresh.cancel();
            clearHighlight();
            if (observer) observer.disconnect();
            observer = null;
            $("#direction_pad").remove();
        });
    $(window).on("resize.directionPad", refresh);
    return { init: init };
});
