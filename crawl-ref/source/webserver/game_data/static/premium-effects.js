define(["jquery", "./cell-renderer-layers", "./premium-effect-model", "./premium-terrain-model", "./map_knowledge",
        "./options", "./game-context", "./enums", "./premium-light-field", "visual-presentation", "effect-shading"],
function ($, layers, model, terrain, map, options, game, enums, field, presentation, shader) {
    "use strict";
    var originals = new Map(), frames = new Map(), motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function clear() { originals.clear(); frames.clear(); }
    function fast() { return presentation.premium() && presentation.animated() && !motion.matches && !document.hidden && options.ready()
        && ["clouds", "spells", "materials", "auras"].some(presentation.enabled)
        && options.get("tile_display_mode") === "tiles" && game.get_ui_state() === enums.ui.NORMAL; }
    function draw(renderer, index, kind, cx, cy, x, y) {
        var profile = model.describe(index, kind);
        if (!profile || !presentation.enabled(kind === "cloud" ? "clouds" : "spells") || !options.ready() || !renderer.view
            || options.get("tile_display_mode") !== "tiles" || game.get_ui_state() !== enums.ui.NORMAL
            || !terrain.describe(map.get(cx, cy))) return false;
        var source = originals.get(index);
        if (!source) {
            var sample = document.createElement("canvas"); sample.width = sample.height = 32;
            var context = sample.getContext("2d", { willReadFrequently: true });
            if (!context) return false;
            var proxy = Object.create(renderer);
            Object.assign(proxy, { ctx: context, element: sample, cell_width: 32, cell_height: 32,
                x_scale: 1 / window.devicePixelRatio, y_scale: 1 / window.devicePixelRatio,
                current_left_overlap: 0, current_sy: 0, scaled_size: function () { return { width: 32, height: 32 }; } });
            proxy.draw_main(index, 0, 0);
            source = shader.prepare(context.getImageData(0, 0, 32, 32).data, 32, 32);
            originals.set(index, source);
            if (originals.size > 96) originals.delete(originals.keys().next().value);
        }
        var animated = presentation.animated() && !motion.matches && options.get("tile_realtime_anim") && options.get("tile_misc_anim");
        var now = Number.isFinite(renderer.frame_time) ? renderer.frame_time : window.performance.now();
        var phase = animated ? Math.floor(now / 100) % 65536 : 0;
        var lights = presentation.enabled("lighting") ? field.forView(renderer).at(cx, cy) : [];
        var key = [index, cx, cy, phase, lights.map(function (light) {
            return [light.x, light.y, light.radius, light.strength, light.colour, light.visibility].join(":");
        }).join(";")].join("|");
        var frame = frames.get(key);
        if (!frame) {
            frame = document.createElement("canvas"); frame.width = frame.height = 32;
            var ctx = frame.getContext("2d");
            if (!ctx) return false;
            var pixels = ctx.createImageData(32, 32);
            pixels.data.set(shader.shade(source, profile, cx, cy, phase, lights)); ctx.putImageData(pixels, 0, 0);
            frames.set(key, frame);
            if (frames.size > 192) frames.delete(frames.keys().next().value);
        }
        var size = renderer.scaled_size();
        renderer.ctx.save();
        try {
            renderer.ctx.beginPath(); renderer.ctx.rect(x, y, size.width, size.height); renderer.ctx.clip();
            renderer.ctx.imageSmoothingEnabled = false;
            renderer.ctx.drawImage(frame, x, y, size.width, size.height);
        } finally { renderer.ctx.restore(); }
        return true;
    }
    layers.addEffectPainter(draw);
    $(document).on("game_init.premiumEffects game_cleanup.premiumEffects map_knowledge_cleared.premiumEffects visual_presentation_changed.premiumEffects texture_pack_changed.premiumEffects art_materials_ready.premiumEffects", clear);
    motion.addEventListener("change", function () { clear(); $(document).trigger("premium_animation_cadence_changed"); });
    return { draw: draw, clear: clear, fast: fast, animated: function (cell) {
        var material = cell && terrain.describe({ t: cell });
        return fast() && options.get("tile_misc_anim")
            && Boolean(cell && (presentation.enabled("clouds") && cell.cloud && model.describe(typeof cell.cloud === "number" ? cell.cloud : cell.cloud.value, "cloud")
                || presentation.enabled("spells") && (cell.ov || []).some(function (id) { return model.describe(id, "overlay"); })
                || presentation.enabled("materials") && material && material.solid && (material.shading === "crystal" || material.shading === "glass")));
    } };
});
