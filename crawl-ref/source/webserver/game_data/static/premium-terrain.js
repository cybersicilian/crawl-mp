define(["jquery", "./cell-renderer-layers", "./map_knowledge", "./options", "./game-context", "./enums",
        "./premium-terrain-model", "visual-presentation", "terrain-topology", "terrain-finish", "./premium-light-field", "surface-lighting", "liquid-field", "depth-shading", "terrain-blend", "wall-surface", "transparent-surface"],
function ($, layers, map, options, game, enums, model, presentation, topology, finishes, field, shading, liquids, depth, blend, walls, optics) {
    "use strict";
    var painter = finishes.create(), known = new Map(), prepared = new Map(), shaded = new Map(), originals = new Map();
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function bounded(cache, key, value, limit) {
        cache.set(key, value);
        if (cache.size > (limit || 192)) cache.delete(cache.keys().next().value);
        return value;
    }
    function clear() { known.clear(); painter.clear(); prepared.clear(); shaded.clear(); originals.clear(); }
    function sampleData(renderer, paint) {
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        // Reuse native atlas selection, clipping and pack transforms. Sampling
        // never reads back the main game canvas or mutates its renderer state.
        var sample = Object.create(renderer);
        Object.assign(sample, { ctx: ctx, element: canvas, cell_width: 32, cell_height: 32,
            x_scale: 1 / window.devicePixelRatio, y_scale: 1 / window.devicePixelRatio,
            current_left_overlap: 0, current_sy: 0,
            scaled_size: function () { return { width: 32, height: 32 }; } });
        if (paint(sample) === false) return null;
        return ctx.getImageData(0, 0, 32, 32).data;
    }
    function nativeSource(renderer, index) {
        if (originals.has(index)) return originals.get(index);
        var data = sampleData(renderer, function (sample) { sample.draw_dngn(index, 0, 0); });
        return data ? bounded(originals, index, data, 256) : null;
    }
    function albedo(renderer, terrain, neighbours, cx, cy, time, key, cell) {
        if (prepared.has(key)) return prepared.get(key);
        var raw = nativeSource(renderer, terrain.own.index);
        if (!raw) return null;
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        var detail;
        if (terrain.own.ground && presentation.enabled("borders")) {
            detail = blend.pixels(neighbours.map(function (entry) {
                if (!entry || !entry.ground) return null;
                var source = nativeSource(renderer, entry.index);
                return source ? { data: source, material: entry.shading } : null;
            }), cx, cy, 32, 32);
        } else if (terrain.own.solid && presentation.enabled("materials")) detail = walls.prepare(raw, 32, 32, terrain.own.shading, cx, cy, terrain.wall);
        var pixels = ctx.createImageData(32, 32); pixels.data.set(detail ? detail.data : raw); ctx.putImageData(pixels, 0, 0);
        painter.paint(ctx, terrain, { x: 0, y: 0, width: 32, height: 32 }, cx, cy, time,
            { borders: presentation.enabled("borders"), liquids: presentation.enabled("liquids") });
        var phase = Math.floor(time / 200) % 256;
        var normals = terrain.own.surface === "water" && presentation.enabled("liquids") ? liquids.normals(cx * 32, cy * 32, phase, 32, 32) : detail && detail.normals;
        var source = shading.prepare(ctx.getImageData(0, 0, 32, 32).data, 32, 32, normals, detail);
        if (terrain.own.solid && terrain.own.transmission && presentation.enabled("materials")) source.underlay = sampleData(renderer, function (sample) {
            return layers.paintUnderlay(sample, 0, 0, cell, cx, cy);
        });
        return bounded(prepared, key, source, 384);
    }
    function frame(renderer, cx, cy, cell) {
        if (!presentation.premium() || !options.ready() || options.get("tile_display_mode") !== "tiles"
            || game.get_ui_state() !== enums.ui.NORMAL || !Number.isInteger(cx) || !Number.isInteger(cy)) return;
        if (!["lighting", "borders", "materials", "liquids", "distortion"].some(presentation.enabled)) return;
        var entry = map.get(cx, cy), own = model.describe(entry);
        cell = cell || entry && entry.t;
        if (!own || cell.mangrove_water || !own.relightable || !renderer.view) return;
        var neighbours = topology.sides.map(function (side) { return model.describe(map.get(cx + side.x, cy + side.y)); });
        var surrounding = blend.offsets.map(function (offset) { return model.describe(map.get(cx + offset.x, cy + offset.y)); });
        var terrain = topology.describe(own, neighbours);
        var animated = presentation.animated() && !motion.matches && options.get("tile_realtime_anim");
        var now = Number.isFinite(renderer.frame_time) ? renderer.frame_time : window.performance.now();
        var time = animated && presentation.enabled("liquids") && options.get("tile_water_anim") ? now : 0;
        var phase = own.surface ? Math.floor(time / (own.surface === "lava" ? 400 : 200)) % 256 : 0;
        var coordinates = own.solid ? [cx, cy] : [(cx % 8 + 8) % 8, (cy % 8 + 8) % 8];
        var key = [own.surface || own.index, presentation.enabled("liquids") ? "" : own.index, own.depth, own.murky, terrain.wall, terrain.wet, terrain.hot, terrain.shore, terrain.depth,
            coordinates[0], coordinates[1], phase, own.transmission ? cell.flv && cell.flv.f : "",
            own.transmission ? (cell.ov || []).filter(function (id) { return id <= model.floorMax; }).join(",") : ""].concat(surrounding.map(function (entry) {
                return entry && entry.ground ? entry.index : "";
            })).join(":");
        var source = albedo(renderer, terrain, surrounding, cx, cy, time, key, cell);
        if (!source) return;
        // Source motion is composited continuously by the shared light-map pass;
        // static material lighting does not flash or invalidate the terrain cache.
        var lights = presentation.enabled("lighting") ? field.forView(renderer).at(cx, cy) : [];
        var materialPhase = presentation.enabled("materials") && (own.shading === "crystal" || own.transmission && own.solid)
            && animated && options.get("tile_misc_anim") ? Math.floor(now / 200) : 0;
        var lightKey = key + "|" + materialPhase + "|" + lights.map(function (light) {
            return [light.x - cx, light.y - cy, light.radius, light.strength, light.colour, light.visibility].join(":");
        }).join(";");
        var result = shaded.get(lightKey);
        if (!result) {
            var image = document.createElement("canvas"); image.width = image.height = 32;
            var context = image.getContext("2d");
            if (!context) return;
            var pixels = context.createImageData(32, 32);
            var colour = presentation.enabled("lighting") || presentation.enabled("materials")
                ? shading.shade(source, own.shading, cx, cy, lights, materialPhase, { reflections: presentation.enabled("reflections") }) : source.data;
            if (source.underlay) colour = optics.compose(source.underlay, source, colour, cx, cy,
                presentation.enabled("reflections") ? field.forView(renderer).at(cx, cy) : [], materialPhase, own.transmission);
            pixels.data.set(colour); context.putImageData(pixels, 0, 0);
            var diagonal = model.describe(map.get(cx - 1, cy - 1));
            if (presentation.enabled("materials") || presentation.enabled("borders")) depth.paint(context, { x: 0, y: 0, width: 32, height: 32 }, own.solid,
                neighbours[0] && neighbours[0].solid && 1 - neighbours[0].transmission,
                neighbours[3] && neighbours[3].solid && 1 - neighbours[3].transmission,
                diagonal && diagonal.solid && 1 - diagonal.transmission, terrain.wall);
            result = { image: image, pixels: context.getImageData(0, 0, 32, 32).data, solid: own.solid };
            bounded(shaded, lightKey, result, 512);
        }
        return result;
    }
    function draw(renderer, cx, cy, x, y, cell, surfaceOnly) {
        var own = model.describe(map.get(cx, cy));
        if (!own || own.solid !== Boolean(surfaceOnly)) return false;
        var result = frame(renderer, cx, cy, cell);
        if (!result) return false;
        var size = renderer.scaled_size();
        renderer.ctx.save(); renderer.ctx.imageSmoothingEnabled = false;
        renderer.ctx.drawImage(result.image, x, y, size.width, size.height); renderer.ctx.restore();
        return true;
    }
    layers.addTerrainPainter(draw);
    layers.addSurfacePainter(function (renderer, cx, cy, x, y, cell) { return draw(renderer, cx, cy, x, y, cell, true); });
    $(document).on("map_knowledge_changed.premiumTerrain", function (event, changed) {
        if (!presentation.premium()) return;
        (changed || []).forEach(function (pos) {
            var own = model.describe(map.get(pos.x, pos.y));
            var key = pos.x + ":" + pos.y;
            var signature = own ? [own.index, own.solid, own.surface, own.depth, own.material].join(":") : "unseen";
            if (known.get(key) === signature) return;
            known.set(key, signature);
            blend.offsets.forEach(function (side) {
                var x = pos.x + side.x, y = pos.y + side.y;
                if (map.get(x, y).t) map.touch(x, y);
            });
        });
        if (known.size > 8192) known.clear();
    }).on("game_init.premiumTerrain game_cleanup.premiumTerrain map_knowledge_cleared.premiumTerrain visual_presentation_changed.premiumTerrain texture_pack_changed.premiumTerrain art_materials_ready.premiumTerrain", clear);
    motion.addEventListener("change", function () { clear(); $(document).trigger("art_materials_ready"); });
    return { draw: draw, frame: frame };
});
