/* Soft pools of light that travel with their bearers. Everything outside a pool
 * falls gently into shade; marked points stay legible inside that shade. Light is
 * only added through the supplied mask, so unknown space stays unlit. */
define([], function () {
    "use strict";
    var warmth;
    function gradient(ctx, x, y, inner, outer, stops) {
        var fill = ctx.createRadialGradient(x, y, inner, x, y, outer);
        stops.forEach(function (stop) { fill.addColorStop(stop[0], stop[1]); });
        ctx.fillStyle = fill; ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
    }
    // Pools and clear points use tile units; `scale` is backing pixels per tile.
    function paint(ctx, scene, scale, settings) {
        var width = ctx.canvas.width, height = ctx.canvas.height, swell = settings.swell || 1;
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(4,6,12," + settings.shade + ")"; ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "destination-out";
        scene.pools.forEach(function (pool) {
            gradient(ctx, pool.x * scale, pool.y * scale, settings.inner * scale, settings.outer * swell * scale,
                [[0, "rgba(0,0,0,1)"], [.45, "rgba(0,0,0,.62)"], [1, "rgba(0,0,0,0)"]]);
        });
        (scene.clear || []).forEach(function (point) {
            gradient(ctx, point.x * scale, point.y * scale, 0, 1.3 * scale, [[0, "rgba(0,0,0,.9)"], [.5, "rgba(0,0,0,.72)"], [1, "rgba(0,0,0,0)"]]);
        });
        // A one-pixel-per-tile mask, smoothed upward, feathers light at the edge of sight.
        if (!warmth) warmth = document.createElement("canvas");
        if (warmth.width !== width) warmth.width = width;
        if (warmth.height !== height) warmth.height = height;
        var glow = warmth.getContext("2d");
        if (glow) {
            glow.globalCompositeOperation = "source-over"; glow.clearRect(0, 0, width, height);
            glow.globalCompositeOperation = "lighter";
            scene.pools.forEach(function (pool) {
                gradient(glow, pool.x * scale, pool.y * scale, 0, settings.warmth * swell * scale,
                    [[0, settings.glow + "," + settings.intensity + ")"], [.5, settings.glow + "," + settings.intensity * .42 + ")"], [1, settings.glow + ",0)"]]);
            });
            if (scene.mask) {
                glow.globalCompositeOperation = "destination-in"; glow.imageSmoothingEnabled = true;
                glow.drawImage(scene.mask, 0, 0, width, height);
            }
            ctx.globalCompositeOperation = "lighter"; ctx.drawImage(warmth, 0, 0);
        }
        ctx.globalCompositeOperation = "source-over";
    }
    return { paint: paint };
});
