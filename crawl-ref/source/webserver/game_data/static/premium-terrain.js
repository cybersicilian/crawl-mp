define(["jquery", "./cell-renderer-layers", "./map_knowledge", "./options", "./game-context", "./enums",
        "./premium-terrain-model", "visual-presentation", "terrain-topology", "terrain-finish", "./premium-light-field", "surface-lighting", "liquid-field", "depth-shading", "terrain-blend", "wall-surface", "transparent-surface", "idle-work", "./environment-ground", "sampled-lighting", "weighted-cache"],
function ($, layers, map, options, game, enums, model, presentation, topology, finishes, field, shading, liquids, depth, blend, walls, optics, idle, ground, sampled, weighted) {
    "use strict";
    var painter = finishes.create(), known = new Map(), prepared = new Map(), originals = new Map();
    var shaded = weighted.create(16 * 1024 * 1024, 4096, function (result) {
        return result.image.width * result.image.height * 4 + result.pixels.byteLength;
    });
    // Per-cell memos. Native map packets mutate cells in place, so entries are
    // dropped around every changed position rather than compared structurally.
    var described = new Map(), cells = new Map();
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function bounded(cache, key, value, limit) {
        cache.set(key, value);
        if (cache.size > (limit || 192)) cache.delete(cache.keys().next().value);
        return value;
    }
    function clear() { known.clear(); painter.clear(); prepared.clear(); shaded.clear(); originals.clear(); described.clear(); cells.clear(); paint = null; queue.clear(); }
    function forget(x, y) {
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
            var id = (x + ox) + ":" + (y + oy);
            described.delete(id); cells.delete(id); queue.delete(id);
        }
    }
    function describeAt(cx, cy) {
        var entry = map.get(cx, cy), cell = entry && entry.t, id = cx + ":" + cy, memo = described.get(id);
        if (memo && memo.cell === cell && memo.mon === entry.mon) return memo.own;
        var own = model.describe(entry, { remembered: true });
        described.set(id, { cell: cell, mon: entry.mon, own: own });
        return own;
    }
    function lightsKey(lights, cx, cy) {
        var parts = [];
        for (var i = 0; i < lights.length; i++) {
            var light = lights[i];
            parts.push([light.x - cx, light.y - cy, light.radius, light.strength, light.colour, light.visibility].join(":"));
        }
        return parts.join(";");
    }
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
        return data ? bounded(originals, index, data, 1024) : null;
    }
    function albedo(renderer, terrain, neighbours, cx, cy, time, key, cell) {
        if (prepared.has(key)) return prepared.get(key);
        var painted = terrain.own.ground && ground.tile && ground.tile(terrain.own.index, cx, cy, 32);
        var raw = painted ? painted.getContext("2d").getImageData(0, 0, 32, 32).data : nativeSource(renderer, terrain.own.index);
        if (!raw) return null;
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        var detail;
        if (!painted && terrain.own.ground && presentation.enabled("borders")) {
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
        source.painted = Boolean(painted);
        if (terrain.own.solid && terrain.own.transmission && presentation.enabled("materials")) source.underlay = sampleData(renderer, function (sample) {
            return layers.paintUnderlay(sample, 0, 0, cell, cx, cy);
        });
        return bounded(prepared, key, source, 2048);
    }
    // Gates, clocks and feature flags are constant across one native paint;
    // they are resolved once per paint clock instead of once per cell.
    var paint = null, none = [];
    function paintSettings(renderer) {
        var stamp = renderer.frame_time, size = renderer.scaled_size(), requested = Math.max(size.width, size.height);
        var resolution = requested > 64 ? 128 : requested > 32 ? 64 : 32;
        if (paint && paint.renderer === renderer && stamp !== undefined && paint.stamp === stamp
            && paint.resolution === resolution) return paint;
        var active = presentation.premium() && options.ready() && options.get("tile_display_mode") === "tiles"
            && game.get_ui_state() === enums.ui.NORMAL && Boolean(renderer.view)
            && ["lighting", "borders", "materials", "liquids", "distortion"].some(presentation.enabled);
        paint = { renderer: renderer, stamp: stamp, active: active, resolution: resolution };
        if (!active) return paint;
        paint.animated = presentation.animated() && !motion.matches && options.get("tile_realtime_anim");
        paint.now = Number.isFinite(stamp) ? stamp : window.performance.now();
        paint.liquids = presentation.enabled("liquids"); paint.materials = presentation.enabled("materials");
        paint.lighting = presentation.enabled("lighting"); paint.reflections = presentation.enabled("reflections");
        paint.borders = presentation.enabled("borders");
        paint.time = paint.animated && paint.liquids && options.get("tile_water_anim") ? paint.now : 0;
        paint.misc = paint.animated && options.get("tile_misc_anim");
        paint.scene = paint.lighting || paint.reflections ? field.forView(renderer) : null;
        return paint;
    }
    // Animation steps for a cell at a clock offset from the paint.
    function clock(settings, own, ahead) {
        // Map memory keeps the material, while the native fog mesh still dims it.
        // A fixed phase avoids simulating activity outside the player's sight.
        var now = settings.now + ahead, time = own.visible && settings.time ? settings.time + ahead : 0;
        return { phase: own.surface ? Math.floor(time / (own.surface === "lava" ? 400 : 200)) % 256 : 0,
            materialPhase: settings.materials && (own.shading === "crystal" || own.transmission && own.solid)
                && settings.misc ? Math.floor(now / 200) : 0, time: time };
    }
    // Warm the shader caches for the next animation step of every animated cell
    // painted recently, so a step change repaints from caches like any other
    // frame. The queue outlives individual paints; later paints only add to it.
    var queue = new Map(), queued = false;
    function warm(remaining) {
        var settings = paint, iterator = queue.entries(), next = iterator.next();
        while (!next.done && remaining() > 0) {
            var entry = next.value[1];
            queue.delete(next.value[0]);
            if (settings && settings.active && settings.renderer === entry.renderer) {
                var step = clock(settings, entry.own, entry.ahead);
                if (step.phase !== entry.phase || step.materialPhase !== entry.materialPhase) {
                    var lights = settings.lighting ? settings.scene.at(entry.cx, entry.cy) : none;
                    render(settings.renderer, settings, entry.cx, entry.cy, entry.cell, entry.own, step, lights, lightsKey(lights, entry.cx, entry.cy));
                }
            }
            next = iterator.next();
        }
        queued = queue.size > 0;
        return queued;
    }
    function frame(renderer, cx, cy, cell, metadataOnly) {
        if (!Number.isInteger(cx) || !Number.isInteger(cy)) return;
        var settings = paintSettings(renderer);
        if (!settings.active) return;
        var entry = map.get(cx, cy), own = describeAt(cx, cy);
        cell = cell || entry && entry.t;
        if (!own || cell.mangrove_water || !own.relightable
            || !own.visible && (!own.surface || !settings.liquids)) return;
        var step = clock(settings, own, 0), phase = step.phase, materialPhase = step.materialPhase;
        var lights = own.visible && settings.lighting ? settings.scene.at(cx, cy) : none;
        var id = cx + ":" + cy, animated = own.visible && (own.surface && settings.time || materialPhase);
        if (animated && idle) {
            queue.set(id, { renderer: renderer, cx: cx, cy: cy, cell: cell, own: own, ahead: own.surface === "lava" ? 400 : 200,
                phase: phase, materialPhase: materialPhase });
            if (!queued) { queued = true; idle.add("premium-terrain", warm); }
        }
        // Unchanged cells repaint from their last frame: the surrounding
        // terrain, animation step and reaching lights are all still identical.
        var cached = cells.get(id), lightKeyNow = null;
        if (cached && cached.cell === cell && cached.phase === phase && cached.materialPhase === materialPhase
            && cached.resolution === settings.resolution) {
            var matches = cached.lights === lights;
            if (!matches) {
                lightKeyNow = lightsKey(lights, cx, cy); matches = lightKeyNow === cached.lightsKey;
                if (matches) cached.lights = lights;
            }
            if (matches && metadataOnly) return cached.descriptor;
            var retained = matches && shaded.get(cached.resultKey);
            if (retained) return retained;
        }
        var reaching = lightKeyNow === null ? lightsKey(lights, cx, cy) : lightKeyNow;
        var result = render(renderer, settings, cx, cy, cell, own, step, lights, reaching);
        if (!result) return;
        var descriptor = { key: result.key, width: result.image.width, height: result.image.height, solid: result.solid };
        cells.set(id, { cell: cell, phase: phase, materialPhase: materialPhase, resolution: settings.resolution,
            lights: lights, lightsKey: reaching, resultKey: result.key, descriptor: descriptor });
        return metadataOnly ? descriptor : result;
    }
    function render(renderer, settings, cx, cy, cell, own, step, lights, reaching) {
        var phase = step.phase, materialPhase = step.materialPhase;
        var neighbours = topology.sides.map(function (side) { return describeAt(cx + side.x, cy + side.y); });
        var surrounding = blend.offsets.map(function (offset) { return describeAt(cx + offset.x, cy + offset.y); });
        var terrain = topology.describe(own, neighbours);
        var coordinates = own.solid ? [cx, cy] : [(cx % 8 + 8) % 8, (cy % 8 + 8) % 8];
        var key = [own.surface || own.index, settings.liquids ? "" : own.index, own.depth, own.murky, terrain.wall, terrain.wet, terrain.hot, terrain.shore, terrain.depth,
            coordinates[0], coordinates[1], phase, own.transmission ? cell.flv && cell.flv.f : "",
            own.transmission ? (cell.ov || []).filter(function (id) { return id <= model.floorMax; }).join(",") : ""].concat(surrounding.map(function (entry) {
                return entry && entry.ground ? entry.index : "";
            })).join(":");
        var source = albedo(renderer, terrain, surrounding, cx, cy, step.time, key, cell);
        if (!source) return;
        // Source motion is composited continuously by the shared light-map pass;
        // static material lighting does not flash or invalidate the terrain cache.
        var lightKey = key + "|" + materialPhase + "|" + reaching + "|" + (source.painted ? settings.resolution : 32);
        var result = shaded.get(lightKey);
        if (!result) {
            var image = document.createElement("canvas"); image.width = image.height = 32;
            // Read back once for warps; a CPU-backed scratch canvas makes that a copy, not a GPU sync.
            var context = image.getContext("2d", { willReadFrequently: true });
            if (!context) return;
            var pixels = context.createImageData(32, 32);
            var detailed = source.painted && settings.resolution > 32
                ? ground.tile(own.index, cx, cy, settings.resolution) : null;
            var response = detailed && (settings.lighting || settings.materials) ? sampled.create(32, 32) : null;
            var colour = settings.lighting || settings.materials
                ? shading.shade(source, own.shading, cx, cy, lights, materialPhase, { reflections: settings.reflections }, response) : source.data;
            if (source.underlay) colour = optics.compose(source.underlay, source, colour, cx, cy,
                settings.reflections ? settings.scene.at(cx, cy) : none, materialPhase, own.transmission);
            pixels.data.set(colour); context.putImageData(pixels, 0, 0);
            var diagonal = describeAt(cx - 1, cy - 1);
            if (settings.materials || settings.borders) depth.paint(context, { x: 0, y: 0, width: 32, height: 32 }, own.solid,
                neighbours[0] && neighbours[0].solid && 1 - neighbours[0].transmission,
                neighbours[3] && neighbours[3].solid && 1 - neighbours[3].transmission,
                diagonal && diagonal.solid && 1 - diagonal.transmission, terrain.wall);
            result = { key: lightKey, image: image, pixels: context.getImageData(0, 0, 32, 32).data, solid: own.solid };
            if (detailed) {
                var size = detailed.width, high = document.createElement("canvas"); high.width = high.height = size;
                var ctx = high.getContext("2d", { willReadFrequently: true });
                if (ctx) {
                    ctx.drawImage(detailed, 0, 0);
                    painter.paint(ctx, terrain, { x: 0, y: 0, width: size, height: size }, cx, cy, step.time,
                        { borders: settings.borders, liquids: settings.liquids });
                    if (response) {
                        var data = ctx.getImageData(0, 0, size, size);
                        data.data.set(sampled.apply(data.data, size, size, response)); ctx.putImageData(data, 0, 0);
                    }
                    if (settings.materials || settings.borders) depth.paint(ctx, { x: 0, y: 0, width: size, height: size }, false,
                        neighbours[0] && neighbours[0].solid && 1 - neighbours[0].transmission,
                        neighbours[3] && neighbours[3].solid && 1 - neighbours[3].transmission,
                        diagonal && diagonal.solid && 1 - diagonal.transmission, terrain.wall);
                    result.image = high;
                }
            }
            shaded.set(lightKey, result);
        }
        return result;
    }
    function draw(renderer, cx, cy, x, y, cell, surfaceOnly) {
        if (!presentation.premium()) return false;
        var own = describeAt(cx, cy);
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
            forget(pos.x, pos.y);
            var own = model.describe(map.get(pos.x, pos.y), { remembered: true });
            var key = pos.x + ":" + pos.y;
            var signature = own ? [own.index, own.visible, own.solid, own.surface, own.depth, own.material].join(":") : "unseen";
            if (known.get(key) === signature) return;
            known.set(key, signature);
            blend.offsets.forEach(function (side) {
                var x = pos.x + side.x, y = pos.y + side.y;
                if (map.get(x, y).t) map.touch(x, y);
            });
        });
        if (known.size > 8192) known.clear();
    }).on("game_init.premiumTerrain game_cleanup.premiumTerrain map_knowledge_cleared.premiumTerrain visual_presentation_changed.premiumTerrain texture_pack_changed.premiumTerrain art_materials_ready.premiumTerrain", clear);
    options.add_listener(function () { described.clear(); cells.clear(); paint = null; });
    motion.addEventListener("change", function () { clear(); $(document).trigger("art_materials_ready"); });
    return { draw: draw, frame: frame, snapshot: function (renderer, cx, cy) { return frame(renderer, cx, cy, null, true); },
        cacheStats: shaded.stats };
});
