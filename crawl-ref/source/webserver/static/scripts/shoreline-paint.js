/* Ground beside a liquid: damp or scorched stains from the shared shore field.
 * The liquid side composes its own bank; connected interiors stay untouched. */
define(["shore-field"], function (shores) {
    "use strict";
    function stain(ctx, rect, kind, mask, cx, cy) {
        var image = mask ? shores.stain(kind, mask, cx, cy) : null;
        if (image) ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }
    function paint(ctx, terrain, rect, cx, cy) {
        if (terrain.own.surface || terrain.own.solid) return;
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
        stain(ctx, rect, "hot", terrain.scorch, cx, cy);
        stain(ctx, rect, "wet", terrain.damp, cx, cy);
        ctx.restore();
    }
    return { paint: paint };
});
