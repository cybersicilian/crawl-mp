/* Canvas adapter for a tile-lighting scene; all lighting stays inside visibility. */
define(["tile-atmosphere", "light-map-paint", "emissive-paint", "visibility-feather"], function (atmosphere, lightMaps, emissive, feather) {
    "use strict";
    var clips = new WeakMap(), strips = new Map();
    function coordsKey(coords) { var p = coords(0, 0) || {}; return [p.x, p.y, p.width, p.height].join(":"); }
    function rectangles(ctx, cells, coords) {
        ctx.beginPath();
        cells.forEach(function (cell) {
            var p = coords(cell.x, cell.y);
            ctx.rect(p.x, p.y, p.width, p.height);
        });
    }
    // The visible-cell clip is identical for every frame painted over one
    // scene window, so its path is built once instead of per repaint.
    function clipTo(ctx, scene, cells, coords) {
        if (typeof Path2D !== "function") { rectangles(ctx, cells, coords); ctx.clip(); return; }
        var key = coordsKey(coords), entry = clips.get(scene);
        if (!entry || entry.key !== key) {
            entry = { key: key, path: new Path2D() };
            cells.forEach(function (cell) { var p = coords(cell.x, cell.y); entry.path.rect(p.x, p.y, p.width, p.height); });
            clips.set(scene, entry);
        }
        ctx.clip(entry.path);
    }
    // Wall-shadow strips depend only on the cell size; one gradient per size
    // replaces two gradient objects per floor cell per frame.
    function strip(width, height, vertical) {
        var key = [width, height, vertical].join(":"), cached = strips.get(key);
        if (cached !== undefined) return cached;
        var canvas = typeof document === "object" && document.createElement ? document.createElement("canvas") : null;
        var w = Math.max(1, Math.round(vertical ? width * .09 : width)), h = Math.max(1, Math.round(vertical ? height : height * .12));
        var ctx = canvas ? (canvas.width = w, canvas.height = h, canvas.getContext("2d")) : null;
        if (ctx) {
            var gradient = vertical ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, vertical ? "rgba(8,12,20,.1)" : "rgba(8,12,20,.16)");
            gradient.addColorStop(1, "rgba(8,12,20,0)");
            ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
        }
        if (strips.size > 16) strips.clear();
        strips.set(key, ctx ? canvas : null);
        return ctx ? canvas : null;
    }
    function borders(ctx, floors, coords) {
        floors.forEach(function (cell) {
            var p = coords(cell.x, cell.y), gradient, image;
            if (cell.north) {
                image = strip(p.width, p.height, false);
                if (image) ctx.drawImage(image, p.x, p.y);
                else {
                    gradient = ctx.createLinearGradient(0, p.y, 0, p.y + p.height * .12);
                    gradient.addColorStop(0, "rgba(8,12,20,.16)");
                    gradient.addColorStop(1, "rgba(8,12,20,0)");
                    ctx.fillStyle = gradient; ctx.fillRect(p.x, p.y, p.width, p.height * .12);
                }
            }
            if (cell.west) {
                image = strip(p.width, p.height, true);
                if (image) ctx.drawImage(image, p.x, p.y);
                else {
                    gradient = ctx.createLinearGradient(p.x, 0, p.x + p.width * .09, 0);
                    gradient.addColorStop(0, "rgba(8,12,20,.1)");
                    gradient.addColorStop(1, "rgba(8,12,20,0)");
                    ctx.fillStyle = gradient; ctx.fillRect(p.x, p.y, p.width * .09, p.height);
                }
            }
        });
    }
    function paint(ctx, scene, coords, now, animated, settings) {
        settings = settings || {};
        ctx.save();
        clipTo(ctx, scene, scene.cells, coords);
        if (settings.borders !== false) borders(ctx, scene.floors, coords);
        if (settings.lighting !== false) lightMaps.paint(ctx, scene.lights, coords, now, animated);
        ctx.restore();
        atmosphere.paint(ctx, scene, coords, now, animated && settings.particles !== false);
        if (settings.lighting !== false) feather.paint(ctx, scene, coords, false);
    }
    return { paint: paint, paintRadiance: function (ctx, scene, coords, now, animated, settings) {
        var stats = emissive.paint(ctx, scene, coords, now, animated, settings); feather.paint(ctx, scene, coords, true); return stats;
    }, clear: emissive.clear };
});
