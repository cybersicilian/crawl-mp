/* Replace configured atlas regions while retaining their exact native alpha masks. */
define(["tile-edges"], function (edges) {
    "use strict";
    function dimensions(image) {
        return [image.naturalWidth || image.width, image.naturalHeight || image.height];
    }
    function create() {
        var cache = new WeakMap();
        function image(source, sheet, regions) {
            if (!source || !sheet || !sheet.complete || !sheet.naturalWidth || !regions.length) return source;
            var size = dimensions(source), materialSize = dimensions(sheet);
            var version = [sheet.currentSrc || sheet.src, materialSize.join(":"), size.join(":")].join(":");
            var old = cache.get(source);
            if (old && old.version === version && old.regions === regions) return old.result;
            var result = source;
            try {
                var atlas = document.createElement("canvas");
                atlas.width = size[0]; atlas.height = size[1];
                var context = atlas.getContext("2d");
                if (!context) throw new Error("Canvas is unavailable");
                context.drawImage(source, 0, 0);
                var tile = document.createElement("canvas");
                regions.forEach(function (region) {
                    tile.width = region.w; tile.height = region.h;
                    var ctx = tile.getContext("2d"), material = region.material;
                    if (!ctx) throw new Error("Canvas is unavailable");
                    ctx.imageSmoothingEnabled = true;
                    ctx.save(); ctx.translate(tile.width / 2, tile.height / 2);
                    ctx.rotate((region.turns || 0) * Math.PI / 2);
                    ctx.drawImage(sheet, material.x, material.y, material.w, material.h,
                        -tile.width / 2, -tile.height / 2, tile.width, tile.height);
                    ctx.restore();
                    ctx.globalAlpha = region.shade || 0; ctx.fillStyle = "#000";
                    ctx.fillRect(0, 0, tile.width, tile.height);
                    ctx.globalAlpha = region.detail || 0;
                    ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, tile.width, tile.height);
                    ctx.globalAlpha = 1;
                    if (region.border) edges.paint(ctx, { x: 0, y: 0, width: tile.width, height: tile.height }, 15, region.border);
                    ctx.globalCompositeOperation = "destination-in";
                    ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, tile.width, tile.height);
                    context.clearRect(region.x, region.y, region.w, region.h);
                    context.drawImage(tile, region.x, region.y);
                });
                result = atlas;
            } catch (error) {
                // Missing/unreadable materials retain all original atlas capability.
                result = source;
            }
            cache.set(source, { version: version, regions: regions, result: result });
            return result;
        }
        return { image: image };
    }
    return { create: create };
});
