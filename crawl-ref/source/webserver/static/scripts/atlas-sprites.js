/* Cached, opt-in sprite replacement within existing atlas rectangles. */
define([], function () {
    "use strict";
    function create() {
        var cache = new WeakMap(), crops = new WeakMap();
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
        function image(source, sheet, regions) {
            if (!source || !sheet || !sheet.complete || !sheet.naturalWidth || !regions.length) return source;
            var width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
            var version = [sheet.currentSrc || sheet.src, sheet.naturalWidth, sheet.naturalHeight].join(":");
            var old = cache.get(source);
            if (old && old.version === version && old.regions === regions) return old.result;
            var result = source;
            try {
                var canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
                var context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas unavailable");
                context.drawImage(source, 0, 0);
                regions.forEach(function (region) {
                    var rect = region.sprite;
                    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > sheet.naturalWidth
                        || rect.y + rect.h > sheet.naturalHeight || region.x < 0 || region.y < 0
                        || region.w <= 0 || region.h <= 0 || region.x + region.w > width || region.y + region.h > height)
                        throw new Error("Sprite rectangle outside sheet");
                    var bounds = crop(sheet, rect, version), scale = Math.min(region.w / bounds.w, region.h / bounds.h);
                    var w = bounds.w * scale, h = bounds.h * scale;
                    context.save();
                    context.beginPath(); context.rect(region.x, region.y, region.w, region.h); context.clip();
                    context.clearRect(region.x, region.y, region.w, region.h);
                    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
                    context.filter = "brightness(" + (region.brightness || 1) + ") contrast(" + (region.contrast || 1) + ")";
                    if (region.outline) {
                        context.shadowColor = region.outline.color;
                        context.shadowBlur = region.outline.blur || 0;
                    }
                    context.translate(region.x + region.w / 2, region.y + region.h);
                    if (region.mirror) context.scale(-1, 1);
                    context.drawImage(sheet, bounds.x, bounds.y, bounds.w, bounds.h, -w / 2, -h, w, h);
                    context.restore();
                });
                result = canvas;
            } catch (error) {
                // Unreadable or invalid sheets retain the complete native atlas.
                result = source;
            }
            cache.set(source, { version: version, regions: regions, result: result });
            return result;
        }
        return { image: image };
    }
    return { create: create };
});
