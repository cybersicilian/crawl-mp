/* Subpixel refraction of a supplied terrain underlay and Fresnel light catches.
 * No scene readback, neighboring world queries, actor sampling or invented art. */
define(["pixel-sampling", "light-field-sampling", "light-emission"], function (pixels, sampling, emission) {
    "use strict";
    function compose(underlay, wall, shaded, cx, cy, lights, phase, transmission, settings) {
        if (settings && settings.reflections === false) lights = [];
        var width = wall.width, height = wall.height, out = new Uint8ClampedArray(shaded.length);
        var read = pixels.reader(underlay, width, height), seconds = (phase || 0) / 5;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var n = y * width + x, i = n * 4, alpha = shaded[i + 3] / 255;
            var nx = wall.normals[n * 2], ny = wall.normals[n * 2 + 1];
            var inset = Math.min(1, Math.min(x, y, width - 1 - x, height - 1 - y) / 3);
            var bend = (1 - alpha) * transmission * inset;
            var dx = (nx * 2.1 + Math.sin((cx * width + x) * .12 + seconds * .35) * .18) * bend;
            var dy = (ny * 2.1 + Math.cos((cy * height + y) * .13 - seconds * .3) * .14) * bend;
            var base = pixels.bilinear(read, x + dx, y + dy), catches = [0, 0, 0];
            var grazing = 1 - 1 / Math.hypot(nx, ny, 1), fresnel = .035 + .965 * Math.pow(grazing, 5);
            lights.forEach(function (light) {
                var lx = light.x - cx + .5 - (x + .5) / width, ly = light.y - cy + .5 - (y + .5) / height;
                var lz = .65 + (light.elevation || .65), length = Math.hypot(lx, ly, lz);
                var hx = lx / length, hy = ly / length - .22, hz = lz / length + 1;
                var aligned = Math.max(0, (nx * hx + ny * hy + hz) / (Math.hypot(nx, ny, 1) * Math.hypot(hx, hy, hz)));
                var reflection = Math.pow(aligned, 28) * (.06 + fresnel * 2) * sampling.falloff(Math.hypot(lx, ly), light.radius)
                    * sampling.coverage(light.visibility, (x + .5) / width, (y + .5) / height)
                    * light.strength * emission.level(light, seconds * 1000, true) * (1 - alpha);
                for (var c = 0; c < 3; c++) catches[c] += light.colour[c] * reflection;
            });
            var underAlpha = base[3] / 255, resultAlpha = alpha + underAlpha * (1 - alpha);
            for (var channel = 0; channel < 3; channel++) {
                var transmitted = Math.min(255, base[channel] + Math.min(18, catches[channel]));
                out[i + channel] = (shaded[i + channel] * alpha + transmitted * underAlpha * (1 - alpha)) / Math.max(.001, resultAlpha);
            }
            out[i + 3] = resultAlpha * 255;
        }
        return out;
    }
    return { compose: compose };
});
