/* Continuous radial waves across soft region approximations. The supplied
 * pixel reader exposes terrain only; actors and exact targeting never enter it. */
define(["pixel-sampling"], function (pixels) {
    "use strict";
    function displacement(group, wx, wy, seconds, profile) {
        var dx = wx - group.center.x, dy = wy - group.center.y, distance = Math.hypot(dx, dy);
        var radius = Math.max(.55, group.radius), r = distance / radius;
        var t = Math.max(0, Math.min(1, (r - .55) / .72)), fade = 1 - t * t * (3 - 2 * t);
        var wave = Math.sin(r * Math.PI * 5 - seconds * profile.speed * 2.3 * (profile.inward ? -1 : 1));
        var amount = wave * fade * Math.min(1, distance * 3) * (profile.distortion || .55);
        return { x: dx / Math.max(.001, distance) * amount, y: dy / Math.max(.001, distance) * amount };
    }
    function shade(data, width, height, cx, cy, fields, seconds, profileFor, read) {
        var out = new Uint8ClampedArray(data.length), fallback = pixels.reader(data, width, height);
        var profiles = fields.map(function (group) { return profileFor(group.kind); });
        function guarded(sx, sy) { var value = read(sx, sy); return value === null || value === undefined ? fallback(x, y) : value; }
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var wx = cx * width + x, wy = cy * height + y, dx = 0, dy = 0;
            for (var f = 0; f < fields.length; f++) {
                var offset = displacement(fields[f], (wx + .5) / width, (wy + .5) / height, seconds, profiles[f]);
                dx += offset.x; dy += offset.y;
            }
            var scale = Math.min(1, .85 / Math.max(.001, Math.hypot(dx, dy)));
            var colour = pixels.bilinear(guarded, wx + dx * scale, wy + dy * scale);
            out.set(colour, (y * width + x) * 4);
        }
        return out;
    }
    return { displacement: displacement, shade: shade };
});
