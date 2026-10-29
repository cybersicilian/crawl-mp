/* Shallow raised-surface cues and short directional ground shadows. The caller
 * supplies known solid neighbours; tile coordinates and input stay unchanged. */
define([], function () {
    "use strict";
    function paint(ctx, point, solid, north, west, northwest, contour) {
        var x = point.x, y = point.y, w = point.width, h = point.height, gradient;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        if (solid) {
            if (contour === undefined || contour & 1) {
                gradient = ctx.createLinearGradient(0, y, 0, y + h * .18);
                gradient.addColorStop(0, "rgba(197,207,184,.1)"); gradient.addColorStop(1, "rgba(197,207,184,0)");
                ctx.fillStyle = gradient; ctx.fillRect(x, y, w, h * .18);
            }
            if (contour === undefined || contour & 4) {
                gradient = ctx.createLinearGradient(0, y + h * .7, 0, y + h);
                gradient.addColorStop(0, "rgba(3,6,10,0)"); gradient.addColorStop(1, "rgba(3,6,10,.28)");
                ctx.fillStyle = gradient; ctx.fillRect(x, y + h * .7, w, h * .3);
            }
            if (contour === undefined || contour & 2) {
                gradient = ctx.createLinearGradient(x + w * .84, 0, x + w, 0);
                gradient.addColorStop(0, "rgba(3,6,10,0)"); gradient.addColorStop(1, "rgba(3,6,10,.15)");
                ctx.fillStyle = gradient; ctx.fillRect(x + w * .84, y, w * .16, h);
            }
        } else {
            if (north) {
                gradient = ctx.createLinearGradient(x, y, x + w * .12, y + h * .37);
                gradient.addColorStop(0, "rgba(3,6,12," + .35 * Number(north) + ")"); gradient.addColorStop(.45, "rgba(3,6,12," + .2 * Number(north) + ")");
                gradient.addColorStop(1, "rgba(3,6,12,0)");
                ctx.fillStyle = gradient; ctx.fillRect(x, y, w, h * .4);
            }
            if (west) {
                gradient = ctx.createLinearGradient(x, y, x + w * .25, y + h * .08);
                gradient.addColorStop(0, "rgba(3,6,12," + .25 * Number(west) + ")"); gradient.addColorStop(1, "rgba(3,6,12,0)");
                ctx.fillStyle = gradient; ctx.fillRect(x, y, w * .3, h);
            }
            if (northwest && !north && !west) {
                gradient = ctx.createRadialGradient(x, y, 0, x, y, w * .35);
                gradient.addColorStop(0, "rgba(3,6,12," + .22 * Number(northwest) + ")"); gradient.addColorStop(1, "rgba(3,6,12,0)");
                ctx.fillStyle = gradient; ctx.fillRect(x, y, w * .4, h * .4);
            }
        }
        ctx.restore();
    }
    return { paint: paint };
});
