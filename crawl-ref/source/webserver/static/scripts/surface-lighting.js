/* Albedo-derived or supplied normals and directional light at native pixels.
 * The caller supplies an occlusion-filtered light list, never hidden world data. */
define(["light-field-sampling", "material-response", "light-emission"], function (sampling, materials, emission) {
    "use strict";
    function prepare(data, width, height, normalMap, detail) {
        var luminance = new Float32Array(width * height), normals = new Float32Array(width * height * 2);
        for (var n = 0; n < luminance.length; n++)
            luminance[n] = (data[n * 4] * .2126 + data[n * 4 + 1] * .7152 + data[n * 4 + 2] * .0722) / 255;
        // Texture grain is pigment, not geometry. A small symmetric filter keeps
        // material relief broad instead of embossing every individual pixel.
        var relief = new Float32Array(luminance.length);
        for (var by = 0; by < height; by++) for (var bx = 0; bx < width; bx++) {
            var total = 0;
            for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++)
                total += luminance[Math.max(0, Math.min(height - 1, by + oy)) * width + Math.max(0, Math.min(width - 1, bx + ox))];
            relief[by * width + bx] = total / 9;
        }
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var index = y * width + x;
            normals[index * 2] = relief[y * width + Math.max(0, x - 1)] - relief[y * width + Math.min(width - 1, x + 1)];
            normals[index * 2 + 1] = relief[Math.max(0, y - 1) * width + x] - relief[Math.min(height - 1, y + 1) * width + x];
        }
        if (normalMap && normalMap.length === normals.length) normals.set(normalMap);
        return { data: new Uint8ClampedArray(data), normals: normals, width: width, height: height,
            roughness: detail && detail.roughness, cavity: detail && detail.cavity };
    }
    function shade(surface, material, cx, cy, lights, phase, settings, coefficients) {
        if (material === "lava") {
            if (coefficients) coefficients.gain.fill(1);
            return new Uint8ClampedArray(surface.data);
        }
        var output = new Uint8ClampedArray(surface.data.length), response = materials.get(material);
        var relief = response.relief;
        for (var y = 0; y < surface.height; y++) for (var x = 0; x < surface.width; x++) {
            var n = y * surface.width + x, index = n * 4;
            var nx = surface.normals[n * 2] * relief, ny = surface.normals[n * 2 + 1] * relief;
            var roughness = surface.roughness ? surface.roughness[n] : response.roughness;
            var cavity = surface.cavity ? surface.cavity[n] : 1;
            var length = Math.hypot(nx, ny, 1), r = .94 * cavity, g = .96 * cavity, b = cavity, sr = 0, sg = 0, sb = 0;
            lights.forEach(function (light) {
                var dx = light.x - cx + .5 - (x + .5) / surface.width;
                var dy = light.y - cy + .5 - (y + .5) / surface.height;
                var height = .65 + (light.elevation || .65), planar = Math.hypot(dx, dy), distance = Math.hypot(dx, dy, height);
                var attenuation = sampling.falloff(planar, light.radius)
                    * sampling.coverage(light.visibility, (x + .5) / surface.width, (y + .5) / surface.height);
                var diffuse = Math.max(.15, (nx * dx + ny * dy + height) / (length * distance)) * cavity;
                var optical = material === "crystal" || material === "glass";
                var energy = attenuation * light.strength * response.gain * (optical ? emission.level(light, (phase || 0) * 200, true) : 1);
                var specular = 0;
                if (!settings || settings.reflections !== false) {
                    var hx = dx / distance, hy = dy / distance - .22, hz = height / distance + 1;
                    var aligned = Math.max(0, (nx * hx + ny * hy + hz) / (length * Math.hypot(hx, hy, hz)));
                    var grazing = Math.max(0, 1 - (1 - ny * .22) / (length * Math.hypot(.22, 1)));
                    var fresnel = optical ? .5 + .5 * Math.pow(grazing, 5) : 1;
                    specular = Math.pow(aligned, 8 + (1 - roughness) * 38) * response.reflectance * fresnel;
                }
                r += diffuse * energy * light.colour[0] / 255;
                g += diffuse * energy * light.colour[1] / 255;
                b += diffuse * energy * light.colour[2] / 255;
                // Wet reflections retain the source hue independently of the
                // dark liquid's albedo; diffuse light still follows its pigment.
                sr += specular * energy * light.colour[0] * .75;
                sg += specular * energy * light.colour[1] * .75;
                sb += specular * energy * light.colour[2] * .75;
            });
            r = Math.min(1.75, r); g = Math.min(1.7, g); b = Math.min(1.65, b);
            sr = Math.min(32, sr); sg = Math.min(32, sg); sb = Math.min(32, sb);
            output[index] = surface.data[index] * r + sr;
            output[index + 1] = surface.data[index + 1] * g + sg;
            output[index + 2] = surface.data[index + 2] * b + sb;
            output[index + 3] = surface.data[index + 3];
            if (coefficients) {
                coefficients.gain[index] = r; coefficients.gain[index + 1] = g; coefficients.gain[index + 2] = b;
                coefficients.add[index] = sr; coefficients.add[index + 1] = sg; coefficients.add[index + 2] = sb;
            }
        }
        return output;
    }
    return { prepare: prepare, shade: shade };
});
