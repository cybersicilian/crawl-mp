define(["jquery", "./minimap"], function ($, minimap) {
    "use strict";
    function fit() {
        var map = document.getElementById("hud_bottom_map");
        if (!map) return;
        minimap.fit_to(map.clientWidth - 8); minimap.update_overlay();
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
        fit();
    }
    return { init: init, fit: fit };
});
