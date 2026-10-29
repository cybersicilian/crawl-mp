/* New ground families use the existing alpha-preserving material compositor. */
define(["./tileinfo-dngn", "./environment-art"], function (tiles, art) {
    "use strict";
    var regions = { floor: [] }, sheet = art.ground;
    sheet.entries.forEach(function (entry, cell) {
        entry.names.forEach(function (name) {
            var base = tiles[name];
            if (typeof base !== "number") return;
            for (var n = 0; n < tiles.tile_count(base); n++) {
                var idx = base + n, info = tiles.get_tile_info(idx);
                if (!info || tiles.get_img(idx) !== "floor" || tiles.basetile(idx) !== base) continue;
                regions.floor.push({ tile: idx, x: info.sx, y: info.sy, w: info.ex - info.sx, h: info.ey - info.sy,
                    material: { x: cell % sheet.columns * sheet.cell + n % 2 * 256,
                        y: Math.floor(cell / sheet.columns) * sheet.cell + Math.floor(n / 2) % 2 * 256,
                        w: 256, h: 256 }, turns: Math.floor(n / 4) % 4, shade: entry.shade, detail: 0.04 });
            }
        });
    });
    return regions;
});
