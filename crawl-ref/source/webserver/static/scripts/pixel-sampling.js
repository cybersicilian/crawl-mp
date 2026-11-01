/* Premultiplied bilinear pixels, shared by refraction and magical distortion.
 * A reader may span known neighboring tiles; null samples never contribute. */
define([], function () {
    "use strict";
    function bilinear(read, x, y) {
        var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, out = [0, 0, 0, 0];
        for (var oy = 0; oy <= 1; oy++) for (var ox = 0; ox <= 1; ox++) {
            var pixel = read(ix + ox, iy + oy);
            if (pixel === null || pixel === undefined) continue;
            var packed = typeof pixel === "number";
            var weight = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy), alpha = (packed ? pixel >>> 24 : pixel[3]) * weight;
            out[3] += alpha;
            for (var c = 0; c < 3; c++) out[c] += (packed ? pixel >>> (c * 8) & 255 : pixel[c]) * alpha;
        }
        for (var channel = 0; channel < 3; channel++) out[channel] /= Math.max(.001, out[3]);
        return out;
    }
    function reader(data, width, height) {
        return function (x, y) {
            var n = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
            return (data[n] | data[n + 1] << 8 | data[n + 2] << 16 | data[n + 3] << 24) >>> 0;
        };
    }
    function halo(rasters, width, height, padding) {
        padding = padding === undefined ? 1 : padding;
        var own = rasters[4], stride = width + padding * 2;
        if (!own || padding < 1 || padding > Math.min(width, height) || !Number.isInteger(padding))
            throw new RangeError("A raster halo requires its centre and a valid padding");
        var output = new Uint8ClampedArray(stride * (height + padding * 2) * 4);
        var readers = rasters.map(function (raster) { return raster ? reader(raster.data, raster.width, raster.height) : null; });
        for (var y = -padding; y < height + padding; y++) for (var x = -padding; x < width + padding; x++) {
            var tx = Math.floor(x / width), ty = Math.floor(y / height), adjacent = rasters[(ty + 1) * 3 + tx + 1];
            var source = adjacent || own;
            var px = adjacent ? x - tx * width : Math.max(0, Math.min(width - 1, x));
            var py = adjacent ? y - ty * height : Math.max(0, Math.min(height - 1, y));
            var target = ((y + padding) * stride + x + padding) * 4;
            if (source.width === width && source.height === height) {
                var from = (py * width + px) * 4;
                for (var c = 0; c < 4; c++) output[target + c] = source.data[from + c];
            } else {
                var colour = bilinear(adjacent ? readers[(ty + 1) * 3 + tx + 1] : readers[4],
                    (px + .5) * source.width / width - .5, (py + .5) * source.height / height - .5);
                output.set(colour, target);
            }
        }
        return output;
    }
    function warpHalo(halo, width, height, displacement, padding) {
        padding = padding === undefined ? 1 : padding;
        var grid = new Float32Array(50), out = new Uint8ClampedArray(width * height * 4), stride = width + padding * 2;
        for (var gy = 0; gy <= 4; gy++) for (var gx = 0; gx <= 4; gx++) {
            var offset = displacement(gx * width / 4, gy * height / 4), g = (gy * 5 + gx) * 2;
            grid[g] = offset.x; grid[g + 1] = offset.y;
        }
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var u = x * 4 / width, v = y * 4 / height, ix = Math.floor(u), iy = Math.floor(v);
            var fu = u - ix, fv = v - iy, n = (iy * 5 + ix) * 2;
            var dx = (grid[n] * (1 - fu) + grid[n + 2] * fu) * (1 - fv) + (grid[n + 10] * (1 - fu) + grid[n + 12] * fu) * fv;
            var dy = (grid[n + 1] * (1 - fu) + grid[n + 3] * fu) * (1 - fv) + (grid[n + 11] * (1 - fu) + grid[n + 13] * fu) * fv;
            var sx = Math.max(0, Math.min(stride - 1.001, x + padding + dx));
            var sy = Math.max(0, Math.min(height + padding * 2 - 1.001, y + padding + dy));
            var bx = Math.floor(sx), by = Math.floor(sy), fx = sx - bx, fy = sy - by, red = 0, green = 0, blue = 0, alpha = 0;
            for (var oy = 0; oy <= 1; oy++) for (var ox = 0; ox <= 1; ox++) {
                var p = ((by + oy) * stride + bx + ox) * 4, a = halo[p + 3] * (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
                red += halo[p] * a; green += halo[p + 1] * a; blue += halo[p + 2] * a; alpha += a;
            }
            var target = (y * width + x) * 4, divisor = Math.max(.001, alpha);
            out[target] = red / divisor; out[target + 1] = green / divisor; out[target + 2] = blue / divisor; out[target + 3] = alpha;
        }
        return out;
    }
    return { bilinear: bilinear, reader: reader, halo: halo, warpHalo: warpHalo };
});
