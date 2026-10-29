/* Periodic value-noise shader primitives: advected water and cooling lava. */
define([], function () {
    "use strict";
    function wrap(n, period) { return (n % period + period) % period; }
    function hash(x, y, period) {
        var n = Math.imul(wrap(x, period), 374761393) + Math.imul(wrap(y, period), 668265263);
        n = Math.imul(n ^ n >>> 13, 1274126177);
        return ((n ^ n >>> 16) >>> 0) / 4294967295;
    }
    function noise(x, y, period) {
        var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        var top = hash(ix, iy, period) * (1 - u) + hash(ix + 1, iy, period) * u;
        var bottom = hash(ix, iy + 1, period) * (1 - u) + hash(ix + 1, iy + 1, period) * u;
        return top * (1 - v) + bottom * v;
    }
    function smooth(a, b, value) { var t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); }
    function sample(x, y, phase, lava) {
        var drift = lava ? phase : phase * 2;
        var warp = noise((x + drift) / 16, (y - drift) / 16, 16);
        var wx = x + drift + (warp - .5) * 11, wy = y - drift + (warp - .5) * 7;
        var body = noise(wx / 16, wy / 16, 16) * .32 + noise(wx / 8, wy / 8, 32) * .42 + noise(wx / 4, wy / 4, 64) * .26;
        if (lava) {
            var molten = 1 - smooth(.43, .62, body);
            var hot = Math.pow(molten, 3.5) * smooth(.2, .85, noise((wx + 37) / 4, (wy - 19) / 4, 64));
            var crust = noise(x / 2, y / 2, 128);
            var seam = Math.pow(Math.max(0, 1 - Math.abs(body - .455) * 35), 3);
            return { colour: [45 + molten * 153 + hot * 49 + crust * 12 + seam * 12,
                23 + molten * 36 + hot * 128 + crust * 7 + seam * 16, 20 + molten * 2 + hot * 24 + crust * 6 + seam * 6], height: body };
        }
        var wave = Math.sin((x + phase * 2) * Math.PI / 16 + warp * 2)
            * Math.cos((y - phase * 2) * Math.PI / 16 - body * 3);
        var caustic = Math.pow(Math.max(0, 1 - Math.abs(body - .5) * 16), 3);
        var crest = Math.pow(Math.max(0, wave), 8);
        return { colour: [9 + body * 12 + caustic * 7 + wave * 2 + crest * 4,
            38 + body * 21 + caustic * 14 + wave * 4 + crest * 8, 59 + body * 23 + caustic * 18 + wave * 5 + crest * 10], height: body };
    }
    function normals(x, y, phase, width, height) {
        // Sample a one-pixel halo in world space. Adjacent tiles share the same
        // derivative at their seam, including the 256px wrapping boundary.
        var stride = width + 2, heights = new Float32Array(stride * (height + 2));
        var result = new Float32Array(width * height * 2);
        for (var j = 0; j < height + 2; j++) for (var i = 0; i < stride; i++)
            heights[j * stride + i] = sample(x + i - 1, y + j - 1, phase, false).height;
        for (var cy = 0; cy < height; cy++) for (var cx = 0; cx < width; cx++) {
            var offset = (cy + 1) * stride + cx + 1, n = (cy * width + cx) * 2;
            result[n] = (heights[offset - 1] - heights[offset + 1]) * 6;
            result[n + 1] = (heights[offset - stride] - heights[offset + stride]) * 6;
        }
        return result;
    }
    return { sample: sample, normals: normals, noise: noise, smooth: smooth };
});
