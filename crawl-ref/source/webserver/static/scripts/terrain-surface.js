/* World-anchored periodic textures and cached eight-neighbour material blending. */
define([], function () {
    "use strict";
    var offsets = [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
        { x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 },
        { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    function modulo(value, period) { return (value % period + period) % period; }
    function create(options) {
        options = options || {};
        var cell = options.cell || 32, period = options.period || 4, size = cell * period;
        var limit = options.cacheSize || 512, tiles = new Map(), surfaces = new Map();
        function surface(material) {
            var source = material.image, rect = material.rect;
            if (!source || !source.complete || !source.naturalWidth) return null;
            var version = [source.currentSrc || source.src, source.naturalWidth, source.naturalHeight,
                rect.x, rect.y, rect.w, rect.h, material.shade].join(":");
            var old = surfaces.get(material.key);
            if (old && old.version === version) return old;
            if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0
                || rect.x + rect.w > source.naturalWidth || rect.y + rect.h > source.naturalHeight) return null;
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
            var ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
            ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
            var raw = ctx.getImageData(0, 0, size, size).data, data = new Uint8ClampedArray(raw.length);
            // At a wrap seam, use adjacent pixels from the swatch interior. The
            // opposite half's discontinuity fades to zero at the texture centre.
            for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
                var wx = (1 - Math.cos(2 * Math.PI * x / size)) / 2;
                var wy = (1 - Math.cos(2 * Math.PI * y / size)) / 2;
                var weights = [wx * wy, (1 - wx) * wy, wx * (1 - wy), (1 - wx) * (1 - wy)];
                var positions = [[x, y], [modulo(x + size / 2, size), y],
                    [x, modulo(y + size / 2, size)], [modulo(x + size / 2, size), modulo(y + size / 2, size)]];
                for (var c = 0; c < 3; c++) {
                    var value = 0;
                    for (var n = 0; n < 4; n++) value += raw[(positions[n][1] * size + positions[n][0]) * 4 + c] * weights[n];
                    data[(y * size + x) * 4 + c] = value * (1 - (material.shade || 0));
                }
                data[(y * size + x) * 4 + 3] = 255;
            }
            var result = { version: version, data: data };
            surfaces.set(material.key, result); tiles.clear();
            return result;
        }
        function feather(distance, along) {
            var width = 8 + 2 * Math.sin(along * Math.PI / 32) + Math.cos(along * Math.PI / 16);
            var t = Math.max(0, 1 - distance / width);
            return 0.5 * t * t * (3 - 2 * t);
        }
        function tile(material, neighbours, cx, cy) {
            if (!Number.isInteger(cx) || !Number.isInteger(cy)) return null;
            var sources;
            try {
                sources = offsets.map(function (offset, index) {
                    return surface(index === 4 ? material : neighbours[index] || material);
                });
            } catch (error) { return null; }
            if (sources.some(function (entry) { return !entry; })) return null;
            var px = modulo(cx, period), py = modulo(cy, period);
            var key = [px, py].concat(sources.map(function (entry, index) {
                return (index === 4 ? material : neighbours[index] || material).key + ":" + entry.version;
            })).join("|");
            var old = tiles.get(key);
            if (old) { tiles.delete(key); tiles.set(key, old); return old; }
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = cell;
            var ctx = canvas.getContext("2d");
            if (!ctx) return null;
            var image = ctx.createImageData(cell, cell), allSame = sources.every(function (entry) { return entry === sources[4]; });
            for (var y = 0; y < cell; y++) for (var x = 0; x < cell; x++) {
                var gx = px * cell + x, gy = py * cell + y, sourceIndex = (gy * size + gx) * 4;
                var left = feather(x + 0.5, gy), right = feather(cell - x - 0.5, gy);
                var top = feather(y + 0.5, gx), bottom = feather(cell - y - 0.5, gx);
                var horizontal = [left, 1 - left - right, right], vertical = [top, 1 - top - bottom, bottom];
                for (var c = 0; c < 3; c++) {
                    var value = 0;
                    if (allSame) value = sources[4].data[sourceIndex + c];
                    else for (var n = 0; n < 9; n++)
                        value += sources[n].data[sourceIndex + c] * horizontal[n % 3] * vertical[Math.floor(n / 3)];
                    image.data[(y * cell + x) * 4 + c] = value;
                }
                image.data[(y * cell + x) * 4 + 3] = 255;
            }
            ctx.putImageData(image, 0, 0); tiles.set(key, canvas);
            if (tiles.size > limit) tiles.delete(tiles.keys().next().value);
            return canvas;
        }
        return { tile: tile, clear: function () { tiles.clear(); surfaces.clear(); },
            cacheSize: function () { return tiles.size; } };
    }
    return { create: create, offsets: offsets };
});
