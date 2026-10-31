/* Only ordinary masonry and walkable stone opt into the painted material family. */
define(["./tileinfo-dngn"], function (tiles) {
    "use strict";
    var families = [
        { names: ["FLOOR_GREY_DIRT", "FLOOR_GREY_DIRT_B", "FLOOR_PEBBLE", "FLOOR_HALL", "FLOOR_LIMESTONE"], cell: 0, shade: 0.38 },
        { names: ["FLOOR_MOSS"], cell: 1, shade: 0.32 },
        { names: ["FLOOR_PEBBLE_DARKGRAY"], cell: 2, shade: 0.1 },
        { names: ["WALL_STONE_GRAY", "WALL_STONE_WHITE", "WALL_BRICK_GRAY"], cell: 3, shade: 0.02 },
        { names: ["WALL_VINES"], cell: 4, shade: 0.05 },
        { names: ["WALL_BRICK_DARK_1", "WALL_BRICK_DARK_2", "WALL_BRICK_DARK_3", "WALL_BRICK", "WALL_STONE_DARK"], cell: 5, shade: 0 }
    ];
    var regions = { floor: [], wall: [] };
    families.forEach(function (family) {
        family.names.forEach(function (name) {
            var base = tiles[name];
            if (typeof base !== "number") return;
            for (var n = 0; n < tiles.tile_count(base); n++) {
                var idx = base + n, info = tiles.get_tile_info(idx), id = tiles.get_img(idx);
                if (!info || !regions[id] || tiles.basetile(idx) !== base) continue;
                var floor = id === "floor", size = floor ? 256 : 512;
                regions[id].push({ tile: idx, x: info.sx, y: info.sy, w: info.ex - info.sx, h: info.ey - info.sy,
                    material: { x: family.cell % 3 * 512 + (floor ? n % 2 * 256 : 0),
                        y: Math.floor(family.cell / 3) * 512 + (floor ? Math.floor(n / 2) % 2 * 256 : 0),
                        w: size, h: size },
                    turns: floor ? Math.floor(n / 4) % 4 : 0, shade: family.shade, detail: floor ? 0.08 : 0.2,
                    border: floor ? { shadow: "#0b130f28", light: "#d2c7a314", width: 0.6 }
                        : { shadow: "#0b110f60", light: "#dfd3ad30", width: 1 } });
            }
        });
    });
    return regions;
});
