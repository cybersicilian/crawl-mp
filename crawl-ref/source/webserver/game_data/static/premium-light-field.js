/* One visibility/occlusion field shared by terrain shading and ambient effects. */
define(["jquery", "./map_knowledge", "./premium-terrain-model", "./options", "tile-lighting", "visual-presentation"],
function ($, map, model, options, lighting, presentation) {
    "use strict";
    var scene, signature, known = new Map();
    function clear() { scene = signature = null; }
    function read(x, y) {
        var cell = model.describe(map.get(x, y));
        if (cell && !["lighting", "reflections", "bloom", "spells"].some(presentation.enabled)) cell.light = null;
        if (cell && cell.effect && !((cell.effect === "water" || cell.effect === "lava") ? options.get("tile_water_anim") : options.get("tile_misc_anim")))
            cell.effect = null;
        if (cell && cell.light) cell.light = Object.assign({}, cell.light, { animated: Boolean(cell.effect) });
        if (cell && cell.emission) cell.emission = Object.assign({}, cell.emission, { animated: Boolean(cell.effect) });
        return cell;
    }
    function forView(view) {
        var key = [view.view.x, view.view.y, view.cols, view.rows].join(":");
        if (!scene || key !== signature) {
            scene = lighting.create({ x: view.view.x - 5, y: view.view.y - 5, cols: view.cols + 10, rows: view.rows + 10 }, read, 24);
            function inside(cell) { return cell.x >= view.view.x && cell.y >= view.view.y
                && cell.x < view.view.x + view.cols && cell.y < view.view.y + view.rows; }
            scene.cells = scene.cells.filter(inside); scene.floors = scene.floors.filter(inside);
            signature = key;
        }
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
                if (scene) scene.cells.forEach(function (entry) {
                    if (entry.x === pos.x && entry.y === pos.y) {
                        entry.occupied = cell.occupied;
                        if (entry.emission) entry.emission.blocked = cell.emission.blocked;
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
