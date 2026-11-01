define(["jquery", "./minimap", "./hud-layout"], function ($, minimap, hud) {
    "use strict";
    // Below this much spare width, a side strip costs the map more than the footer does.
    var MIN_SPARE = 150, MIN_WIDTH = 240, MAX_WIDTH = 380;
    var current = 0;
    function fit() {
        var map = document.getElementById("hud_bottom_map");
        if (!map) return;
        minimap.fit_to(document.getElementById("hud_minimap").clientWidth || map.clientWidth - 8);
        minimap.update_overlay();
    }
    /* The map is a square limited by height, so a wide column has unused width beside it.
       Taking the strip there lets the map use the column's full height. */
    function sideWidth(view) {
        var spare = view.width - view.height;
        return view.floating || spare < MIN_SPARE ? 0 : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, spare));
    }
    function place() {
        var left = document.getElementById("left_column");
        if (!left || !left.getClientRects().length) return;
        var width = sideWidth({ width: window.innerWidth - hud.sidebarWidth(), height: window.innerHeight - hud.height(),
            floating: $("#hud_bottom_map, #message_pane").is(".hud-floating") });
        if (width === current) return;
        current = width;
        document.body.classList.toggle("workflow-strip-beside-map", width > 0);
        left.style.setProperty("--hud-strip-width", width + "px");
        fit();
        $(document).trigger("hud_workspace_changed");
    }
    function init() {
        var $left = $("#left_column"); if (!$left.length) return;
        var $row = $("#hud_bottom_row");
        if (!$row.length) $row = $("<div id='hud_bottom_row'><div id='hud_bottom_map'>"
            + "<div id='hud_map_tools' role='toolbar' aria-label='Map and view controls'></div></div></div>").appendTo($left);
        $("#hud_minimap").prop("open", true).appendTo("#hud_bottom_map");
        $("#message_pane").appendTo($row);
        // Zoom, hero cycling and camera controls stay in the mission bar; the
        // map strip only keeps controls that were explicitly placed there.
        $("#hud_map_tools").off(".bottomInput").on("keydown.bottomInput keypress.bottomInput keyup.bottomInput", function (event) { event.stopPropagation(); });
        $(window).off("resize.bottomStrip").on("resize.bottomStrip", fit);
        // Every map layout re-checks, including the first one with the HUD on screen.
        $(document).off(".bottomStripLayout")
            .on("hud_workspace_changed.bottomStripLayout game_view_zoom_changed.bottomStripLayout", place);
        place(); fit();
    }
    $(document).on("game_cleanup.bottomStrip", function () {
        current = 0;
        document.body.classList.remove("workflow-strip-beside-map");
        $(document).off(".bottomStripLayout");
        $(window).off("resize.bottomStrip");
    });
    return { init: init, fit: fit, place: place, sideWidth: sideWidth };
});
