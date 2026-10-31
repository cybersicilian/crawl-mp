/* Pixel borders and feathered native-material transitions, below all actors. */
define(["tile-edges", "fluid-surface", "shoreline-paint"], function (edges, fluids, banks) {
    "use strict";
    function create() {
        var surfaces = fluids.create(192);
        function paint(ctx, terrain, point, cx, cy, time, settings) {
            settings = settings || {};
            var own = terrain.own;
            ctx.save(); ctx.imageSmoothingEnabled = false;
            // All terrain decoration is contained by its native tile rectangle.
            ctx.beginPath(); ctx.rect(point.x, point.y, point.width, point.height); ctx.clip();
            if (own.surface && settings.liquids !== false) {
                var fluid = surfaces.tile(settings.borders === false ? Object.assign({}, terrain, { shore: 0 }) : terrain, cx, cy, time);
                if (fluid) ctx.drawImage(fluid, point.x, point.y, point.width, point.height);
            } else if (own.solid && settings.borders !== false) {
                edges.paint(ctx, point, terrain.wall, { width: 1, shadow: "#080b12aa", light: "#dfc8a137" });
            }
            if (settings.borders !== false) banks.paint(ctx, terrain, point, cx, cy);
            ctx.restore();
        }
        return { paint: paint, clear: surfaces.clear, cacheSize: surfaces.cacheSize };
    }
    return { create: create };
});
