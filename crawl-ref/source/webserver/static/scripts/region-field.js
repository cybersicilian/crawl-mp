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
        var mix = Math.min(1, rim * .85);
        return { alpha: Math.min(.6, alpha), colour: profile.colour.map(function (value, c) {
            return value * (1 - mix) + profile.edge[c] * mix;
        }) };
    }
    function circle(group, wx, wy, seconds, profile) {
        var radius = Math.max(.55, group.radius), r = Math.hypot(wx - group.center.x, wy - group.center.y) / radius;
        var t = Math.max(0, Math.min(1, (r - .55) / .72)), edge = 1 - t * t * (3 - 2 * t);
        var pulse = .94 + Math.sin(seconds * profile.speed) * .06;
        var corona = Math.exp(-Math.pow((r - .82) / .25, 2));
        var wave = Math.pow(Math.max(0, Math.sin(r * Math.PI * 5 - seconds * profile.speed * 2.3 * (profile.inward ? -1 : 1))), 10);
        var alpha = (profile.fill * (profile.fill > .2 ? .95 : 1.75) + profile.rim * corona * .22 + wave * .045) * edge * pulse;
        var tint = Math.min(.8, r * r * .65);
        return { alpha: Math.min(.4, alpha), colour: profile.colour.map(function (value, c) {
            return value * (1 - tint) + profile.edge[c] * tint;
        }) };
    }
    return { create: create, distance: distance, sample: sample, circle: circle };
});
