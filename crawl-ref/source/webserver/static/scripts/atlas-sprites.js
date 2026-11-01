/* Cached, opt-in sprite replacement within existing atlas rectangles. */
define(["weighted-cache"], function (weightedCache) {
    "use strict";
    function create() {
        var cache = new WeakMap(), crops = new WeakMap(), tiles = new WeakMap(), masks = new WeakMap();
        var detailKeys = new WeakMap();
        function detailKey(region, resolution) {
            var keys = detailKeys.get(region);
            if (!keys) { keys = new Map(); detailKeys.set(region, keys); }
            if (!keys.has(resolution)) keys.set(resolution, {});
            return keys.get(resolution);
        }
        function sourceVersion(source) {
            if (!source || source.complete === false) return "missing";
            var w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
            return w && h ? [source.currentSrc || source.src || "canvas", w, h].join(":") : "missing";
        }
        function maskHoles(source, region) {
            var bands = region.preserveAlpha;
            if (!bands) return [];
            bands = Array.isArray(bands) ? bands : [bands];
            if (!bands.length) return [];
            var revision = sourceVersion(source);
            if (revision === "missing") throw new Error("Native alpha source unavailable");
            var entry = masks.get(source);
            if (!entry || entry.version !== revision) {
                entry = { version: revision, regions: new Map() }; masks.set(source, entry);
            }
            if (entry.regions.has(region)) return entry.regions.get(region);
            if (!bands.every(function (band) {
                return band && [band.x, band.y, band.w, band.h].every(Number.isInteger) && band.x >= 0 && band.y >= 0
                    && band.w > 0 && band.h > 0 && band.x + band.w <= region.w && band.y + band.h <= region.h;
            }) || region.x < 0 || region.y < 0
                || region.x + region.w > (source.naturalWidth || source.width)
                || region.y + region.h > (source.naturalHeight || source.height))
                throw new Error("Invalid alpha preservation window");
            var canvas = document.createElement("canvas"); canvas.width = region.w; canvas.height = region.h;
            var ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) throw new Error("Canvas unavailable");
            ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
            var pixels = ctx.getImageData(0, 0, region.w, region.h).data, holes = [];
            bands.forEach(function (band) { for (var y = band.y; y < band.y + band.h; y++) {
                var start = -1;
                for (var x = band.x; x <= band.x + band.w; x++) {
                    var empty = x < band.x + band.w && pixels[(y * region.w + x) * 4 + 3] <= 12;
                    if (empty && start < 0) start = x;
                    if (!empty && start >= 0) { holes.push({ x: start, y: y, w: x - start, h: 1 }); start = -1; }
                }
            } });
            entry.regions.set(region, holes);
            if (entry.regions.size > 128) entry.regions.delete(entry.regions.keys().next().value);
            return holes;
        }
        function crop(sheet, rect, version) {
            var entry = crops.get(sheet);
            if (!entry || entry.version !== version) {
                var canvas = document.createElement("canvas");
                canvas.width = sheet.naturalWidth; canvas.height = sheet.naturalHeight;
                var context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas unavailable");
                context.drawImage(sheet, 0, 0);
                entry = { version: version, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
                    width: canvas.width, bounds: new Map() };
                crops.set(sheet, entry);
            }
            var key = [rect.x, rect.y, rect.w, rect.h].join(":"), bounds = entry.bounds.get(key);
            if (bounds) return bounds;
            var left = rect.w, top = rect.h, right = -1, bottom = -1;
            for (var y = 0; y < rect.h; y++) for (var x = 0; x < rect.w; x++) {
                if (entry.pixels[((rect.y + y) * entry.width + rect.x + x) * 4 + 3] <= 12) continue;
                left = Math.min(left, x); top = Math.min(top, y);
                right = Math.max(right, x); bottom = Math.max(bottom, y);
            }
            if (right < left) throw new Error("Empty sprite cell");
            bounds = { x: rect.x + left, y: rect.y + top, w: right - left + 1, h: bottom - top + 1 };
            entry.bounds.set(key, bounds);
            return bounds;
        }
        function paint(ctx, sheet, region, bounds, x, y, width, height, resolution, holes) {
            var scale = Math.min(width / bounds.w, height / bounds.h);
            var w = region.fit === "stretch" ? width : bounds.w * scale;
            var h = region.fit === "stretch" ? height : bounds.h * scale;
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
            ctx.clearRect(x, y, width, height);
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
            ctx.filter = "brightness(" + (region.brightness || 1) + ") contrast(" + (region.contrast || 1) + ")";
            if (region.outline) {
                ctx.shadowColor = region.outline.color; ctx.shadowBlur = (region.outline.blur || 0) * resolution;
            }
            ctx.translate(x + width / 2, y + height);
            if (region.mirror) ctx.scale(-1, 1);
            ctx.drawImage(sheet, bounds.x, bounds.y, bounds.w, bounds.h, -w / 2, -h, w, h);
            ctx.restore();
            (holes || []).forEach(function (hole) {
                ctx.clearRect(x + hole.x * resolution, y + hole.y * resolution, hole.w * resolution, hole.h * resolution);
            });
        }
        function ready(sheet) { return sheet && sheet.complete && sheet.naturalWidth > 0; }
        function version(sheet) {
            return ready(sheet) ? [sheet.currentSrc || sheet.src, sheet.naturalWidth, sheet.naturalHeight].join(":") : "missing";
        }
        function prepare(sheet, regions, width, height, nativeSource) {
            return regions.map(function (region) {
                var rect = region.sprite;
                if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0
                    || rect.x + rect.w > sheet.naturalWidth || rect.y + rect.h > sheet.naturalHeight
                    || region.x < 0 || region.y < 0 || region.w <= 0 || region.h <= 0
                    || region.x + region.w > width || region.y + region.h > height)
                    throw new Error("Sprite rectangle outside sheet");
                return { region: region, bounds: crop(sheet, rect, version(sheet)), holes: maskHoles(nativeSource, region) };
            });
        }
        function compose(source, groups, identity, revision) {
            if (!source || !groups.length) return source;
            var width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
            var old = cache.get(source);
            if (old && old.version === revision && old.identity === identity) return old.result;
            var result = source;
            try {
                var canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
                var context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas unavailable");
                context.drawImage(source, 0, 0);
                var painted = false;
                groups.forEach(function (group) {
                    // Validate and read the whole sheet before replacing pixels.
                    // A failed optional sheet must not discard another sheet.
                    var plan;
                    try { plan = prepare(group.sheet, group.regions, width, height, source); }
                    catch (error) { return; }
                    plan.forEach(function (entry) {
                        var region = entry.region;
                        paint(context, group.sheet, region, entry.bounds, region.x, region.y, region.w, region.h, 1, entry.holes);
                    });
                    painted = painted || plan.length > 0;
                });
                result = painted ? canvas : source;
            } catch (error) {
                // Unreadable or invalid sheets retain the complete native atlas.
                result = source;
            }
            cache.set(source, { version: revision, identity: identity, result: result });
            return result;
        }
        function image(source, sheet, regions) {
            if (!ready(sheet) || !regions.length) return source;
            return compose(source, [{ sheet: sheet, regions: regions }], regions, version(sheet));
        }
        function imageGroups(source, groups) {
            var active = groups.filter(function (group) { return ready(group.sheet) && group.regions.length; });
            if (!active.length) return source;
            var revision = groups.map(function (group) { return version(group.sheet); }).join("|");
            return compose(source, active, groups, revision);
        }
        // Keep authored detail until the final renderer scale. The native atlas
        // remains the fallback and still owns geometry, clipping and overlap.
        function tile(sheet, region, nativeSource, requestedScale) {
            if (!sheet || !sheet.complete || !sheet.naturalWidth) return null;
            var resolution = Number.isFinite(requestedScale) && requestedScale > 4 ? 8 : 4;
            var key = detailKey(region, resolution);
            var revision = version(sheet), nativeVersion = region.preserveAlpha ? sourceVersion(nativeSource) : "";
            var nativeMask = region.preserveAlpha ? nativeSource : null;
            var entry = tiles.get(sheet);
            if (!entry || entry.version !== revision) {
                entry = { version: revision, images: weightedCache.create(16 * 1024 * 1024, 128, function (value) {
                    return value.result ? value.result.width * value.result.height * 4 : 0;
                }) }; tiles.set(sheet, entry);
            }
            var old = entry.images.get(key);
            if (old && old.nativeVersion === nativeVersion && old.nativeSource === nativeMask) return old.result;
            var result = null;
            try {
                var rect = region.sprite;
                if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0
                    || rect.x + rect.w > sheet.naturalWidth || rect.y + rect.h > sheet.naturalHeight
                    || region.w <= 0 || region.h <= 0 || region.w > 64 || region.h > 64)
                    throw new Error("Invalid sprite geometry");
                var bounds = crop(sheet, rect, version(sheet)), holes = maskHoles(nativeSource, region);
                var canvas = document.createElement("canvas");
                canvas.width = region.w * resolution; canvas.height = region.h * resolution;
                var ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("Canvas unavailable");
                paint(ctx, sheet, region, bounds, 0, 0, canvas.width, canvas.height, resolution, holes);
                result = canvas;
            } catch (error) { /* Unreadable or empty art keeps native rendering. */ }
            entry.images.set(key, { result: result, nativeVersion: nativeVersion, nativeSource: nativeMask });
            return result;
        }
        return { image: image, imageGroups: imageGroups, tile: tile };
    }
    return { create: create };
});
