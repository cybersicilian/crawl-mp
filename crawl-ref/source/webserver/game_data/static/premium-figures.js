/* DCSS adapter: visible creatures and floor items receive the light around them.
 * Native sprite choice, position, order and targeting stay exactly as they were. */
define(["jquery", "./cell-renderer-layers", "./map_knowledge", "./options", "./game-context", "./enums", "./premium-light-field", "./premium-terrain-model",
    "./premium-terrain", "visual-presentation", "figure-shading", "./shell-animation", "shore-field"],
function ($, layers, map, options, game, enums, field, model, terrain, presentation, shading, shells, shores) {
    "use strict";
    var figures = shading.create(), extras = [], none = [], portraits = new Map();
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function active(renderer) {
        return presentation.enabled("figures") && options.ready() && options.get("tile_display_mode") === "tiles"
            && game.get_ui_state() === enums.ui.NORMAL && Boolean(renderer.view);
    }
    function lightsAt(renderer, cx, cy) {
        var lights = field.forView(renderer).at(cx, cy);
        extras.forEach(function (source) { lights = lights.concat(source(cx, cy) || none); });
        return lights;
    }
    // Everything that selects a figure's pixels. A moving shell has no stable
    // picture, so it is drawn fresh rather than retained.
    function identity(cell, fg, wading, cx, cy) {
        if (shells.posed(cx, cy)) return undefined;
        return [fg.value, cell.base || 0, cell.trans ? 1 : 0, wading ? 1 : 0, JSON.stringify(cell.doll || 0), JSON.stringify(cell.mcache || 0)].join("|");
    }
    // `present` is false for the half of a native cell paint with nothing to draw.
    function shade(renderer, cx, cy, x, y, entry, paint, present) {
        if (present === false || !entry || !entry.t || !active(renderer)) return paint;
        var cell = entry.t, bg = enums.prepare_bg_flags(cell.bg || 0), fg = enums.prepare_fg_flags(cell.fg || 0);
        if (bg.UNSEEN || bg.MM_UNSEEN) return paint;
        var own = model.describe(entry);
        if (!own || own.solid) return paint;
        var living = Boolean(entry.mon || (cell.doll || []).length || (cell.mcache || []).length);
        var wading = own.surface === "water" && !fg.FLYING;
        return function () {
            var size = renderer.scaled_size(), light = shading.gather(lightsAt(renderer, cx, cy), cx, cy);
            if (!wading && own.surface !== "lava") shading.shadow(renderer.ctx, x, y, size, light, !living ? "resting" : fg.FLYING ? "hovering" : "standing");
            var key = identity(cell, fg, wading, cx, cy);
            if (!living || !figures.dress(renderer, x, y, size, paint, light, key)) { paint(); return; }
            var picture = !wading && !fg.FLYING ? figures.portrait(size, light, key) : null;
            if (!picture) { portraits.delete(cx + ":" + cy); return; }
            portraits.set(cx + ":" + cy, { picture: picture, entry: entry, cell: cell, water: Boolean(own.surface) });
            if (portraits.size > 64) portraits.delete(portraits.keys().next().value);
        };
    }
    // Still water mirrors a figure on the tile directly above it.
    function reflect(renderer, cx, cy, x, y) {
        if (!presentation.enabled("reflections") || !active(renderer)) return;
        var found = portraits.get(cx + ":" + (cy - 1));
        if (!found) return;
        var above = map.get(cx, cy - 1), own = model.describe(map.get(cx, cy));
        if (above !== found.entry || above.t !== found.cell) { portraits.delete(cx + ":" + (cy - 1)); return; }
        if (!own || own.surface !== "water") return;
        var size = renderer.scaled_size(), info = terrain.snapshot(renderer, cx, cy);
        var moving = presentation.animated() && !motion.matches && options.get("tile_realtime_anim") && options.get("tile_water_anim");
        var time = moving && Number.isFinite(renderer.frame_time) ? renderer.frame_time / 1000 : 0;
        figures.reflect(renderer.ctx, x, y, size, found.picture, info && info.coast ? shores.surface(info.coast, cx, cy) : null,
            found.water ? 0 : Math.round(size.height * 7 / 32), time);
    }
    layers.addActorShader(shade);
    layers.addTerrainPainter(reflect);
    $(document).on("game_cleanup.premiumFigures map_knowledge_cleared.premiumFigures visual_presentation_changed.premiumFigures texture_pack_changed.premiumFigures art_materials_ready.premiumFigures", function () {
        figures.clear(); portraits.clear();
    });
    return { shade: shade, addLightSource: function (source) { extras.push(source); } };
});
