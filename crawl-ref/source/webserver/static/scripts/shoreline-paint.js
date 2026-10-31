/* World-anchored pixel banks. Profiles are declarative; connected interiors stay open. */
define(["tile-edges"], function (edges) {
    "use strict";
    var profiles = {
        lava: { base: "#211d1d", body: "#45362e", rim: "#6a4b32", inner: "#b5652d", width: 2, variance: 3 },
        water: { base: "#13282c", body: "#354a45", rim: "#667568", width: 2, variance: 2 },
        hot: { base: "#111214c4", body: "#322b28a3", rim: "#8d572e55", width: 2, variance: 2 },
        wet: { base: "#162b30c4", body: "#3d514999", rim: "#8b9b7c65", width: 1, variance: 2 }
    };
    function grain(x, y) {
        var wx = (x % 256 + 256) % 256, wy = (y % 256 + 256) % 256;
        var n = Math.imul(Math.floor(wx / 3), 374761393) ^ Math.imul(Math.floor(wy / 3), 668265263);
        n = Math.imul(n ^ n >>> 13, 1274126177);
        return ((n ^ n >>> 16) >>> 0) / 4294967295;
    }
    function strip(ctx, rect, side, along, inset, width, colour) {
        var ux = rect.width / 32, uy = rect.height / 32;
        var x = side.x ? rect.x + (side.x > 0 ? 32 - inset - width : inset) * ux : rect.x + along * ux;
        var y = side.y ? rect.y + (side.y > 0 ? 32 - inset - width : inset) * uy : rect.y + along * uy;
        ctx.fillStyle = colour;
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(side.x ? width * ux : ux)),
            Math.max(1, Math.round(side.y ? width * uy : uy)));
    }
    function border(ctx, rect, mask, style, cx, cy) {
        if (!mask) return;
        edges.sides.forEach(function (side) {
            if (!(mask & side.bit)) return;
            for (var n = 0; n < 32; n++) {
                // Opposite sides sample the same boundary coordinate, so the
                // inside crust and outside bank share their irregular rhythm.
                var gx = cx * 32 + (side.x ? (side.x > 0 ? 32 : 0) : n);
                var gy = cy * 32 + (side.y ? (side.y > 0 ? 32 : 0) : n);
                var noise = grain(gx, gy), width = style.width + Math.floor(noise * style.variance);
                strip(ctx, rect, side, n, 0, width, style.base);
                if (width > 1) strip(ctx, rect, side, n, 1, width - 1, style.body);
                if (noise > .58) strip(ctx, rect, side, n, Math.max(0, width - 1), 1, style.rim);
                if (style.inner && noise > .78) strip(ctx, rect, side, n, width, 1, style.inner);
            }
        });
    }
    function paint(ctx, terrain, rect, cx, cy) {
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
        var surface = terrain.own.surface;
        if (profiles[surface]) border(ctx, rect, terrain.shore, profiles[surface], cx, cy);
        if (!surface && !terrain.own.solid) {
            border(ctx, rect, terrain.hot, profiles.hot, cx, cy);
            border(ctx, rect, terrain.wet, profiles.wet, cx, cy);
        }
        ctx.restore();
    }
    return { paint: paint };
});
