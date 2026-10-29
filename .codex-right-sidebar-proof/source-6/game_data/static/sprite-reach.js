/* Conservative atlas and per-doll extents for clipped chunk repainting. */
define(["./tileinfos"], function (tileinfos) {
    "use strict";
    var cached;
    function atlasReach() {
        if (cached) return cached;
        var pixels = 32;
        ["FLOOR_MAX", "WALL_MAX", "FEAT_MAX", "PLAYER_MAX", "MAIN_MAX", "GUI_MAX", "ICONS_MAX"].forEach(function (name, texture) {
            var atlas = tileinfos(texture), end = atlas[name];
            for (var index = 0; index < end; index++) {
                var info = atlas.get_tile_info(index);
                if (!info) continue;
                // Cover centered and non-centered draws in both directions.
                pixels = Math.max(pixels, Math.abs(info.ox) + info.w, Math.abs(info.oy) + info.h);
            }
        });
        cached = Math.ceil(pixels / 32) + 1;
        return cached;
    }
    function reach(cell) {
        var extra = 0;
        if (cell && cell.mcache) cell.mcache.forEach(function (part) {
            if (part) extra = Math.max(extra, Math.abs(part[1] || 0), Math.abs(part[2] || 0));
        });
        return atlasReach() + Math.ceil(extra / 32);
    }
    return reach;
});
