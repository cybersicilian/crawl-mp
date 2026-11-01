/* Apply a sampled multiplicative/additive light field to independent RGBA albedo.
 * Lighting geometry stays on its chosen grid; pigment retains its own resolution. */
define([], function () {
    "use strict";
    function create(width, height) {
        var length = width * height * 4;
        return { width: width, height: height, gain: new Float32Array(length), add: new Float32Array(length) };
    }
    function apply(data, width, height, field) {
        if (data.length !== width * height * 4 || field.gain.length !== field.width * field.height * 4
            || field.add.length !== field.gain.length) throw new RangeError("Light field dimensions differ");
        var output = new Uint8ClampedArray(data.length);
        for (var y = 0; y < height; y++) {
            var sy = Math.max(0, Math.min(field.height - 1, (y + .5) * field.height / height - .5));
            var iy = Math.floor(sy), fy = sy - iy, nextY = Math.min(field.height - 1, iy + 1);
            for (var x = 0; x < width; x++) {
                var sx = Math.max(0, Math.min(field.width - 1, (x + .5) * field.width / width - .5));
                var ix = Math.floor(sx), fx = sx - ix, nextX = Math.min(field.width - 1, ix + 1);
                var a = (iy * field.width + ix) * 4, b = (iy * field.width + nextX) * 4;
                var c = (nextY * field.width + ix) * 4, d = (nextY * field.width + nextX) * 4;
                var wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
                var target = (y * width + x) * 4;
                for (var channel = 0; channel < 3; channel++) {
                    var gain = field.gain[a + channel] * wa + field.gain[b + channel] * wb
                        + field.gain[c + channel] * wc + field.gain[d + channel] * wd;
                    var add = field.add[a + channel] * wa + field.add[b + channel] * wb
                        + field.add[c + channel] * wc + field.add[d + channel] * wd;
                    output[target + channel] = data[target + channel] * gain + add;
                }
                output[target + 3] = data[target + 3];
            }
        }
        return output;
    }
    return { create: create, apply: apply };
});
