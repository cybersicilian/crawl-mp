define(["jquery", "./game-context", "./status-icons", "./enums"], function ($, game, icons, enums) {
    "use strict";
    var levels = [.5, .75, 1, 1.25, 1.5, 2, 2.5, 3, 4], factor = 1, wheel = 0;
    var storageKey = "dcss.viewport.zoom.v1";
    function update() {
        var available = game.get_ui_state && game.get_ui_state() === enums.ui.NORMAL;
        var percent = Math.round(factor * 100) + "%";
        $("#hud_zoom_out").prop("disabled", !available || factor === levels[0]);
        $("#hud_zoom_in").prop("disabled", !available || factor === levels[levels.length - 1]);
        $("#hud_zoom_reset").prop("disabled", !available || factor === 1);
        $("#hud_zoom_status").text("Dungeon zoom " + percent);
    }
    function set(value) {
        if (!levels.includes(value) || !game.set_view_zoom(value)) return;
        factor = value;
        try { localStorage.setItem(storageKey, String(factor)); } catch (error) { /* Session-only zoom. */ }
        update();
    }
    function step(direction) {
        if (!game.get_ui_state || game.get_ui_state() !== enums.ui.NORMAL) return;
        var next = Math.max(0, Math.min(levels.length - 1, levels.indexOf(factor) + direction));
        if (levels[next] !== factor) set(levels[next]);
    }
    function init() {
        var banner = document.getElementById("party_turn_banner");
        if (!banner || document.getElementById("hud_zoom_controls")) return;
        try {
            var saved = Number(localStorage.getItem(storageKey));
            factor = levels.includes(saved) ? saved : 1;
        } catch (error) { factor = 1; }
        game.set_view_zoom(factor);
        var group = $("<span id='hud_zoom_controls' role='group' aria-label='Dungeon zoom'></span>");
        [["out", "zoom-out", "Zoom out", -1], ["reset", "zoom-reset", "Reset dungeon zoom", 0], ["in", "zoom-in", "Zoom in", 1]]
            .forEach(function (entry) {
                $("<button type='button' class='party-banner-btn'></button>")
                    .attr({ id: "hud_zoom_" + entry[0], "aria-label": entry[2], "data-tip-title": entry[2],
                        "data-tip-meta": "50–400% · Mouse wheel over the dungeon also zooms.",
                        "data-tip-body": entry[0] === "reset" ? "Restore the normal dungeon view."
                            : entry[0] === "in" ? "Enlarge dungeon tiles for a closer view. Fewer tiles fit on screen."
                            : "Show more dungeon tiles at a smaller size." })
                    .append(icons.icon(entry[1])).on("click", function (event) {
                        event.stopPropagation(); if (entry[3]) step(entry[3]); else set(1);
                    }).appendTo(group);
            });
        group.append($("<span id='hud_zoom_status' class='hud-icon-only-label' role='status' aria-live='polite'></span>"));
        group.on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        var cycle = document.getElementById("party_banner_cycle");
        if (cycle) group.insertBefore(cycle); else group.appendTo(banner);
        var canvas = document.getElementById("dungeon");
        if (canvas) canvas.addEventListener("wheel", function (event) {
            if (game.get_ui_state() !== enums.ui.NORMAL) return;
            event.preventDefault();
            wheel += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
            if (Math.abs(wheel) >= 40) { step(wheel < 0 ? 1 : -1); wheel = 0; }
        }, { passive: false });
        update();
    }
    $(document).on("game_input_changed.viewportZoom game_actions_changed.viewportZoom", update)
        .on("game_cleanup.viewportZoom", function () { wheel = 0; });
    return { init: init };
});
