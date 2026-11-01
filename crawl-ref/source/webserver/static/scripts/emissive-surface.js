/* Premultiplied bright-pass bloom with two separable kernels. Only emitted
 * pixels enter the blur, so the surrounding artwork is never softened. */
define([], function () {
    "use strict";
    function blur(input, width, height, radius) {
        var horizontal = new Float32Array(input.length), output = new Float32Array(input.length);
        var divisor = Math.pow(radius + 1, 2);
        // Reuse each tap's address and weight across RGBA. Each channel keeps
        // the original summation order and Float32 pass boundary exactly.
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var r = 0, g = 0, b = 0, a = 0, target = (y * width + x) * 4;
            for (var ox = -radius; ox <= radius; ox++) {
                var sx = x + ox;
                if (sx < 0 || sx >= width) continue;
                var source = (y * width + sx) * 4, weight = radius + 1 - Math.abs(ox);
                r += input[source] * weight; g += input[source + 1] * weight;
                b += input[source + 2] * weight; a += input[source + 3] * weight;
            }
            horizontal[target] = r / divisor; horizontal[target + 1] = g / divisor;
            horizontal[target + 2] = b / divisor; horizontal[target + 3] = a / divisor;
        }
        for (var by = 0; by < height; by++) for (var bx = 0; bx < width; bx++) {
            var red = 0, green = 0, blue = 0, alpha = 0, index = (by * width + bx) * 4;
            for (var oy = -radius; oy <= radius; oy++) {
                var sy = by + oy;
                if (sy < 0 || sy >= height) continue;
                var offset = (sy * width + bx) * 4, factor = radius + 1 - Math.abs(oy);
                red += horizontal[offset] * factor; green += horizontal[offset + 1] * factor;
                blue += horizontal[offset + 2] * factor; alpha += horizontal[offset + 3] * factor;
            }
            output[index] = red / divisor; output[index + 1] = green / divisor;
            output[index + 2] = blue / divisor; output[index + 3] = alpha / divisor;
        }
        return output;
    }
    function bloom(data, width, height, padding) {
        var pad = padding || 8, w = width + pad * 2, h = height + pad * 2;
        var bright = new Float32Array(w * h * 4);
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var source = (y * width + x) * 4, target = ((y + pad) * w + x + pad) * 4;
            var peak = Math.max(data[source], data[source + 1], data[source + 2]);
            var energy = Math.max(0, (peak - 105) / 150) * data[source + 3] / 255;
            bright[target + 3] = energy;
            for (var c = 0; c < 3; c++) bright[target + c] = data[source + c] * energy;
        }
        var near = blur(bright, w, h, 3), far = blur(bright, w, h, 7), output = new Uint8ClampedArray(w * h * 4);
        for (var n = 0; n < output.length; n += 4) {
            var alpha = near[n + 3] * .7 + far[n + 3] * .75;
            if (alpha < .001) continue;
            for (var channel = 0; channel < 3; channel++)
                output[n + channel] = (near[n + channel] * .7 + far[n + channel] * .75) / alpha;
            output[n + 3] = Math.min(.8, alpha) * 255;
        }
        return { data: output, width: w, height: h, padding: pad };
    }
    return { bloom: bloom };
});
