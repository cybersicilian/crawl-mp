/* Damage planning independent of canvas, tile art and simulation clocks. */
define([], function () {
    "use strict";
    function intersects(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
    function plan(view, dirty, reach, size) {
        size = size || 8; reach = Math.max(1, reach || 1);
        var bounds = { left: view.x, top: view.y, right: view.x + view.cols, bottom: view.y + view.rows };
        var chunks = new Map();
        (dirty || []).forEach(function (point) {
            var damage = { left: point.x - reach, top: point.y - reach,
                right: point.x + reach + 1, bottom: point.y + reach + 1 };
            if (!intersects(damage, bounds)) return;
            for (var y = Math.floor(Math.max(bounds.top, damage.top) / size); y <= Math.floor(Math.min(bounds.bottom - 1, damage.bottom - 1) / size); y++)
                for (var x = Math.floor(Math.max(bounds.left, damage.left) / size); x <= Math.floor(Math.min(bounds.right - 1, damage.right - 1) / size); x++) {
                    chunks.set(x + "," + y, { left: Math.max(bounds.left, x * size), top: Math.max(bounds.top, y * size),
                        right: Math.min(bounds.right, (x + 1) * size), bottom: Math.min(bounds.bottom, (y + 1) * size) });
                }
        });
        var rectangles = Array.from(chunks.values());
        return { rectangles: rectangles,
            includes: function (x, y) {
                var source = { left: x - reach, top: y - reach, right: x + reach + 1, bottom: y + reach + 1 };
                return rectangles.some(function (rect) { return intersects(source, rect); });
            } };
    }
    return { plan: plan };
});
