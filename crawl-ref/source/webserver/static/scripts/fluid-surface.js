/* Small world-anchored pixel surfaces. Caller supplies terrain and animation time.
 * Native coordinates, occupants, visibility and input stay outside this module. */
define(["liquid-field", "liquid-shader"], function (field, shader) {
    "use strict";
    function modulo(value, size) { return (value % size + size) % size; }
    function noise(x, y) { return modulo(Math.sin(x * 127.1 + y * 311.7) * 43758.5453, 1); }
    function distance(mask, x, y) {
        return Math.min(mask & 1 ? y : 32, mask & 2 ? 31 - x : 32,
            mask & 4 ? 31 - y : 32, mask & 8 ? x : 32);
    }
    function create(limit) {
        var cache = new Map();
        function tile(terrain, cx, cy, now) {
            var own = terrain.own, phase = modulo(Math.floor(now / (own.surface === "lava" ? 400 : 200)), 256);
            var key = [own.surface, own.depth, own.murky, modulo(cx, 8), modulo(cy, 8),
                terrain.shore, terrain.depth, phase].join(":");
            if (cache.has(key)) { var old = cache.get(key); cache.delete(key); cache.set(key, old); return old; }
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            // Only ever written by putImageData and composed onto CPU scratch surfaces.
            var ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return null;
            var image = ctx.createImageData(32, 32);
            var lava = own.surface === "lava";
            var atlas = shader.pixels(modulo(Math.floor(now / 200), 256), modulo(Math.floor(now / 400), 256));
            for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
                var gx = modulo(cx, 8) * 32 + x, gy = modulo(cy, 8) * 32 + y;
                var grain = noise(gx, gy), bank = distance(terrain.shore, x, y);
                var rim = Math.max(0, 1 - bank / 5), depth = distance(terrain.depth, x, y);
                var offset = ((gy + (lava ? 256 : 0)) * 256 + gx) * 4;
                var red, green, blue;
                if (atlas) { red = atlas[offset]; green = atlas[offset + 1]; blue = atlas[offset + 2]; }
                else { var colour = field.sample(gx, gy, phase, lava).colour; red = colour[0]; green = colour[1]; blue = colour[2]; }
                if (lava) {
                    red *= 1 - rim * .28; green *= 1 - rim * .33; blue *= 1 - rim * .15;
                } else {
                    var depthBand = Math.max(0, 1 - depth / 9);
                    var shallow = own.depth === "shallow" ? 1 - depthBand * .25 : depthBand * .5;
                    red += shallow * 19 + grain * 3; green += shallow * 31 + grain * 4; blue += shallow * 22 + grain * 5;
                    if (own.murky) { red += 10; green += 7; blue -= 25; }
                    // Thin broken foam and a dark submerged shelf, inside the liquid.
                    red *= 1 - rim * .22; green *= 1 - rim * .2; blue *= 1 - rim * .24;
                    if (bank < 1.2 + Math.sin((gx + gy) * .6 - phase * Math.PI / 32) * .7 && grain > .34) {
                        red += 32; green += 42; blue += 38;
                    }
                }
                var index = (y * 32 + x) * 4;
                image.data[index] = red; image.data[index + 1] = green; image.data[index + 2] = blue;
                image.data[index + 3] = 255;
            }
            ctx.putImageData(image, 0, 0); cache.set(key, canvas);
            if (cache.size > (limit || 192)) cache.delete(cache.keys().next().value);
            return canvas;
        }
        return { tile: tile, clear: function () { cache.clear(); }, cacheSize: function () { return cache.size; } };
    }
    return { create: create, distance: distance };
});
