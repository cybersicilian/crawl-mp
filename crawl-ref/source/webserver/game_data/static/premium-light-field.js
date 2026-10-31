/* One visibility/occlusion field shared by terrain shading and ambient effects. */
define(["jquery", "./map_knowledge", "./premium-terrain-model", "./options", "tile-lighting", "visual-presentation"],
function ($, map, model, options, lighting, presentation) {
    "use strict";
    // The field is traced over a region larger than the viewport, so ordinary
    // camera steps reuse it; each view then reads a filtered window of it.
    var base, scene, signature, known = new Map();
    var margin = 5, slack = 8;
    function clear() { base = scene = signature = null; }
    function read(x, y) {
        var cell = model.describe(map.get(x, y));
        if (cell && !["lighting", "reflections", "bloom", "spells"].some(presentation.enabled)) cell.light = null;
        if (cell && cell.effect && !((cell.effect === "water" || cell.effect === "lava") ? options.get("tile_water_anim") : options.get("tile_misc_anim")))
            cell.effect = null;
        if (cell && cell.light) cell.light = Object.assign({}, cell.light, { animated: Boolean(cell.effect) });
        if (cell && cell.emission) cell.emission = Object.assign({}, cell.emission, { animated: Boolean(cell.effect) });
        return cell;
    }
    function covers(region, view) {
        return view.view.x - margin >= region.x && view.view.y - margin >= region.y
            && view.view.x + view.cols + margin <= region.x + region.cols
            && view.view.y + view.rows + margin <= region.y + region.rows;
    }
    function forView(view) {
        if (scene && signature.x === view.view.x && signature.y === view.view.y
            && signature.cols === view.cols && signature.rows === view.rows) return scene;
        var key = { x: view.view.x, y: view.view.y, cols: view.cols, rows: view.rows };
        if (!base || !covers(base.region, view)) {
            var region = { x: view.view.x - margin - slack, y: view.view.y - margin - slack,
                cols: view.cols + 2 * (margin + slack), rows: view.rows + 2 * (margin + slack) };
            base = lighting.create(region, read, 32);
            base.region = region; base.version = 0;
        }
        function inside(cell) { return cell.x >= view.view.x && cell.y >= view.view.y
            && cell.x < view.view.x + view.cols && cell.y < view.view.y + view.rows; }
        scene = { cells: base.cells.filter(inside), floors: base.floors.filter(inside), lights: base.lights,
            known: base.known, at: base.at, base: base };
        signature = key;
        return scene;
    }
    $(document).on("map_knowledge_changed.premiumLightField", function (event, changed) {
        if (!presentation.premium()) { known.clear(); clear(); return; }
        var geometryChanged = false;
        // A new/removed source or opened wall changes neighbouring tile light,
        // including tiles outside the native packet's dirty rectangle.
        (changed || []).forEach(function (pos) {
            var cell = model.describe(map.get(pos.x, pos.y));
            var id = pos.x + ":" + pos.y;
            var next = cell ? [cell.solid, cell.transmission, cell.surface, cell.effect, cell.light && cell.light.radius,
                cell.light && cell.light.colour, cell.light && cell.light.strength, cell.emission && cell.emission.type].join(":") : "unseen";
            if (known.get(id) === next) {
                if (base) base.cells.forEach(function (entry) {
                    if (entry.x === pos.x && entry.y === pos.y) {
                        if (entry.occupied !== cell.occupied) base.version++;
                        entry.occupied = cell.occupied;
                        if (entry.emission) {
                            if (entry.emission.blocked !== cell.emission.blocked) base.version++;
                            entry.emission.blocked = cell.emission.blocked;
                        }
                    }
                });
                return;
            }
            geometryChanged = true;
            known.set(id, next);
            for (var y = pos.y - 5; y <= pos.y + 5; y++) for (var x = pos.x - 5; x <= pos.x + 5; x++)
                if (model.describe(map.get(x, y))) map.touch(x, y);
        });
        if (geometryChanged) clear();
        if (known.size > 8192) known.clear();
    }).on("game_init.premiumLightField game_cleanup.premiumLightField map_knowledge_cleared.premiumLightField", function () {
        known.clear(); clear();
    }).on("visual_presentation_changed.premiumLightField", clear);
    options.add_listener(clear);
    return { forView: forView, clear: clear };
});
