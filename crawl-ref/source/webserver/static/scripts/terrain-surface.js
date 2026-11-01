/* World-anchored periodic textures and cached eight-neighbour material blending. */
define(["weighted-cache"], function (weighted) {
    "use strict";
    var offsets = [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
        { x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 },
        { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    function modulo(value, period) { return (value % period + period) % period; }
    function create(options) {
        options = options || {};
        var cell = options.cell || 32, period = options.period || 4;
        var limit = options.cacheSize || 512, maxScale = options.maxScale || 4;
        if (![1, 2, 4].includes(maxScale)) throw new RangeError("Material scale must be 1, 2 or 4");
        var tiles = weighted.create(options.cacheBytes === undefined ? 8 * 1024 * 1024 : options.cacheBytes, limit,
            function (canvas) { return canvas.width * canvas.height * 4; });
        var surfaces = weighted.create(options.surfaceBytes === undefined ? 16 * 1024 * 1024 : options.surfaceBytes, 64,
            function (entry) { return entry.data.byteLength; });
        var hits = 0, misses = 0;
        // Canvas dimensions do not identify its pixels. New objects receive new
        // identities; consumers mutating one Canvas must advance material.revision.
        var identities = new WeakMap(), serial = 0;
        function resolution(requested) {
            var result = cell, target = Number.isFinite(requested) ? Math.min(requested, cell * maxScale) : cell;
            while (result < target) result *= 2;
            return result;
        }
        function surface(material, pixels) {
            var source = material.image, rect = material.rect;
            if (!source) return null;
            var canvasSource = typeof source.getContext === "function";
            var sourceWidth = canvasSource ? source.width : source.naturalWidth;
            var sourceHeight = canvasSource ? source.height : source.naturalHeight;
            if ((!canvasSource && !source.complete) || !sourceWidth || !sourceHeight) return null;
            if (canvasSource && !identities.has(source)) identities.set(source, ++serial);
            var identity = canvasSource ? "canvas:" + identities.get(source) + ":" + (material.revision || 0) : source.currentSrc || source.src;
            var version = [identity, sourceWidth, sourceHeight,
                rect.x, rect.y, rect.w, rect.h, material.shade, pixels].join(":");
            var key = JSON.stringify([material.key, pixels]), old = surfaces.get(key);
            if (old && old.version === version) return old;
            if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0
                || rect.x + rect.w > sourceWidth || rect.y + rect.h > sourceHeight) return null;
            var size = pixels * period;
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
            var ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
            ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
            var raw = ctx.getImageData(0, 0, size, size).data, data = new Uint8ClampedArray(raw.length);
            // At a wrap seam, use adjacent pixels from the swatch interior. The
            // opposite half's discontinuity fades to zero at the texture centre.
            // Share the periodic geometry across channels; no per-pixel arrays.
            var horizontal = new Float64Array(size);
            for (var ix = 0; ix < size; ix++) horizontal[ix] = (1 - Math.cos(2 * Math.PI * ix / size)) / 2;
            for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
                var wx = horizontal[x];
                var wy = (1 - Math.cos(2 * Math.PI * y / size)) / 2;
                var w0 = wx * wy, w1 = (1 - wx) * wy, w2 = wx * (1 - wy), w3 = (1 - wx) * (1 - wy);
                var shiftedX = modulo(x + size / 2, size), shiftedY = modulo(y + size / 2, size);
                var a = (y * size + x) * 4, b = (y * size + shiftedX) * 4;
                var c0 = (shiftedY * size + x) * 4, d = (shiftedY * size + shiftedX) * 4;
                for (var c = 0; c < 3; c++) {
                    var value = raw[a + c] * w0 + raw[b + c] * w1 + raw[c0 + c] * w2 + raw[d + c] * w3;
                    data[(y * size + x) * 4 + c] = value * (1 - (material.shade || 0));
                }
                data[(y * size + x) * 4 + 3] = 255;
            }
            var result = { version: version, data: data };
            return surfaces.set(key, result);
        }
        function feather(distance, along) {
            var width = 8 + 2 * Math.sin(along * Math.PI / 32) + Math.cos(along * Math.PI / 16);
            var t = Math.max(0, 1 - distance / width);
            return 0.5 * t * t * (3 - 2 * t);
        }
        function tile(material, neighbours, cx, cy, requestedPixels) {
            if (!Number.isInteger(cx) || !Number.isInteger(cy)) return null;
            var pixels = resolution(requestedPixels), size = pixels * period, scale = pixels / cell;
            var sources;
            try {
                sources = offsets.map(function (offset, index) {
                    return surface(index === 4 ? material : neighbours[index] || material, pixels);
                });
            } catch (error) { return null; }
            if (sources.some(function (entry) { return !entry; })) return null;
            var px = modulo(cx, period), py = modulo(cy, period);
            var key = [px, py].concat(sources.map(function (entry, index) {
                return (index === 4 ? material : neighbours[index] || material).key + ":" + entry.version;
            })).join("|");
            var old = tiles.get(key);
            if (old) { hits++; return old; }
            misses++;
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = pixels;
            var ctx = canvas.getContext("2d");
            if (!ctx) return null;
            var image = ctx.createImageData(pixels, pixels), allSame = sources.every(function (entry) { return entry === sources[4]; });
            for (var y = 0; y < pixels; y++) for (var x = 0; x < pixels; x++) {
                var gx = px * pixels + x, gy = py * pixels + y, sourceIndex = (gy * size + gx) * 4;
                var left = feather((x + 0.5) / scale, gy / scale), right = feather((pixels - x - 0.5) / scale, gy / scale);
                var top = feather((y + 0.5) / scale, gx / scale), bottom = feather((pixels - y - 0.5) / scale, gx / scale);
                var horizontal = [left, 1 - left - right, right], vertical = [top, 1 - top - bottom, bottom];
                for (var c = 0; c < 3; c++) {
                    var value = 0;
                    if (allSame) value = sources[4].data[sourceIndex + c];
                    else for (var n = 0; n < 9; n++)
                        value += sources[n].data[sourceIndex + c] * horizontal[n % 3] * vertical[Math.floor(n / 3)];
                    image.data[(y * pixels + x) * 4 + c] = value;
                }
                image.data[(y * pixels + x) * 4 + 3] = 255;
            }
            ctx.putImageData(image, 0, 0);
            return tiles.set(key, canvas);
        }
        return { tile: tile, clear: function () {
                tiles.clear(); surfaces.clear(); hits = misses = 0;
            }, cacheSize: function () { return tiles.stats().entries; },
            cacheStats: function () { return { tiles: tiles.stats().entries, tileBytes: tiles.stats().bytes,
                surfaces: surfaces.stats().entries, surfaceBytes: surfaces.stats().bytes, hits: hits, misses: misses }; } };
    }
    return { create: create, offsets: offsets };
});
