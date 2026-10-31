/* World-anchored, wave-broken reflections of visible emitters on a planar
 * surface. These are light reflections, not a screen-space scene copy. */
define(["liquid-field", "light-field-sampling", "light-emission"], function (field, sampling, emission) {
    "use strict";
    function sample(wx, wy, light, seconds) {
        var dx = wx - light.x - .5, dy = wy - light.y - .5;
        var wave = field.noise(wx * 4 + seconds * .25, wy * 5 - seconds * .8, 128);
        var sway = Math.sin(wy * 17 - seconds * 2.6 + light.x) * .075 + (wave - .5) * .14;
        var roughness = .2 + Math.abs(dy) * .15;
        var footprint = Math.exp(-Math.pow((dx + sway) / roughness, 2) * .5);
        var stretch = Math.exp(-Math.abs(dy - (light.elevation || .65)) / 2.1);
        var breakup = field.noise(wx * 17 - seconds * .4, wy * 23 + seconds * 1.1, 128);
        var ripple = Math.pow(Math.max(0, Math.sin(wy * 31 + Math.sin(wx * 9 + seconds) * 2.4 + (wave - .5) * 9 - seconds * 4)), 7)
            * field.smooth(.2, .75, breakup);
        return Math.min(.58, footprint * stretch * (.025 + ripple * .975)
            * sampling.falloff(Math.hypot(dx, dy), light.radius) * light.strength * 7.2);
    }
    function create(limit) {
        var cache = new Map();
        function tile(cx, cy, lights, now, animated) {
            function power(light) { return light.strength / (.4 + Math.pow(light.x - cx, 2) + Math.pow(light.y - cy, 2)); }
            var sources = lights.filter(function (light) { return light.reflective !== false; })
                .sort(function (a, b) { return power(b) - power(a); }).slice(0, 6);
            if (!sources.length) return null;
            var phase = animated ? Math.floor(now / 100) : 0;
            var key = [cx, cy, phase, sources.map(function (light) {
                return [light.x, light.y, light.radius, light.strength, light.colour, light.elevation, light.visibility].join(":");
            }).join(";")].join("|");
            if (cache.has(key)) return cache.get(key);
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            var ctx = canvas.getContext("2d");
            if (!ctx) return null;
            var pixels = ctx.createImageData(32, 32), seconds = phase / 10;
            for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
                var red = 0, green = 0, blue = 0, alpha = 0;
                sources.forEach(function (light) {
                    var energy = sample(cx + (x + .5) / 32, cy + (y + .5) / 32, light, light.animated === false ? 0 : seconds)
                        * sampling.coverage(light.visibility, (x + .5) / 32, (y + .5) / 32)
                        * emission.level(light, phase * 100, animated);
                    red += light.colour[0] * energy; green += light.colour[1] * energy;
                    blue += light.colour[2] * energy; alpha += energy;
                });
                var n = (y * 32 + x) * 4;
                if (alpha > .001) {
                    pixels.data[n] = red / alpha; pixels.data[n + 1] = green / alpha; pixels.data[n + 2] = blue / alpha;
                    pixels.data[n + 3] = Math.min(.64, alpha) * 255;
                }
            }
            ctx.putImageData(pixels, 0, 0); cache.set(key, canvas);
            if (cache.size > (limit || 96)) cache.delete(cache.keys().next().value);
            return canvas;
        }
        return { tile: tile, clear: function () { cache.clear(); }, size: function () { return cache.size; } };
    }
    return { create: create, sample: sample };
});
