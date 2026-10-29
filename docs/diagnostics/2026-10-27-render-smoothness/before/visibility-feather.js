/* Feather visibility inward. Unknown pixels are never painted or sampled. */
define([], function () {
    "use strict";
    var cache = new WeakMap();
    function distance(wx, wy, known) {
        var cx = Math.floor(wx), cy = Math.floor(wy), nearest = 1;
        for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) {
            if (known(x, y)) continue;
            var dx = Math.max(x - wx, 0, wx - x - 1), dy = Math.max(y - wy, 0, wy - y - 1);
            nearest = Math.min(nearest, Math.hypot(dx, dy));
        }
        return nearest;
    }
    function prepare(scene) {
        if (cache.has(scene)) return cache.get(scene);
        var entries = [], cells = new Set(scene.cells.map(function (cell) { return cell.x + ":" + cell.y; }));
        var known = scene.known || function (x, y) { return cells.has(x + ":" + y); };
        scene.cells.forEach(function (cell) {
            if (distance(cell.x + .5, cell.y + .5, known) >= 1) return;
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            var ctx = canvas.getContext("2d"); if (!ctx) return;
            var pixels = ctx.createImageData(32, 32);
            for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
                var d = distance(cell.x + (x + .5) / 32, cell.y + (y + .5) / 32, known);
                var t = Math.min(1, d / .8), n = (y * 32 + x) * 4;
                pixels.data[n] = 2; pixels.data[n + 1] = 4; pixels.data[n + 2] = 8;
                pixels.data[n + 3] = (1 - t * t * (3 - 2 * t)) * 255;
            }
            ctx.putImageData(pixels, 0, 0); entries.push({ x: cell.x, y: cell.y, canvas: canvas });
        });
        cache.set(scene, entries); return entries;
    }
    function paint(ctx, scene, coords, erase) {
        ctx.save(); ctx.imageSmoothingEnabled = true;
        if (erase) ctx.globalCompositeOperation = "destination-out";
        else ctx.globalAlpha = .72;
        prepare(scene).forEach(function (entry) {
            var p = coords(entry.x, entry.y); ctx.drawImage(entry.canvas, p.x, p.y, p.width, p.height);
        });
        ctx.restore();
    }
    return { paint: paint, distance: distance };
});
