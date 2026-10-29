/* Advected density, internal shade and light scattering for bounded sprite volumes.
 * The native alpha field supplies the footprint; no cells or lifetimes are invented. */
define(["liquid-field", "light-field-sampling"], function (field, sampling) {
    "use strict";
    function sample(surface, x, y, density) {
        var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, out = [0, 0, 0, 0];
        for (var oy = 0; oy < 2; oy++) for (var ox = 0; ox < 2; ox++) {
            var sx = ix + ox, sy = iy + oy;
            if (sx < 0 || sy < 0 || sx >= surface.width || sy >= surface.height) continue;
            var n = sy * surface.width + sx, weight = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
            var alpha = (density ? surface.blur[n] : surface.data[n * 4 + 3]) * weight;
            out[3] += alpha;
            for (var c = 0; c < 3; c++) out[c] += surface.data[n * 4 + c] * alpha;
        }
        for (var channel = 0; channel < 3; channel++) out[channel] /= Math.max(.001, out[3]);
        return out;
    }
    function shade(surface, profile, cx, cy, phase, lights) {
        var out = new Uint8ClampedArray(surface.data.length), w = surface.width, h = surface.height;
        var time = phase * profile.speed, spread = profile.spread || 1;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            var n = y * w + x, i = n * 4;
            // A fixed, soft support prevents density from crossing native cell
            // clips. Inside it, two independently moving layers roll past each other.
            if (!surface.blur[n] && !surface.data[i + 3]) continue;
            var wx = cx * w + x, wy = cy * h + y;
            var roll = field.noise((wx + time * .6) / 10, (wy + time * profile.lift) / 10, 128);
            var curl = field.noise((wx - time * .55) / 5, (wy + time * .8) / 5, 256);
            var u = x + spread * ((roll - .5) * 5 + Math.sin(wy * .18 + time * .12) * 1.7);
            var v = y + spread * ((curl - .5) * 4 + Math.sin(wx * .16 - time * .1));
            var front = sample(surface, u, v, false);
            var back = sample(surface, x - (curl - .5) * 3, y + (roll - .5) * 3, true);
            var density = (front[3] * .56 + back[3] * .44) * (.68 + roll * .34 + curl * .16);
            var support = field.smooth(0, 28, surface.blur[n] + surface.data[i + 3]);
            var alpha = Math.min(density, Math.max(front[3], back[3])) * profile.density * support;
            var thickness = Math.min(1, density / 190), edge = 1 - thickness;
            var gradient = (sample(surface, u - 2, v - 2, true)[3] - sample(surface, u + 2, v + 2, true)[3]) / 255;
            var body = .79 + roll * .22 + gradient * .32 - thickness * .12;
            var gains = [0, 0, 0];
            lights.forEach(function (light) {
                var dx = light.x - cx + .5 - (x + .5) / w, dy = light.y - cy + .5 - (y + .5) / h;
                var energy = sampling.falloff(Math.hypot(dx, dy), light.radius)
                    * sampling.coverage(light.visibility, (x + .5) / w, (y + .5) / h) * light.strength;
                for (var c = 0; c < 3; c++) gains[c] += light.colour[c] * energy * (.25 + edge * .65);
            });
            for (var channel = 0; channel < 3; channel++) {
                var pigment = front[3] > 1 ? front[channel] * .72 + surface.colour[channel] * .28 : surface.colour[channel];
                out[i + channel] = pigment * body + edge * 8 + gains[channel] + profile.emission * curl * 12;
            }
            out[i + 3] = alpha;
        }
        return out;
    }
    return { shade: shade };
});
