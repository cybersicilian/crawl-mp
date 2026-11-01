define(["jquery", "./cell-renderer-layers", "./premium-region-model", "./map_knowledge", "./options",
        "./game-context", "./enums", "visual-presentation", "region-field", "./premium-terrain", "aura-distortion", "pixel-sampling", "idle-work", "weighted-cache"],
function ($, layers, model, map, options, game, enums, presentation, regions, terrain, distortion, sampling, idle, weighted) {
    "use strict";
    var groups, viewKey, lastRenderer, frames = new Map(), known = new Map(), circleIndex = new Map(), none = [];
    var warps = weighted.create(16 * 1024 * 1024, 1024, function (image) { return image.width * image.height * 4; });
    var rasters = weighted.create(8 * 1024 * 1024, 1024, function (raster) { return raster.data.byteLength; });
    var circleGeometry = weighted.create(8 * 1024 * 1024, 512, function (prepared) { return prepared.bytes; });
    var identities = new WeakMap(), serial = 0;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function clear() { groups = viewKey = null; frames.clear(); warps.clear(); rasters.clear(); circleGeometry.clear(); circleIndex.clear(); paint = null; queue.clear(); }
    // Feature gates and the animation step are constant across one native
    // paint; resolve them once per paint clock rather than once per cell.
    var paint = null;
    function context(renderer) {
        var stamp = renderer.frame_time;
        if (paint && paint.renderer === renderer && stamp !== undefined && paint.stamp === stamp) return paint;
        var active = Boolean(renderer.view) && presentation.enabled("auras") && options.ready()
            && options.get("tile_display_mode") === "tiles" && game.get_ui_state() === enums.ui.NORMAL;
        paint = { renderer: renderer, stamp: stamp, active: active };
        if (!active) return paint;
        paint.animated = presentation.animated() && !motion.matches && options.get("tile_realtime_anim") && options.get("tile_misc_anim");
        var now = Number.isFinite(stamp) ? stamp : window.performance.now();
        paint.phase = paint.animated ? Math.floor(now / 100) : 0;
        return paint;
    }
    function circleFrame(group, cx, cy, colourPhase) {
        var geometryKey = [group.kind, group.center.x, group.center.y, group.radius, cx, cy].join(":");
        var key = geometryKey + ":" + colourPhase + ":circle", image = frames.get(key);
        if (image) return image;
        image = document.createElement("canvas"); image.width = image.height = 32;
        var ctx = image.getContext("2d"); if (!ctx) return null;
        var pixels = ctx.createImageData(32, 32), profile = model.profiles[group.kind];
        if (typeof regions.prepareCircle === "function" && typeof regions.circlePixels === "function") {
            var prepared = circleGeometry.get(geometryKey);
            if (!prepared) prepared = circleGeometry.set(geometryKey, regions.prepareCircle(group, cx, cy, 32, 32, profile));
            pixels.data.set(regions.circlePixels(prepared, colourPhase / 5));
        } else {
            // A still-cached older shared module retains the point sampler.
            for (var py = 0; py < 32; py++) for (var px = 0; px < 32; px++) {
                var sample = regions.circle(group, cx + (px + .5) / 32, cy + (py + .5) / 32, colourPhase / 5, profile);
                var n = (py * 32 + px) * 4; pixels.data.set(sample.colour, n); pixels.data[n + 3] = sample.alpha * 255;
            }
        }
        ctx.putImageData(pixels, 0, 0); bounded(frames, key, image);
        return image;
    }
    // Aura rings for the next colour step are rendered between paints, so the
    // step change costs a cache lookup per cell like any other frame. The queue
    // outlives individual paints; later paints only add to it.
    var queue = new Map(), queued = false;
    function warm(remaining) {
        var settings = paint, iterator = queue.entries(), next = iterator.next();
        var colourPhase = settings ? Math.floor(settings.phase / 2) + 1 : null;
        while (!next.done && remaining() > 0) {
            var entry = next.value[1];
            queue.delete(next.value[0]);
            if (colourPhase !== null && settings.active)
                entry.fields.forEach(function (group) { circleFrame(group, entry.cx, entry.cy, colourPhase); });
            next = iterator.next();
        }
        queued = queue.size > 0;
        return queued;
    }
    function bounded(cache, key, value) {
        cache.set(key, value);
        if (cache.size > 1024) cache.delete(cache.keys().next().value);
        return value;
    }
    function collect(renderer) {
        lastRenderer = renderer;
        if (groups && viewKey && viewKey.x === renderer.view.x && viewKey.y === renderer.view.y
            && viewKey.cols === renderer.cols && viewKey.rows === renderer.rows) return groups;
        var key = { x: renderer.view.x, y: renderer.view.y, cols: renderer.cols, rows: renderer.rows };
        var cells = [];
        for (var y = renderer.view.y - 2; y < renderer.view.y + renderer.rows + 2; y++)
            for (var x = renderer.view.x - 2; x < renderer.view.x + renderer.cols + 2; x++) {
                var fields = model.describe(map.get(x, y));
                known.set(x + ":" + y, fields.map(function (field) { return field.kind; }).sort().join(","));
                fields.forEach(function (field) { cells.push({ x: x, y: y, kind: field.kind }); });
            }
        groups = regions.create(cells); viewKey = key;
        // Index circular fields by the cells they cover, so painting each cell
        // is a lookup rather than a distance test against every field.
        circleIndex.clear();
        groups.forEach(function (group) {
            if (!model.profiles[group.kind].circular) return;
            var reach = group.radius * 1.27 + .71;
            for (var cy = Math.floor(group.center.y - reach) - 1; cy <= Math.ceil(group.center.y + reach) + 1; cy++)
                for (var cx = Math.floor(group.center.x - reach) - 1; cx <= Math.ceil(group.center.x + reach) + 1; cx++) {
                    if (Math.hypot(cx + .5 - group.center.x, cy + .5 - group.center.y) >= reach) continue;
                    var id = cx + ":" + cy, list = circleIndex.get(id);
                    if (!list) circleIndex.set(id, list = []);
                    list.push(group);
                }
        });
        if (known.size > 8192) known.clear();
        return groups;
    }
    // Frames are cached in world space; a field's identity covers the partial
    // view of it that a camera position produces.
    function identity(group) { return [group.center.x, group.center.y, group.cells.size].join(","); }
    function draw(renderer, index, cx, cy, x, y) {
        var kind = model.kind(index);
        if (!kind || !context(renderer).active) return false;
        if (model.profiles[kind].circular) return true;
        var group = collect(renderer).find(function (entry) { return entry.kind === kind && entry.cells.has(cx + ":" + cy); });
        if (!group) return false;
        var phase = Math.floor(paint.phase / 2);
        var key = [kind, cx, cy, phase, identity(group)].join(":"), image = frames.get(key);
        if (!image) {
            image = document.createElement("canvas"); image.width = image.height = 32;
            var ctx = image.getContext("2d"); if (!ctx) return false;
            var pixels = ctx.createImageData(32, 32), profile = model.profiles[kind];
            for (var py = 0; py < 32; py++) for (var px = 0; px < 32; px++) {
                var sample = regions.sample(group, cx + (px + .5) / 32, cy + (py + .5) / 32, phase / 5, profile);
                var n = (py * 32 + px) * 4;
                pixels.data.set(sample.colour, n); pixels.data[n + 3] = sample.alpha * 255;
            }
            ctx.putImageData(pixels, 0, 0); bounded(frames, key, image);
        }
        var size = renderer.scaled_size(); renderer.ctx.save();
        renderer.ctx.imageSmoothingEnabled = false; renderer.ctx.drawImage(image, x, y, size.width, size.height); renderer.ctx.restore();
        return true;
    }
    layers.addRegionPainter(draw);
    function circlesAt(renderer, cx, cy) {
        collect(renderer);
        return circleIndex.get(cx + ":" + cy) || none;
    }
    function sourceKey(source) {
        if (source.key !== undefined) return String(source.key);
        if (!identities.has(source)) identities.set(source, ++serial);
        return "source:" + identities.get(source);
    }
    function raster(source, renderer, cx, cy) {
        if (!source) return null;
        var key = sourceKey(source);
        var result = rasters.get(key);
        if (result) return result;
        var frame = source.image ? source : terrain.frame(renderer, cx, cy);
        if (!frame || sourceKey(frame) !== key) return null;
        var width = frame.image.width, height = frame.image.height, data;
        if (frame.pixels.length === width * height * 4) data = frame.pixels;
        else {
            var ctx = frame.image.getContext("2d");
            if (!ctx) return null;
            data = ctx.getImageData(0, 0, width, height).data;
        }
        return rasters.set(key, { data: data, width: width, height: height });
    }
    function ripple(renderer, fields, cx, cy, x, y, phase, animated) {
        if (!animated || !presentation.enabled("distortion") || !fields.length) return;
        // Validate source identities without resurrecting evicted high-resolution
        // canvases. Cached warp/raster pixels remain useful independently of them.
        var snapshot = terrain.snapshot || terrain.frame;
        var source = snapshot(renderer, cx, cy);
        if (!source || source.solid) return;
        var neighbours = [];
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
            var neighbour = ox || oy ? snapshot(renderer, cx + ox, cy + oy) : source;
            neighbours.push(neighbour && !neighbour.solid ? neighbour : null);
        }
        var width = source.width || source.image.width, height = source.height || source.image.height, scale = width / 32;
        var padding = Math.max(1, Math.ceil(.85 * scale));
        var key = [cx, cy, phase, width, height].concat(fields.map(function (group) {
            return [group.kind, group.center.x, group.center.y, group.radius].join(":");
        })).concat(neighbours.map(function (entry) { return entry ? sourceKey(entry) : "missing"; })).join("|"), cached = warps.get(key);
        if (!cached) {
            var inputs = neighbours.map(function (entry, index) {
                return raster(entry, renderer, cx + index % 3 - 1, cy + Math.floor(index / 3) - 1);
            });
            if (!inputs[4]) return;
            var halo = sampling.halo(inputs, width, height, padding);
            var canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
            var ctx = canvas.getContext("2d"); if (!ctx) return;
            var pixels = ctx.createImageData(width, height);
            pixels.data.set(sampling.warpHalo(halo, width, height, function (px, py) {
                var dx = 0, dy = 0;
                fields.forEach(function (group) {
                    var offset = distortion.displacement(group, cx + px / width, cy + py / height, phase / 10, model.profiles[group.kind]);
                    dx += offset.x; dy += offset.y;
                });
                var cap = Math.min(1, .85 / Math.max(.001, Math.hypot(dx, dy)));
                return { x: dx * cap * scale, y: dy * cap * scale };
            }, padding));
            ctx.putImageData(pixels, 0, 0);
            cached = warps.set(key, canvas);
        }
        var size = renderer.scaled_size(); renderer.ctx.drawImage(cached, x, y, size.width, size.height);
    }
    layers.addTerrainPainter(function (renderer, cx, cy, x, y) {
        var settings = context(renderer);
        if (!settings.active) return;
        var fields = circlesAt(renderer, cx, cy);
        if (!fields.length) return;
        var entry = map.get(cx, cy);
        if (!model.visible(entry)) return;
        var size = renderer.scaled_size(), phase = settings.phase, animated = settings.animated;
        ripple(renderer, fields, cx, cy, x, y, phase, animated);
        if (animated && idle) {
            queue.set(cx + ":" + cy, { cx: cx, cy: cy, fields: fields });
            if (!queued) { queued = true; idle.add("premium-regions", warm); }
        }
        var colourPhase = Math.floor(phase / 2);
        fields.forEach(function (group) {
            var image = circleFrame(group, cx, cy, colourPhase);
            if (!image) return;
            renderer.ctx.save(); renderer.ctx.imageSmoothingEnabled = false;
            renderer.ctx.drawImage(image, x, y, size.width, size.height); renderer.ctx.restore();
        });
    });
    $(document).on("map_knowledge_changed.premiumRegions", function (event, changed) {
        if (!presentation.premium()) { known.clear(); clear(); return; }
        var altered = (changed || []).some(function (pos) {
            var next = model.describe(map.get(pos.x, pos.y)).map(function (field) { return field.kind; }).sort().join(",");
            return (known.get(pos.x + ":" + pos.y) || "") !== next;
        });
        if (!altered) return;
        known.forEach(function (kind, id) {
            if (!kind) return;
            var parts = id.split(":"); if (map.get(Number(parts[0]), Number(parts[1])).t) map.touch(Number(parts[0]), Number(parts[1]));
        });
        if (lastRenderer) for (var y = lastRenderer.view.y; y < lastRenderer.view.y + lastRenderer.rows; y++)
            for (var x = lastRenderer.view.x; x < lastRenderer.view.x + lastRenderer.cols; x++) if (map.get(x, y).t) map.touch(x, y);
        clear();
    }).on("game_init.premiumRegions game_cleanup.premiumRegions map_knowledge_cleared.premiumRegions visual_presentation_changed.premiumRegions texture_pack_changed.premiumRegions art_materials_ready.premiumRegions", function () { known.clear(); clear(); });
    motion.addEventListener("change", clear); options.add_listener(clear);
    return { draw: draw, clear: clear, cacheStats: function () { return { warps: warps.stats(), rasters: rasters.stats(), circleGeometry: circleGeometry.stats() }; },
        animated: function (cell, cx, cy, renderer) {
        return presentation.enabled("auras") && presentation.animated() && !motion.matches && !document.hidden && options.get("tile_misc_anim")
            && options.ready() && options.get("tile_display_mode") === "tiles" && game.get_ui_state() === enums.ui.NORMAL
            && (model.describe({ t: cell }).length > 0 || renderer && circlesAt(renderer, cx, cy).length > 0);
    } };
});
