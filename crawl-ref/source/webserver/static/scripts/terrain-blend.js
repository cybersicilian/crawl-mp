/* Continuous, world-space mixing of native floor pixels. Expanded tile kernels
 * share both sides of a boundary, including diagonals; unknown sources are absent. */
define(["liquid-field"], function (field) {
    "use strict";
    var offsets = [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
        { x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 },
        { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    function pixels(sources, cx, cy, width, height) {
        var stride = width + 2, halo = new Float32Array(stride * (height + 2) * 3);
        var out = new Uint8ClampedArray(width * height * 4), normals = new Float32Array(width * height * 2);
        for (var y = -1; y <= height; y++) for (var x = -1; x <= width; x++) {
            var wx = cx * width + x + .5, wy = cy * height + y + .5;
            var qx = x + .5 + (field.noise(wx / 16, wy / 16, 16) - .5) * 7;
            var qy = y + .5 + (field.noise((wx + 71) / 16, (wy - 23) / 16, 16) - .5) * 7;
            var colour = [0, 0, 0], total = 0;
            sources.forEach(function (source, index) {
                if (!source) return;
                var offset = offsets[index], sx = offset.x * width, sy = offset.y * height, reach = 8;
                var weight = field.smooth(sx - reach, sx + reach, qx) * (1 - field.smooth(sx + width - reach, sx + width + reach, qx))
                    * field.smooth(sy - reach, sy + reach, qy) * (1 - field.smooth(sy + height - reach, sy + height + reach, qy));
                if (!weight) return;
                var px = Math.max(0, Math.min(width - 1, x - sx)), py = Math.max(0, Math.min(height - 1, y - sy));
                var n = (py * width + px) * 4;
                // Sand ripples use world coordinates and stay deliberately matte.
                var grain = source.material === "sand" ? .97 + .03 * Math.sin(wx * Math.PI / 16 + wy * Math.PI / 8
                    + field.noise(wx / 16, wy / 16, 16) * 3) : 1;
                for (var c = 0; c < 3; c++) colour[c] += source.data[n + c] * weight * grain;
                total += weight;
            });
            var target = ((y + 1) * stride + x + 1) * 3;
            for (var channel = 0; channel < 3; channel++) halo[target + channel] = colour[channel] / Math.max(.001, total);
        }
        function luma(n) { return (halo[n] * .2126 + halo[n + 1] * .7152 + halo[n + 2] * .0722) / 255; }
        for (var py = 0; py < height; py++) for (var px = 0; px < width; px++) {
            var n = py * width + px, source = ((py + 1) * stride + px + 1) * 3;
            for (var c = 0; c < 3; c++) out[n * 4 + c] = halo[source + c];
            out[n * 4 + 3] = sources[4].data[n * 4 + 3];
            normals[n * 2] = (luma(source - 3) - luma(source + 3)) * .4;
            normals[n * 2 + 1] = (luma(source - stride * 3) - luma(source + stride * 3)) * .4;
        }
        return { data: out, normals: normals };
    }
    return { pixels: pixels, offsets: offsets };
});
