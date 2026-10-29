/* Eight native direction commands; the engine owns movement, attacks and warnings. */
define(["jquery", "comm", "key_conversion", "./game-context", "./enums", "./party-model", "./workflow-actions", "./frame-update"],
function ($, comm, keys, game, enums, party, actions, frameUpdate) {
    "use strict";
    var observer, highlightTimer;
    var assignedKeys = new Set();
    var directions = [
        { name: "Northwest", arrow: "↖", letter: "y", numpad: "7", navigation: "Home" },
        { name: "North", arrow: "↑", letter: "k", numpad: "8", navigation: "ArrowUp" },
        { name: "Northeast", arrow: "↗", letter: "u", numpad: "9", navigation: "PageUp" },
        { name: "West", arrow: "←", letter: "h", numpad: "4", navigation: "ArrowLeft" },
        { name: "East", arrow: "→", letter: "l", numpad: "6", navigation: "ArrowRight" },
        { name: "Southwest", arrow: "↙", letter: "b", numpad: "1", navigation: "End" },
        { name: "South", arrow: "↓", letter: "j", numpad: "2", navigation: "ArrowDown" },
        { name: "Southeast", arrow: "↘", letter: "n", numpad: "3", navigation: "PageDown" }
    ];
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
        highlightTimer = setTimeout(clearHighlight, 180);
    }
    function onKey(event) {
        if (event.isDefaultPrevented() || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
            || $(event.target).closest("input, textarea, select, [contenteditable], .text").length || reason()) return;
        var original = event.originalEvent || event;
        var direction = directions.find(function (entry) {
            return event.type === "game_keypress" ? String.fromCharCode(event.which) === entry.letter
                : original.code === "Numpad" + entry.numpad || original.key === entry.navigation;
        });
        // Observe native input without consuming, translating or sending another command.
        if (direction) highlight(direction);
    }
    function position() {
        var pad = document.getElementById("direction_pad");
        var canvas = document.getElementById("dungeon"), root = document.getElementById("left_column");
        if (!pad || !canvas || !root) return;
        var bounds = canvas.getBoundingClientRect(), parent = root.getBoundingClientRect();
        pad.style.visibility = bounds.width < pad.offsetWidth + 16 || bounds.height < pad.offsetHeight + 16 ? "hidden" : "";
        // The canvas keeps its native dimensions and pointer coordinates.
        pad.style.left = Math.max(8, bounds.right - parent.left - pad.offsetWidth - 10) + "px";
        pad.style.top = Math.max(8, bounds.bottom - parent.top - pad.offsetHeight - 10) + "px";
    }
    function update() {
        var blocked = reason();
        if (blocked) clearHighlight();
        $("#direction_pad button").prop("disabled", Boolean(blocked)).each(function (index) {
            var direction = directions[index], showNumber = !assignedKeys.has(direction.numpad);
            var label = "Move or attack " + direction.name.toLowerCase() + ": " + direction.letter
                + (showNumber ? " or Numpad " + direction.numpad : "");
            $(this).attr("aria-label", label).find(".direction-pad-numpad").toggle(showNumber);
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
            if (index === 4) grid.append("<span class='direction-pad-center' aria-hidden='true'></span>");
            var label = "Move or attack " + direction.name.toLowerCase() + ": " + direction.letter
                + " or Numpad " + direction.numpad;
            $("<button type='button' class='direction-pad-button'></button>")
                .attr({ "data-direction": direction.name.toLowerCase(), "aria-label": label,
                    "aria-keyshortcuts": direction.letter, title: label })
                .append($("<span class='direction-pad-arrow' aria-hidden='true'></span>").text(direction.arrow),
                    $("<span class='direction-pad-keys' aria-hidden='true'></span>")
                        .append($("<kbd></kbd>").text(direction.letter),
                            $("<span class='direction-pad-numpad'></span>")
                                .append(" · ", $("<kbd></kbd>").text(direction.numpad))))
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
        observer.observe(pad[0]);
        update();
    }
    $(document).on("game_init.directionPad", init)
        .on("game_keydown.directionPad game_keypress.directionPad", onKey)
        .on("quickbar_bindings_changed.directionPad", function (event, shortcuts) {
            assignedKeys = new Set(shortcuts); refresh();
        })
        .on("party_state_rendered.directionPad game_actions_changed.directionPad game_popup_changed.directionPad game_ui_changed.directionPad hud_workspace_changed.directionPad", refresh)
        .on("game_cleanup.directionPad", function () {
            refresh.cancel();
            clearHighlight();
            assignedKeys.clear();
            if (observer) observer.disconnect();
            observer = null;
            $("#direction_pad").remove();
        });
    $(window).on("resize.directionPad", refresh);
    return { init: init };
});
