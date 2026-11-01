/* Visible native floor knowledge supplies the generic world-space material blender. */
define(["jquery", "terrain-surface", "./environment-art", "./environment-materials", "./terrain-materials",
        "./tileinfo-dngn", "./map_knowledge", "./enums", "texture-pack", "./tile-art-direction"],
function ($, surfaces, art, wilds, stone, tiles, map, enums, texturePack, direction) {
    "use strict";
    var families = new Map(), materials = new Map(), known = new Map(), painter = surfaces.create();
    art.ground.entries.forEach(function (entry, cell) {
        var material = { key: "wilds:" + cell, id: art.ground.id,
            rect: { x: cell % 3 * 512, y: Math.floor(cell / 3) * 512, w: 512, h: 512 }, shade: entry.shade };
        entry.names.forEach(function (name) {
            var base = tiles[name];
            wilds.floor.forEach(function (region) { if (tiles.basetile(region.tile) === base) families.set(region.tile, material); });
        });
    });
    stone.floor.forEach(function (region) {
        var cell = Math.floor(region.material.x / 512), key = "stone:" + cell;
        if (!materials.has(key)) materials.set(key, { key: key, id: "illustrated_materials",
            rect: { x: cell * 512, y: 0, w: 512, h: 512 }, shade: region.shade });
        families.set(region.tile, materials.get(key));
    });
    function family(cell) {
        if (!cell || !cell.t || cell.t.mangrove_water) return null;
        var bg = enums.prepare_bg_flags(cell.t.bg || 0);
        if (bg.UNSEEN || bg.MM_UNSEEN || bg.value <= tiles.DNGN_ERROR) return null;
        return families.get(bg.value) || (bg.value >= tiles.DNGN_FIRST_TRANSPARENT
            && cell.t.flv ? families.get(cell.t.flv.f) : null) || null;
    }
    function tile(idx, cx, cy, pixels) {
        if (!texturePack.illustrated()) return null;
        if (!Number.isInteger(cx) || !Number.isInteger(cy)) return null;
        var own = family(map.get(cx, cy));
        if (!own || families.get(idx) !== own) return null;
        var neighbours = surfaces.offsets.map(function (offset) {
            return family(map.get(cx + offset.x, cy + offset.y));
        });
        [own].concat(neighbours).forEach(function (material) {
            if (material) material.image = direction.requestSheet(material.id);
        });
        return painter.tile(own, neighbours, cx, cy, pixels);
    }
    function draw(view, idx, x, y, cx, cy) {
        var size = view.scaled_size();
        var image = tile(idx, cx, cy, Math.max(size.width, size.height));
        if (!image) return false;
        view.ctx.save(); view.ctx.imageSmoothingEnabled = false;
        view.ctx.drawImage(image, x, y, size.width, size.height); view.ctx.restore();
        return true;
    }
    $(document).on("map_knowledge_changed.environmentGround", function (event, changed) {
        if (!texturePack.illustrated()) return;
        (changed || []).forEach(function (loc) {
            var key = loc.x + ":" + loc.y, material = family(map.get(loc.x, loc.y));
            var value = material ? material.key : null;
            if (known.get(key) === value) return;
            known.set(key, value);
            surfaces.offsets.forEach(function (offset, index) {
                if (index !== 4 && map.get(loc.x + offset.x, loc.y + offset.y).t)
                    map.touch(loc.x + offset.x, loc.y + offset.y);
            });
        });
    }).on("game_init.environmentGround game_cleanup.environmentGround map_knowledge_cleared.environmentGround art_materials_ready.environmentGround texture_pack_changed.environmentGround",
        function () { known.clear(); painter.clear(); });
    return { draw: draw, tile: tile };
});
