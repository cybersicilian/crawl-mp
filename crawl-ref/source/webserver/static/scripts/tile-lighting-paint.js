/* Canvas adapter for a tile-lighting scene; all lighting stays inside visibility. */
define(["tile-atmosphere", "light-map-paint", "emissive-paint", "visibility-feather"], function (atmosphere, lightMaps, emissive, feather) {
    "use strict";
    function rectangles(ctx, cells, coords) {
        ctx.beginPath();
        cells.forEach(function (cell) {
            var p = coords(cell.x, cell.y);
            ctx.rect(p.x, p.y, p.width, p.height);
        });
    }
    function paint(ctx, scene, coords, now, animated, settings) {
        settings = settings || {};
        ctx.save();
        rectangles(ctx, scene.cells, coords); ctx.clip();
        (settings.borders === false ? [] : scene.floors).forEach(function (cell) {
            var p = coords(cell.x, cell.y), gradient;
            if (cell.north) {
                gradient = ctx.createLinearGradient(0, p.y, 0, p.y + p.height * .12);
                gradient.addColorStop(0, "rgba(8,12,20,.16)");
                gradient.addColorStop(1, "rgba(8,12,20,0)");
                ctx.fillStyle = gradient; ctx.fillRect(p.x, p.y, p.width, p.height * .12);
            }
            if (cell.west) {
                gradient = ctx.createLinearGradient(p.x, 0, p.x + p.width * .09, 0);
                gradient.addColorStop(0, "rgba(8,12,20,.1)");
                gradient.addColorStop(1, "rgba(8,12,20,0)");
                ctx.fillStyle = gradient; ctx.fillRect(p.x, p.y, p.width * .09, p.height);
            }
        });
        if (settings.lighting !== false) lightMaps.paint(ctx, scene.lights, coords, now, animated);
        ctx.restore();
        atmosphere.paint(ctx, scene, coords, now, animated && settings.particles !== false);
        if (settings.lighting !== false) feather.paint(ctx, scene, coords, false);
    }
    return { paint: paint, paintRadiance: function (ctx, scene, coords, now, animated, settings) {
        var stats = emissive.paint(ctx, scene, coords, now, animated, settings); feather.paint(ctx, scene, coords, true); return stats;
    }, clear: emissive.clear };
});
