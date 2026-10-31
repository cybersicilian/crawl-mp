/* Visible native floor knowledge supplies the generic world-space material blender. */
define(["jquery", "terrain-surface", "./environment-art", "./environment-materials", "./terrain-materials",
        "./tileinfo-dngn", "./map_knowledge", "./enums", "texture-pack"],
function ($, surfaces, art, wilds, stone, tiles, map, enums, texturePack) {
    "use strict";
    var families = new Map(), materials = new Map(), known = new Map(), painter = surfaces.create({ cacheSize: 2048 });
    // Blended tiles per cell and index. Native packets mutate cells in place,
    // so entries around every changed position are dropped rather than compared.
    var blended = new Map();
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
    function forget(x, y) {
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
            var prefix = (x + ox) + ":" + (y + oy) + ":";
            blended.forEach(function (value, key) { if (key.indexOf(prefix) === 0) blended.delete(key); });
        }
    }
    function compose(entry, idx, cx, cy) {
        var own = family(entry);
        if (!own || families.get(idx) !== own) return null;
        var neighbours = surfaces.offsets.map(function (offset) {
            return family(map.get(cx + offset.x, cy + offset.y));
        });
        [own].concat(neighbours).forEach(function (material) {
            if (material) material.image = document.getElementById(material.id);
        });
        return painter.tile(own, neighbours, cx, cy);
    }
    function draw(view, idx, x, y, cx, cy) {
        if (!texturePack.illustrated()) return false;
        if (!Number.isInteger(cx) || !Number.isInteger(cy)) return false;
        var entry = map.get(cx, cy), key = cx + ":" + cy + ":" + idx, cached = blended.get(key), image;
        if (cached && cached.cell === entry.t) image = cached.image;
        else {
            image = compose(entry, idx, cx, cy);
            // Sheets that are still loading yield nothing; retry them next paint.
            if (image || !family(entry)) blended.set(key, { cell: entry.t, image: image });
            if (blended.size > 8192) blended.clear();
        }
        if (!image) return false;
        var size = view.scaled_size();
        view.ctx.save(); view.ctx.imageSmoothingEnabled = false;
        view.ctx.drawImage(image, x, y, size.width, size.height); view.ctx.restore();
        return true;
    }
    $(document).on("map_knowledge_changed.environmentGround", function (event, changed) {
        if (!texturePack.illustrated()) return;
        (changed || []).forEach(function (loc) {
            forget(loc.x, loc.y);
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
        function () { known.clear(); painter.clear(); blended.clear(); });
    return { draw: draw };
});
