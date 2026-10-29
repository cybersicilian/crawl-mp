/* Cardinal edge masks and pixel-snapped inset bevels, independent of any tile game. */
define([], function () {
    "use strict";
    var sides = [{ x: 0, y: -1, bit: 1 }, { x: 1, y: 0, bit: 2 },
        { x: 0, y: 1, bit: 4 }, { x: -1, y: 0, bit: 8 }];
    function mask(kind, neighbours, connects) {
        if (kind === null || kind === undefined) return 0;
        return sides.reduce(function (result, side, index) {
            var other = neighbours[index];
            return other !== null && other !== undefined && !connects(kind, other) ? result | side.bit : result;
        }, 0);
    }
    function paint(ctx, rect, edges, style) {
        if (!edges || rect.width < 4 || rect.height < 4) return;
        var x = Math.round(rect.x), y = Math.round(rect.y);
        var w = Math.round(rect.width), h = Math.round(rect.height);
        var size = Math.max(1, Math.round(Math.min(w, h) * (style.width || 1) / 32));
        ctx.save();
        ctx.fillStyle = style.shadow;
        if (edges & 1) ctx.fillRect(x, y, w, size);
        if (edges & 2) ctx.fillRect(x + w - size, y, size, h);
        if (edges & 4) ctx.fillRect(x, y + h - size, w, size);
        if (edges & 8) ctx.fillRect(x, y, size, h);
        if (style.light) {
            ctx.fillStyle = style.light;
            if (edges & 1) ctx.fillRect(x + size, y + size, Math.max(0, w - 2 * size), size);
            if (edges & 8) ctx.fillRect(x + size, y + 2 * size, size, Math.max(0, h - 3 * size));
        }
        ctx.restore();
    }
    return { sides: sides, mask: mask, paint: paint };
});
