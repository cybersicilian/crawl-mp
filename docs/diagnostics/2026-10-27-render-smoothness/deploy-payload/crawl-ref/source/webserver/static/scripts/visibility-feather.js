/* Feather visibility inward. Unknown pixels are never painted or sampled. */
define([], function () {
    "use strict";
    var cache = new WeakMap(), masks = new Map();
    function distance(wx, wy, known) {
        var cx = Math.floor(wx), cy = Math.floor(wy), nearest = 1;
        for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) {
            if (known(x, y)) continue;
            var dx = Math.max(x - wx, 0, wx - x - 1), dy = Math.max(y - wy, 0, wy - y - 1);
            nearest = Math.min(nearest, Math.hypot(dx, dy));
        }
        return nearest;
    }
    function mask(bits) {
        if (masks.has(bits)) return masks.get(bits);
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
        var ctx = canvas.getContext("2d"); if (!ctx) return null;
        var pixels = ctx.createImageData(32, 32);
        // The feather depends only on the nine adjacent visibility bits, not
        // world position, scene identity, lighting, or the camera. At most 512
        // small masks are retained across scenes; no per-pixel map reads remain.
        function known(x, y) { return Boolean(bits & (1 << ((y + 1) * 3 + x + 1))); }
        for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
            var d = distance((x + .5) / 32, (y + .5) / 32, known);
            var t = Math.min(1, d / .8), n = (y * 32 + x) * 4;
            pixels.data[n] = 2; pixels.data[n + 1] = 4; pixels.data[n + 2] = 8;
            pixels.data[n + 3] = (1 - t * t * (3 - 2 * t)) * 255;
        }
        ctx.putImageData(pixels, 0, 0); masks.set(bits, canvas); return canvas;
    }
    function prepare(scene) {
        if (cache.has(scene)) return cache.get(scene);
        var entries = [], cells = new Set(scene.cells.map(function (cell) { return cell.x + ":" + cell.y; }));
        var known = scene.known || function (x, y) { return cells.has(x + ":" + y); };
        scene.cells.forEach(function (cell) {
            var bits = 0;
            for (var y = -1; y <= 1; y++) for (var x = -1; x <= 1; x++)
                if (known(cell.x + x, cell.y + y)) bits |= 1 << ((y + 1) * 3 + x + 1);
            if (bits === 511) return;
            var canvas = mask(bits);
            if (canvas) entries.push({ x: cell.x, y: cell.y, canvas: canvas });
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
