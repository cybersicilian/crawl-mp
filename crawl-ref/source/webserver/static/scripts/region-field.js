/* Connected exact cell masks with shared interior motion and exposed-edge
 * distance. Internal tile edges never become contours. */
define([], function () {
    "use strict";
    var sides = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    function key(x, y) { return x + ":" + y; }
    function create(input) {
        var kinds = new Map(), result = [];
        input.forEach(function (cell) {
            if (!kinds.has(cell.kind)) kinds.set(cell.kind, new Map());
            kinds.get(cell.kind).set(key(cell.x, cell.y), cell);
        });
        kinds.forEach(function (pending, kind) {
            while (pending.size) {
                var first = pending.values().next().value, queue = [first], cells = new Map(), edges = new Map();
                pending.delete(key(first.x, first.y));
                for (var i = 0; i < queue.length; i++) {
                    var cell = queue[i]; cells.set(key(cell.x, cell.y), cell);
                    sides.forEach(function (side) {
                        var id = key(cell.x + side.x, cell.y + side.y), next = pending.get(id);
                        if (next) { pending.delete(id); queue.push(next); }
                    });
                }
                var center = { x: 0, y: 0 };
                cells.forEach(function (cell, id) {
                    center.x += cell.x + .5; center.y += cell.y + .5;
                    var segments = [];
                    sides.forEach(function (side) {
                        if (cells.has(key(cell.x + side.x, cell.y + side.y))) return;
                        var x = cell.x + (side.x > 0 ? 1 : 0), y = cell.y + (side.y > 0 ? 1 : 0);
                        segments.push({ x: x, y: y, dx: side.x ? 0 : 1, dy: side.y ? 0 : 1 });
                    });
                    if (segments.length) edges.set(id, segments);
                });
                center.x /= cells.size; center.y /= cells.size;
                result.push({ kind: kind, cells: cells, edges: edges, center: center, radius: Math.sqrt(cells.size / Math.PI) });
            }
        });
        return result;
    }
    function distance(group, wx, wy) {
        var cx = Math.floor(wx), cy = Math.floor(wy), closest = 1.5;
        for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++)
            (group.edges.get(key(x, y)) || []).forEach(function (edge) {
                var t = Math.max(0, Math.min(1, (wx - edge.x) * edge.dx + (wy - edge.y) * edge.dy));
                closest = Math.min(closest, Math.hypot(wx - edge.x - edge.dx * t, wy - edge.y - edge.dy * t));
            });
        return closest;
    }
    function sample(group, wx, wy, seconds, profile) {
        if (!group.cells.has(key(Math.floor(wx), Math.floor(wy)))) return { alpha: 0, colour: profile.colour };
        var d = distance(group, wx, wy), fade = Math.min(1, d / .1);
        // A filtered indicator rounds the union contour, while the exact mask
        // above retains the native affected-cell contract, holes and occluders.
        var covered = 0, total = 0, cx = Math.floor(wx), cy = Math.floor(wy);
        for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) {
            var weight = Math.exp(-(Math.pow(wx - x - .5, 2) + Math.pow(wy - y - .5, 2)) / .56);
            total += weight; if (group.cells.has(key(x, y))) covered += weight;
        }
        var rim = Math.exp(-Math.pow((covered / total - .7) / .115, 2));
        var phase = seconds * profile.speed, pulse = .88 + Math.sin(phase) * .12;
        var wave = Math.sin(wx * 3 + wy * 2 - phase);
        var alpha = (profile.fill + rim * profile.rim + (wave + 1) * profile.motion) * fade * pulse;
        var mix = Math.min(1, rim * .85), base = profile.colour, edge = profile.edge;
        return { alpha: Math.min(.6, alpha), colour: [base[0] * (1 - mix) + edge[0] * mix,
            base[1] * (1 - mix) + edge[1] * mix, base[2] * (1 - mix) + edge[2] * mix] };
    }
    function circleShape(group, wx, wy, profile) {
        var radius = Math.max(.55, group.radius), r = Math.hypot(wx - group.center.x, wy - group.center.y) / radius;
        var t = Math.max(0, Math.min(1, (r - .55) / .72)), edge = 1 - t * t * (3 - 2 * t);
        var corona = Math.exp(-Math.pow((r - .82) / .25, 2));
        var tint = Math.min(.8, r * r * .65), base = profile.colour, rim = profile.edge;
        return { angle: r * Math.PI * 5, fade: edge,
            base: profile.fill * (profile.fill > .2 ? .95 : 1.75) + profile.rim * corona * .22,
            colour: [base[0] * (1 - tint) + rim[0] * tint, base[1] * (1 - tint) + rim[1] * tint,
                base[2] * (1 - tint) + rim[2] * tint] };
    }
    function circleAlpha(angle, base, fade, offset, pulse) {
        var wave = Math.pow(Math.max(0, Math.sin(angle - offset)), 10);
        return Math.min(.4, (base + wave * .045) * fade * pulse);
    }
    function circle(group, wx, wy, seconds, profile) {
        var shape = circleShape(group, wx, wy, profile), phase = seconds * profile.speed;
        return { alpha: circleAlpha(shape.angle, shape.base, shape.fade,
            phase * 2.3 * (profile.inward ? -1 : 1), .94 + Math.sin(phase) * .06), colour: shape.colour };
    }
    // Capture immutable geometry/profile data once; animation only changes alpha.
    // Float64 storage retains the point sampler's arithmetic without quantizing it.
    function prepareCircle(group, x, y, width, height, profile) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
            throw new RangeError("Circle raster dimensions must be positive integers");
        var count = width * height, angle = new Float64Array(count), base = new Float64Array(count);
        var fade = new Float64Array(count), colour = new Uint8ClampedArray(count * 4);
        for (var py = 0; py < height; py++) for (var px = 0; px < width; px++) {
            var n = py * width + px, shape = circleShape(group, x + (px + .5) / width, y + (py + .5) / height, profile);
            angle[n] = shape.angle; base[n] = shape.base; fade[n] = shape.fade;
            colour.set(shape.colour, n * 4);
        }
        return { width: width, height: height, angle: angle, base: base, fade: fade, colour: colour,
            speed: profile.speed, direction: profile.inward ? -1 : 1,
            bytes: angle.byteLength + base.byteLength + fade.byteLength + colour.byteLength };
    }
    function circlePixels(prepared, seconds) {
        var output = new Uint8ClampedArray(prepared.colour), phase = seconds * prepared.speed;
        var offset = phase * 2.3 * prepared.direction, pulse = .94 + Math.sin(phase) * .06;
        for (var n = 0; n < prepared.angle.length; n++)
            output[n * 4 + 3] = circleAlpha(prepared.angle[n], prepared.base[n], prepared.fade[n], offset, pulse) * 255;
        return output;
    }
    return { create: create, distance: distance, sample: sample, circle: circle,
        prepareCircle: prepareCircle, circlePixels: circlePixels };
});
