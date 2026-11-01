/* Organic liquid edges from a world-anchored distance field. Two tiles agree on
 * every boundary pixel; the waterline stays inside the native liquid tile and
 * unknown neighbours supply no shape. Masks: N E S W, then NE SE SW NW bits. */
define(["liquid-field"], function (field) {
    "use strict";
    var size = 32, area = size * size, radius = 11, reach = 9, limit = 768;
    var shapes = new Map(), stains = new Map();
    var sides = [{ bit: 1, source: 1 }, { bit: 2, source: 5 }, { bit: 4, source: 7 }, { bit: 8, source: 3 }];
    var corners = [{ bit: 16, a: 0, b: 1, x: 1, y: 0, source: 2 }, { bit: 32, a: 1, b: 2, x: 1, y: 1, source: 8 },
        { bit: 64, a: 2, b: 3, x: 0, y: 1, source: 6 }, { bit: 128, a: 3, b: 0, x: 0, y: 0, source: 0 }];
    var fallback = { water: [40, 48, 44], lava: [33, 28, 26] };
    function modulo(value, period) { return (value % period + period) % period; }
    function clamp(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
    function edge(mask, u, v, rounded, result) {
        var spans = [v, size - u, size - v, u], distance = 64, source = 4;
        sides.forEach(function (side, index) {
            if (mask & side.bit && spans[index] < distance) { distance = spans[index]; source = side.source; }
        });
        corners.forEach(function (corner) {
            var x = corner.x ? size - u : u, y = corner.y ? size - v : v, a = sides[corner.a], b = sides[corner.b];
            var value = null;
            if (mask & a.bit && mask & b.bit) {
                var dx = radius - x, dy = radius - y;
                if (rounded && dx > 0 && dy > 0) value = radius - Math.hypot(dx, dy);
            } else if (mask & corner.bit) value = Math.hypot(x, y);
            if (value !== null && value < distance) { distance = value; source = corner.source; }
        });
        result.distance = distance; result.source = source;
    }
    function margin(gx, gy) {
        return 3 + 6.5 * (field.noise(gx / 16, gy / 16, 16) * .7 + field.noise((gx + 9) / 8, (gy - 5) / 8, 32) * .3);
    }
    function create(mask, cx, cy, rounded) {
        var shape = { edge: new Float32Array(area), margin: new Float32Array(area), distance: new Float32Array(area),
            source: new Int8Array(area), wave: new Float32Array(area), fleck: new Float32Array(area) }, out = {};
        for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
            var n = y * size + x, gx = cx * size + x + .5, gy = cy * size + y + .5;
            edge(mask, x + .5, y + .5, rounded, out);
            shape.edge[n] = out.distance; shape.source[n] = out.source;
            shape.margin[n] = margin(gx, gy); shape.distance[n] = out.distance - shape.margin[n];
            shape.wave[n] = (gx + gy) * Math.PI / 32 + field.noise(gx / 16, (gy + 40) / 16, 16) * 5;
            shape.fleck[n] = field.smooth(.35, .7, field.noise((gx + 3) / 4, (gy + 11) / 4, 64));
        }
        return shape;
    }
    function bounded(cache, key, value) {
        cache.set(key, value);
        if (cache.size > limit) cache.delete(cache.keys().next().value);
        return value;
    }
    // Coordinates wrap with the eight-tile period shared by every terrain cache.
    function shape(mask, cx, cy, rounded) {
        var x = modulo(cx, 8), y = modulo(cy, 8), key = [mask, x, y, rounded ? 1 : 0].join(":");
        return shapes.get(key) || bounded(shapes, key, create(mask, x, y, rounded));
    }
    function compose(data, surface, mask, cx, cy, time, sources) {
        var found = shape(mask, cx, cy, true), wet = surface === "water", matte = new Float32Array(area).fill(1);
        var rock = fallback[surface] || fallback.water, lapping = time / 900;
        for (var n = 0; n < area; n++) {
            var d = found.distance[n], at = n * 4, fleck = found.fleck[n];
            if (d >= reach) continue;
            var r = data[at], g = data[at + 1], b = data[at + 2], t = clamp(1 - d / reach), lift = t * t;
            if (wet) {
                // Shallow shelf, then a thin line of foam lapping the waterline.
                r += lift * 26; g += lift * 34; b += lift * 20;
                var lap = 1.7 + Math.sin(lapping + found.wave[n]) * 1.2, band = clamp(1 - Math.abs(d - lap) / 1.5) * fleck;
                r += (214 - r) * band * .62; g += (226 - g) * band * .62; b += (216 - b) * band * .62;
            } else {
                r *= 1 - lift * .5; g *= 1 - lift * .64; b *= 1 - lift * .42;
                var seam = clamp(1 - Math.abs(d - 1.6) / 1.7) * fleck;
                r += seam * 118; g += seam * 56; b += seam * 8;
            }
            var bank = clamp(.5 - d);
            if (bank) {
                var source = sources && sources[found.source[n]], grain = (fleck - .5) * 14;
                var br = source ? source.data[at] : rock[0] + grain, bg = source ? source.data[at + 1] : rock[1] + grain;
                var bb = source ? source.data[at + 2] : rock[2] + grain;
                var soaked = clamp(1 + d / 7), scorched = clamp(1 + d / 10);
                if (wet) { var gain = 1 - soaked * .46; br *= gain * .94; bg *= gain * .98; bb *= gain; }
                else {
                    var ember = clamp(1 + d / 3.2), burn = 1 - scorched * .74;
                    br = br * burn + ember * ember * fleck * 104; bg = bg * burn + ember * ember * fleck * 36; bb *= burn;
                }
                r += (br - r) * bank; g += (bg - g) * bank; b += (bb - b) * bank;
                matte[n] = 1 - bank * (wet ? 1 - soaked * .3 : 1);
            }
            data[at] = r; data[at + 1] = g; data[at + 2] = b; data[at + 3] = 255;
        }
        return matte;
    }
    // Damp or scorched ground beyond the tile edge, continuing the same falloff.
    function stain(kind, mask, cx, cy) {
        var x = modulo(cx, 8), y = modulo(cy, 8), key = [kind, mask, x, y].join(":"), found = stains.get(key);
        if (found !== undefined) return found;
        var hot = kind === "hot", canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        var ctx = canvas.getContext("2d");
        if (!ctx) return null;
        var image = ctx.createImageData(size, size), own = shape(mask, x, y, false);
        for (var n = 0; n < area; n++) {
            var at = n * 4, amount = clamp(1 - (own.edge[n] + own.margin[n]) / (hot ? 10 : 7));
            image.data[at] = hot ? 13 : 10; image.data[at + 1] = hot ? 9 : 25; image.data[at + 2] = hot ? 8 : 31;
            image.data[at + 3] = amount * (hot ? 190 : 118);
        }
        ctx.putImageData(image, 0, 0);
        return bounded(stains, key, canvas);
    }
    // Alpha of the liquid itself, for anything that must stay on the water.
    function surface(mask, cx, cy) {
        var x = modulo(cx, 8), y = modulo(cy, 8), key = ["liquid", mask, x, y].join(":"), found = stains.get(key);
        if (found !== undefined) return found;
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        var ctx = canvas.getContext("2d");
        if (!ctx) return null;
        var image = ctx.createImageData(size, size), own = shape(mask, x, y, true);
        for (var n = 0; n < area; n++) image.data[n * 4 + 3] = clamp(own.distance[n] + .5) * 255;
        ctx.putImageData(image, 0, 0);
        return bounded(stains, key, canvas);
    }
    // Deep and shallow water meet on one meandering line, shared by both sides.
    function shallows(mask, cx, cy, depth) {
        var found = shape(mask, cx, cy, false), out = new Float32Array(area);
        for (var n = 0; n < area; n++) {
            var line = (depth === "shallow" ? -1 : 1) * found.edge[n] + (found.margin[n] - 6) * 1.6;
            out[n] = 1 - field.smooth(-reach, reach, line);
        }
        return out;
    }
    return { size: size, reach: reach, shape: shape, compose: compose, stain: stain, surface: surface, shallows: shallows,
        clear: function () { shapes.clear(); stains.clear(); } };
});
