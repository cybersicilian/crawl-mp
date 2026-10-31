define(["jquery", "./game-context", "./status-icons", "./enums", "dom-update"], function ($, game, icons, enums, dom) {
    "use strict";
    // factor === null means "fit": the game sizes tiles so the full line of
    // sight fills the column. Numbers are explicit zoom levels the user chose.
    var levels = [.5, .75, 1, 1.25, 1.5, 2, 2.5, 3, 4], factor = null, wheel = 0;
    var storageKey = "dcss.viewport.zoom.v1";
    function effective() {
        if (factor !== null) return factor;
        var view = game.get_view_zoom && game.get_view_zoom();
        return view && Number.isFinite(view.factor) ? view.factor : 1;
    }
    function update() {
        var available = game.get_ui_state && game.get_ui_state() === enums.ui.NORMAL;
        var current = effective(), percent = Math.round(current * 100) + "%";
        $("#hud_zoom_out").prop("disabled", !available || current <= levels[0]);
        $("#hud_zoom_in").prop("disabled", !available || current >= levels[levels.length - 1]);
        $("#hud_zoom_reset").prop("disabled", !available || factor === null)
            .attr("aria-pressed", String(factor === null));
        dom.text(document.getElementById("hud_zoom_status"), factor === null ? "Dungeon zoom: fit to view, " + percent : "Dungeon zoom " + percent);
        dom.text(document.getElementById("hud_zoom_value"), factor === null ? "Fit" : percent);
        dom.attribute(document.getElementById("hud_zoom_value"), "title", factor === null ? "Fit to view · " + percent : "Dungeon zoom " + percent);
    }
    function set(value) {
        if (value !== null && !levels.includes(value)) return;
        if (!game.set_view_zoom(value)) return;
        factor = value;
        try { localStorage.setItem(storageKey, value === null ? "fit" : String(value)); } catch (error) { /* Session-only zoom. */ }
        update();
    }
    function step(direction) {
        if (!game.get_ui_state || game.get_ui_state() !== enums.ui.NORMAL) return;
        var current = effective(), next;
        if (direction > 0) next = levels.find(function (level) { return level > current + 0.001; });
        else next = levels.slice().reverse().find(function (level) { return level < current - 0.001; });
        if (next !== undefined && next !== factor) set(next);
    }
    function init() {
        var banner = document.getElementById("party_turn_banner");
        if (!banner || document.getElementById("hud_zoom_controls")) return;
        try {
            var saved = localStorage.getItem(storageKey);
            factor = saved === null || saved === "fit" ? null : levels.includes(Number(saved)) ? Number(saved) : null;
        } catch (error) { factor = null; }
        game.set_view_zoom(factor);
        var group = $("<span id='hud_zoom_controls' role='group' aria-label='Dungeon zoom'></span>");
        [["out", "zoom-out", "Zoom out", -1], ["reset", "zoom-reset", "Fit dungeon to view", 0], ["in", "zoom-in", "Zoom in", 1]]
            .forEach(function (entry) {
                $("<button type='button' class='party-banner-btn'></button>")
                    .attr({ id: "hud_zoom_" + entry[0], "aria-label": entry[2], "data-tip-title": entry[2],
                        "data-tip-meta": "Fit or 50–400% · Mouse wheel over the dungeon also zooms.",
                        "data-tip-body": entry[0] === "reset" ? "Size tiles so your hero's full line of sight fills the view."
                            : entry[0] === "in" ? "Enlarge dungeon tiles for a closer view. Fewer tiles fit on screen."
                            : "Show more dungeon tiles at a smaller size." })
                    .append(icons.icon(entry[1])).on("click", function (event) {
                        event.stopPropagation(); if (entry[3]) step(entry[3]); else set(null);
                    }).appendTo(group);
            });
        group.append($("<span id='hud_zoom_value' class='hud-zoom-value' aria-hidden='true'></span>"),
            $("<span id='hud_zoom_status' class='hud-icon-only-label' role='status' aria-live='polite'></span>"));
        group.on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        var tools = document.getElementById("mission_bar_tools"), cycle = document.getElementById("party_banner_cycle");
        if (tools) group.prependTo(tools); else if (cycle) group.insertBefore(cycle); else group.appendTo(banner);
        var canvas = document.getElementById("dungeon");
        if (canvas) canvas.addEventListener("wheel", function (event) {
            if (game.get_ui_state() !== enums.ui.NORMAL) return;
            event.preventDefault();
            wheel += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
            if (Math.abs(wheel) >= 40) { step(wheel < 0 ? 1 : -1); wheel = 0; }
        }, { passive: false });
        update();
    }
    $(document).on("game_input_changed.viewportZoom game_actions_changed.viewportZoom game_view_zoom_changed.viewportZoom", update)
        .on("game_cleanup.viewportZoom", function () { wheel = 0; });
    return { init: init };
});
