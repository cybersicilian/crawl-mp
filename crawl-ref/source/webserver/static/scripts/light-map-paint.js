/* Smooth irradiance on a small cached grid. No main-canvas readback or game state. */
define(["light-field-sampling", "light-emission"], function (sampling, emission) {
    "use strict";
    var cache = new WeakMap(), clips = new WeakMap(), resolution = 8;
    function prepare(light) {
        if (cache.has(light)) return cache.get(light);
        if (!light.receivers.length) return null;
        var left = Math.min.apply(null, light.receivers.map(function (cell) { return cell.x; }));
        var top = Math.min.apply(null, light.receivers.map(function (cell) { return cell.y; }));
        var right = Math.max.apply(null, light.receivers.map(function (cell) { return cell.x; })) + 1;
        var bottom = Math.max.apply(null, light.receivers.map(function (cell) { return cell.y; })) + 1;
        var canvas = document.createElement("canvas");
        canvas.width = (right - left) * resolution; canvas.height = (bottom - top) * resolution;
        var ctx = canvas.getContext("2d");
        if (!ctx) return null;
        var image = ctx.createImageData(canvas.width, canvas.height);
        light.receivers.forEach(function (cell) {
            for (var y = 0; y < resolution; y++) for (var x = 0; x < resolution; x++) {
                var u = (x + .5) / resolution, v = (y + .5) / resolution;
                var distance = Math.hypot(cell.x + u - light.x - .5, cell.y + v - light.y - .5);
                var energy = sampling.falloff(distance, light.radius) * sampling.coverage(cell.visibility, u, v);
                var index = (((cell.y - top) * resolution + y) * canvas.width + (cell.x - left) * resolution + x) * 4;
                image.data[index] = light.colour[0]; image.data[index + 1] = light.colour[1];
                image.data[index + 2] = light.colour[2];
                image.data[index + 3] = Math.min(1, energy * light.strength / .19 * .095) * 255;
            }
        });
        ctx.putImageData(image, 0, 0);
        var entry = { canvas: canvas, left: left, top: top, cols: right - left, rows: bottom - top };
        cache.set(light, entry); return entry;
    }
    // A light's receiver clip only changes with the camera or cell size, so
    // the path is kept per light rather than rebuilt from its cells each frame.
    function clipTo(ctx, light, coords, key) {
        if (typeof Path2D !== "function") {
            ctx.beginPath();
            light.receivers.forEach(function (cell) { var p = coords(cell.x, cell.y); ctx.rect(p.x, p.y, p.width, p.height); });
            ctx.clip(); return;
        }
        var entry = clips.get(light);
        if (!entry || entry.key !== key) {
            entry = { key: key, path: new Path2D() };
            light.receivers.forEach(function (cell) { var p = coords(cell.x, cell.y); entry.path.rect(p.x, p.y, p.width, p.height); });
            clips.set(light, entry);
        }
        ctx.clip(entry.path);
    }
    function paint(ctx, lights, coords, now, animated) {
        ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.imageSmoothingEnabled = true;
        var origin = coords(0, 0) || {}, key = [origin.x, origin.y, origin.width, origin.height].join(":");
        lights.forEach(function (light) {
            var image = prepare(light);
            if (!image) return;
            var point = coords(image.left, image.top);
            ctx.save();
            clipTo(ctx, light, coords, key);
            ctx.globalAlpha = Math.min(1, emission.level(light, now, animated) / 1.12);
            ctx.drawImage(image.canvas, point.x, point.y, point.width * image.cols, point.height * image.rows);
            ctx.restore();
        });
        ctx.restore();
    }
    return { paint: paint };
});
