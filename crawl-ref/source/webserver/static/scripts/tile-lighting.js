/* Geometry-only lighting: consumers supply visible cells, solids, and emitters.
 * No world queries outside the supplied visible viewport and no state mutation. */
define([], function () {
    "use strict";
    function key(x, y) { return x + ":" + y; }
    function reaches(cells, from, to, target) {
        var dx = to.x - from.x, dy = to.y - from.y;
        // Supercover traversal: a diagonal ray cannot leak through two corners.
        var steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4);
        var previousX = from.x, previousY = from.y, throughput = 1, crossed;
        for (var step = 1; step <= steps; step++) {
            var x = Math.round(from.x + dx * step / steps);
            var y = Math.round(from.y + dy * step / steps);
            // Quarter-cell steps often remain in the same grid cell. Its
            // visibility/transmission and corner checks already passed.
            if (x === previousX && y === previousY) continue;
            var cell = cells.get(key(x, y));
            if (!cell) return 0;
            if ((x !== from.x || y !== from.y) && (x !== target.x || y !== target.y)) {
                if (!cell.transmission) return 0;
                if (cell.transmission < 1) {
                    var id = key(x, y);
                    if (!crossed) crossed = new Set();
                    if (!crossed.has(id)) { throughput *= cell.transmission; crossed.add(id); }
                }
            }
            if (previousX !== x && previousY !== y) {
                var horizontal = cells.get(key(x, previousY));
                var vertical = cells.get(key(previousX, y));
                if (!horizontal || !vertical || !horizontal.transmission || !vertical.transmission) return 0;
            }
            previousX = x; previousY = y;
        }
        return throughput;
    }
    function create(view, read, limit) {
        var cells = new Map(), lights = [];
        for (var y = view.y; y < view.y + view.rows; y++)
            for (var x = view.x; x < view.x + view.cols; x++) {
                var input = read(x, y);
                if (!input || !input.visible) continue;
                var cell = { x: x, y: y, solid: Boolean(input.solid),
                    transmission: input.solid ? Math.max(0, Math.min(1, input.transmission || 0)) : 1,
                    surface: input.surface || null, occupied: Boolean(input.occupied), effect: input.effect || null,
                    emission: input.emission || null };
                cells.set(key(x, y), cell);
                if (input.light) lights.push(Object.assign({ x: x, y: y }, input.light));
            }
        var cx = view.x + view.cols / 2, cy = view.y + view.rows / 2;
        lights.sort(function (a, b) {
            return Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy);
        });
        lights = lights.slice(0, limit || 24).map(function (light) {
            var receivers = [];
            var source = cells.get(key(light.x, light.y));
            // Wall-mounted lights emit through their exposed faces. Starting a
            // ray in solid geometry would wrongly shadow adjacent floor tiles.
            var origins = source.solid && !source.transmission ? [[0, -1], [1, 0], [0, 1], [-1, 0]].map(function (offset) {
                return cells.get(key(light.x + offset[0], light.y + offset[1]));
            }).filter(function (cell) { return cell && !cell.solid; }) : [light];
            cells.forEach(function (cell) {
                if (Math.hypot(cell.x - light.x, cell.y - light.y) >= light.radius + .71) return;
                var faces = cell.solid && !cell.transmission ? [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(function (side) {
                    var neighbour = cells.get(key(cell.x + side[0], cell.y + side[1]));
                    return neighbour && !neighbour.solid;
                }) : null;
                var visibility = [];
                for (var sy = -1; sy <= 1; sy++) for (var sx = -1; sx <= 1; sx++) {
                    // Wall art represents an exposed vertical face, not a point
                    // buried in solid geometry. Sample its open side instead.
                    var targets = faces ? faces.map(function (side) {
                        return { x: cell.x + side[0] * .51 + (side[1] ? sx * .45 : 0),
                            y: cell.y + side[1] * .51 + (side[0] ? sy * .45 : 0) };
                    }) : [{ x: cell.x + sx * .49, y: cell.y + sy * .49 }];
                    var amount = 0;
                    origins.some(function (origin) {
                        targets.some(function (target) {
                            amount = Math.max(amount, reaches(cells, origin, target, cell));
                            return amount >= 1;
                        });
                        return amount >= 1;
                    });
                    visibility.push(amount);
                }
                if (visibility.some(Boolean)) receivers.push(Object.assign({}, cell, { visibility: visibility }));
            });
            var original = new Map(receivers.map(function (cell) { return [key(cell.x, cell.y), cell.visibility.slice()]; }));
            // Adjacent receivers share conservative edge samples. The mask reaches
            // zero at blocked or unknown neighbours instead of ending in a bright
            // rectangle, and both material shading and bloom use this same mask.
            receivers.forEach(function (cell) {
                for (var sy = -1; sy <= 1; sy++) for (var sx = -1; sx <= 1; sx++) {
                    var xs = sx ? [0, sx] : [0], ys = sy ? [0, sy] : [0], value = 1;
                    xs.forEach(function (ox) { ys.forEach(function (oy) {
                        var other = original.get(key(cell.x + ox, cell.y + oy));
                        var index = (oy ? -sy + 1 : sy + 1) * 3 + (ox ? -sx + 1 : sx + 1);
                        value = Math.min(value, other ? other[index] : 0);
                    }); });
                    cell.visibility[(sy + 1) * 3 + sx + 1] = value;
                }
            });
            var neighbours = lights.filter(function (other) {
                return Math.hypot(other.x - light.x, other.y - light.y) < 2;
            }).length;
            return Object.assign({}, light, { receivers: receivers,
                strength: light.strength / Math.max(1, neighbours * .65) });
        });
        var floors = [];
        cells.forEach(function (cell) {
            if (cell.solid) return;
            var north = cells.get(key(cell.x, cell.y - 1)), west = cells.get(key(cell.x - 1, cell.y));
            floors.push(Object.assign({}, cell, { north: Boolean(north && north.solid && !north.transmission),
                west: Boolean(west && west.solid && !west.transmission) }));
        });
        var samples = new Map();
        lights.forEach(function (light) {
            light.receivers.forEach(function (cell) {
                var id = key(cell.x, cell.y);
                if (!samples.has(id)) samples.set(id, []);
                samples.get(id).push(Object.assign({}, light, { visibility: cell.visibility }));
            });
        });
        return { cells: Array.from(cells.values()), floors: floors, lights: lights,
            known: function (x, y) { return cells.has(key(x, y)); },
            at: function (x, y) { return samples.get(key(x, y)) || []; } };
    }
    return { create: create };
});
