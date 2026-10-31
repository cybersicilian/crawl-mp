/* Connected wall lips use only the client's already-visible native terrain. */
define(["jquery", "tile-edges", "./terrain-materials", "./tileinfo-dngn", "./map_knowledge", "./enums", "texture-pack"],
function ($, edges, regions, tiles, map, enums, texturePack) {
    "use strict";
    var types = new Map(), known = new Map();
    Object.keys(regions).forEach(function (id) {
        regions[id].forEach(function (region) { types.set(region.tile, id); });
    });
    var styles = {
        wall: { shadow: "#101710cc", light: "#d8c79960", width: 1 },
        floor: { shadow: "#0a120f66", width: 2 }
    };
    function index(cell) {
        if (!cell || !cell.t) return null;
        var bg = enums.prepare_bg_flags(cell.t.bg || 0);
        if (bg.UNSEEN || bg.MM_UNSEEN || bg.value <= tiles.DNGN_ERROR) return null;
        return bg.value;
    }
    function kind(cell) {
        var idx = index(cell);
        return idx === null ? null : types.get(idx) || (tiles.get_img(idx) === "wall" ? "wall" : "other");
    }
    function connects(self, other) { return self === "wall" ? other === "wall" : other !== "wall"; }
    function draw(renderer, cx, cy, x, y) {
        if (!texturePack.illustrated()) return;
        if (!Number.isInteger(cx) || !Number.isInteger(cy)) return;
        var cell = map.get(cx, cy);
        if (!types.has(index(cell))) return;
        var own = kind(cell);
        if (!styles[own]) return;
        var neighbours = edges.sides.map(function (side) { return kind(map.get(cx + side.x, cy + side.y)); });
        var mask = edges.mask(own, neighbours, connects), size = renderer.scaled_size();
        edges.paint(renderer.ctx, { x: x, y: y, width: size.width, height: size.height }, mask, styles[own]);
    }
    $(document).on("map_knowledge_changed.terrainEdges", function (event, changed) {
        if (!texturePack.illustrated()) return;
        (changed || []).forEach(function (loc) {
            var key = loc.x + ":" + loc.y, value = kind(map.get(loc.x, loc.y));
            if (known.get(key) !== value) {
                known.set(key, value);
                edges.sides.forEach(function (side) {
                    var x = loc.x + side.x, y = loc.y + side.y;
                    if (map.get(x, y).t) map.touch(x, y);
                });
            }
        });
    }).on("game_init.terrainEdges game_cleanup.terrainEdges map_knowledge_cleared.terrainEdges texture_pack_changed.terrainEdges", function () { known.clear(); });
    return { draw: draw };
});
