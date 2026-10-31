/* Replace only existing tree visuals; decorative props have no placement side effects. */
define(["./tileinfo-dngn", "./environment-art"], function (tiles, art) {
    "use strict";
    var regions = { feat: [] }, sheet = art.sprites;
    sheet.entries.forEach(function (entry, cell) {
        entry.names.forEach(function (name) {
            var base = tiles[name];
            if (typeof base !== "number") return;
            for (var n = 0; n < tiles.tile_count(base); n++) {
                var idx = base + n, info = tiles.get_tile_info(idx);
                if (!info || tiles.get_img(idx) !== "feat" || tiles.basetile(idx) !== base) continue;
                var variant = cell === 0 ? n % 2 : cell;
                regions.feat.push(Object.assign({}, sheet.style, { tile: idx, x: info.sx, y: info.sy, w: info.ex - info.sx, h: info.ey - info.sy,
                    sprite: { x: variant % sheet.columns * sheet.cell,
                        y: Math.floor(variant / sheet.columns) * sheet.cell, w: sheet.cell, h: sheet.cell },
                    mirror: n % 2 === 1 }));
            }
        });
    });
    return regions;
});
