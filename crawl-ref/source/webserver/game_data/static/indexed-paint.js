/* Paint visible items only, with indexed invalidation from changed coordinates. */
define(["./frame-update"], function (frameUpdate) {
    "use strict";
    return function (draw) {
        var tracked = new Map(), locations = new Map(), visible = new Set(), dirty = new Set();
        var render = frameUpdate(function () {
            visible.forEach(function (node) {
                if (!dirty.has(node) || node.isConnected === false) return;
                draw(node); dirty.delete(node);
            });
        });
        var observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!tracked.has(entry.target)) return;
                // Layout/stack changes can report an already-visible portrait
                // again. Its retained canvas only needs paint after real data
                // invalidation; track() already marks newly created nodes dirty.
                if (entry.isIntersecting) visible.add(entry.target);
                else visible.delete(entry.target);
            });
            render();
        }, { rootMargin: "32px" });
        function detach(node, key) {
            var bucket = locations.get(key);
            if (bucket) { bucket.delete(node); if (!bucket.size) locations.delete(key); }
        }
        function track(node, x, y) {
            var key = x + "," + y, previous = tracked.get(node);
            if (previous === key) return;
            if (tracked.has(node)) detach(node, previous);
            else if (observer) observer.observe(node);
            else visible.add(node);
            tracked.set(node, key);
            if (!locations.has(key)) locations.set(key, new Set());
            locations.get(key).add(node); dirty.add(node); render();
        }
        function invalidate(node) { if (tracked.has(node)) { dirty.add(node); render(); } }
        function changed(points) {
            if (!Array.isArray(points)) tracked.forEach(function (key, node) { dirty.add(node); });
            else points.forEach(function (point) {
                var bucket = point && locations.get(point.x + "," + point.y);
                if (bucket) bucket.forEach(function (node) { dirty.add(node); });
            });
            if (dirty.size) render();
        }
        function remove(node) {
            detach(node, tracked.get(node)); tracked.delete(node); visible.delete(node); dirty.delete(node);
            if (observer) observer.unobserve(node);
        }
        function clear() {
            render.cancel(); if (observer) observer.disconnect();
            tracked.clear(); locations.clear(); visible.clear(); dirty.clear();
        }
        return { track: track, invalidate: invalidate, changed: changed, remove: remove, clear: clear };
    };
});
