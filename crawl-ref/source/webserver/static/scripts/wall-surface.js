/* Native-albedo material preparation. Geometry is broad masonry relief or
 * world-space crystal facets; fine pigment never becomes embossed geometry. */
define(["liquid-field"], function (field) {
    "use strict";
    function facet(x, y) {
        var size = 10, ix = Math.floor(x / size), iy = Math.floor(y / size), first = Infinity, second = Infinity, site;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
            var sx = ix + ox, sy = iy + oy;
            var a = field.noise(sx * 3 + .37, sy * 3 + .13, 64);
            var b = field.noise(sx * 3 + 19.71, sy * 3 + 31.29, 64);
            var distance = Math.hypot(x - (sx + .18 + a * .64) * size, y - (sy + .18 + b * .64) * size);
            if (distance < first) { second = first; first = distance; site = [a, b]; }
            else second = Math.min(second, distance);
        }
        return { nx: (site[0] - .5) * 1.5, ny: (site[1] - .5) * 1.5,
            edge: 1 - field.smooth(.12, 1, second - first), tint: site[0], depth: site[1] };
    }
    function prepare(data, width, height, material, cx, cy, edges) {
        var out = new Uint8ClampedArray(data), normals = new Float32Array(width * height * 2);
        var roughness = new Float32Array(width * height), cavity = new Float32Array(width * height);
        var crystal = material === "crystal", metal = material === "metal", glass = material === "glass";
        var pigment = [0, 0, 0], weight = 0;
        if (crystal) for (var p = 0; p < data.length; p += 4) {
            weight += data[p + 3];
            for (var pc = 0; pc < 3; pc++) pigment[pc] += data[p + pc] * data[p + 3];
        }
        pigment = pigment.map(function (value) { return value / Math.max(1, weight); });
        function luma(x, y) {
            var sum = 0;
            for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
                var i = (Math.max(0, Math.min(height - 1, y + oy)) * width + Math.max(0, Math.min(width - 1, x + ox))) * 4;
                sum += (data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) / 255;
            }
            return sum / 9;
        }
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var n = y * width + x, i = n * 4, wx = cx * width + x, wy = cy * height + y;
            var grain = field.noise(wx / 3, wy / 3, 128), shade = 1, ao = 1;
            if (crystal) {
                var f = facet(wx, wy);
                normals[n * 2] = f.nx; normals[n * 2 + 1] = f.ny;
                roughness[n] = .13 + f.depth * .18;
                shade = .62 + f.tint * .55 + f.depth * .2;
                ao = 1 - f.edge * .12;
                // Retain the pack's pigment and grain, while broad facets take
                // precedence over a repeated white frame baked into older art.
                var frame = 1 - field.smooth(0, 3, Math.min(x, y, width - x - 1, height - y - 1));
                var nativeWeight = .36 * (1 - frame);
                for (var c = 0; c < 3; c++) out[i + c] = (data[i + c] * nativeWeight + pigment[c] * (1 - nativeWeight)) * shade
                    + f.edge * (4 + 22 * pigment[c] / Math.max(1, pigment[0], pigment[1], pigment[2]));
            } else if (glass) {
                // Glass keeps its native alpha and frame; its broad pane normals
                // catch a tighter reflection than rough or faceted material.
                normals[n * 2] = Math.sin(wx * Math.PI / 32 + grain * .3) * .12;
                normals[n * 2 + 1] = Math.cos(wy * Math.PI / 32 + grain * .3) * .08;
                roughness[n] = .09 + grain * .08;
            } else {
                var h = luma(x, y), dx = luma(x - 2, y) - luma(x + 2, y), dy = luma(x, y - 2) - luma(x, y + 2);
                normals[n * 2] = dx * 2; normals[n * 2 + 1] = dy * 2;
                var mortar = Math.max(0, (luma(x - 3, y) + luma(x + 3, y) + luma(x, y - 3) + luma(x, y + 3)) / 4 - h);
                ao = 1 - Math.min(.28, mortar * 1.7);
                roughness[n] = metal ? .27 + grain * .18 : .82 + grain * .16;
                shade = metal ? .97 + .035 * Math.sin(wy * 2.1) : .97 + grain * .055;
                for (var channel = 0; channel < 3; channel++) out[i + channel] *= shade;
            }
            // Bevel only exposed contours, never the joins between wall cells.
            var edge = Math.min(edges & 1 ? y : height, edges & 2 ? width - x - 1 : width,
                edges & 4 ? height - y - 1 : height, edges & 8 ? x : width);
            var bevel = 1 - field.smooth(0, 2.5 + grain, edge);
            if (edges & 8 && x < 4) normals[n * 2] -= bevel * .5;
            if (edges & 2 && x > width - 5) normals[n * 2] += bevel * .5;
            if (edges & 1 && y < 4) normals[n * 2 + 1] -= bevel * .5;
            if (edges & 4 && y > height - 5) normals[n * 2 + 1] += bevel * .5;
            cavity[n] = ao * (1 - bevel * .08);
        }
        return { data: out, normals: normals, roughness: roughness, cavity: cavity };
    }
    return { prepare: prepare, facet: facet };
});
