/* Native-sprite material shaders. Density stays inside the original cloud
 * silhouette; energy halos stay within the caller's visible tile clip. */
define(["liquid-field", "light-field-sampling", "vapour-field"], function (field, sampling, vapour) {
    "use strict";
    function prepare(data, width, height) {
        var blur = new Float32Array(width * height), colour = [0, 0, 0], coverage = 0;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var index = (y * width + x) * 4, alpha = data[index + 3]; coverage += alpha;
            for (var c = 0; c < 3; c++) colour[c] += data[index + c] * alpha;
            var total = 0, weight = 0;
            for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
                var sx = x + ox, sy = y + oy, w = (3 - Math.abs(ox)) * (3 - Math.abs(oy));
                if (sx >= 0 && sy >= 0 && sx < width && sy < height) total += data[(sy * width + sx) * 4 + 3] * w;
                weight += w;
            }
            blur[y * width + x] = total / weight;
        }
        return { data: new Uint8ClampedArray(data), width: width, height: height, blur: blur,
            colour: colour.map(function (value) { return value / Math.max(1, coverage); }) };
    }
    function shade(surface, profile, cx, cy, phase, lights) {
        if (profile.volume) return vapour.shade(surface, profile, cx, cy, phase, lights);
        var output = new Uint8ClampedArray(surface.data.length), cloud = profile.mode === "vapour";
        var drift = phase * profile.speed, width = surface.width, height = surface.height;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var n = y * width + x, i = n * 4, alpha = surface.data[i + 3];
            var worldX = cx * width + x, worldY = cy * height + y;
            var broad = field.noise((worldX + drift * .6) / 9, (worldY + drift * profile.lift) / 9, 128);
            var detail = field.noise((worldX - drift) / 4, (worldY + drift * .7) / 4, 256);
            var density = .66 + broad * .3 + detail * .2;
            var shade = cloud ? .83 + broad * .23 + detail * .12 : 1 + profile.emission * (.08 + detail * .16);
            var halo = cloud ? 0 : surface.blur[n] * profile.glow * (1 - alpha / 255);
            var warped = null;
            if (cloud) {
                var sx = x + (broad - .5) * 4 + Math.sin(drift * .24 + worldY * .17) * 1.2;
                var sy = y + (detail - .5) * 3 + Math.sin(drift * .16 + worldX * .2) * .6;
                warped = advect(surface, sx, sy); alpha = alpha * .15 + warped[3] * .85;
            }
            var gains = [0, 0, 0];
            if (cloud) lights.forEach(function (light) {
                var dx = light.x - cx + .5 - (x + .5) / width, dy = light.y - cy + .5 - (y + .5) / height;
                var energy = sampling.falloff(Math.hypot(dx, dy), light.radius)
                    * sampling.coverage(light.visibility, (x + .5) / width, (y + .5) / height) * light.strength;
                for (var c = 0; c < 3; c++) gains[c] += light.colour[c] * energy * .32;
            });
            for (var channel = 0; channel < 3; channel++) {
                var pigment = cloud ? surface.data[i + channel] * .25 + warped[channel] * .75 : surface.data[i + channel];
                // Halo colour follows the native spell, including low-alpha edge pixels.
                output[i + channel] = pigment * shade + gains[channel] + (alpha ? profile.emission * detail * 12 : 0);
                if (!alpha && halo) output[i + channel] = profile.mode === "projectile" ? surface.colour[channel] : profile.colour[channel];
            }
            output[i + 3] = cloud ? alpha * Math.min(1, density) * profile.density : Math.min(255, alpha + halo);
        }
        return output;
    }
    function advect(surface, x, y) {
        var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, result = [0, 0, 0, 0];
        for (var oy = 0; oy < 2; oy++) for (var ox = 0; ox < 2; ox++) {
            var sx = ix + ox, sy = iy + oy;
            if (sx < 0 || sy < 0 || sx >= surface.width || sy >= surface.height) continue;
            var n = (sy * surface.width + sx) * 4, weight = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
            var alpha = surface.data[n + 3] * weight; result[3] += alpha;
            for (var c = 0; c < 3; c++) result[c] += surface.data[n + c] * alpha;
        }
        for (var channel = 0; channel < 3; channel++) result[channel] /= Math.max(.001, result[3]);
        return result;
    }
    return { prepare: prepare, shade: shade };
});
