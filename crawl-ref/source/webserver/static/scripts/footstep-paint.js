/* Small ground responses. The adapter supplies confirmed motion and material. */
define([], function () {
    "use strict";
    return function (ctx, effect, point, progress) {
        var unit = point.width / 32, x = point.x + point.width / 2, y = point.y + point.height * .8;
        ctx.beginPath(); ctx.rect(point.x, point.y, point.width, point.height); ctx.clip();
        var water = effect.surface === "water", fade = Math.pow(1 - progress, 1.6);
        ctx.fillStyle = water ? "#bedee1" : effect.surface === "lava" ? "#eea05b" : "#ccb58c";
        if (water) {
            var radius = (3 + progress * 11) * unit;
            ctx.globalAlpha = fade * .48;
            for (var ring = 0; ring < 2; ring++) {
                var r = radius * (ring ? .6 : 1), half = Math.round(r / 2);
                ctx.fillRect(Math.round(x - r), Math.round(y - half), r * 2, unit);
                ctx.fillRect(Math.round(x - r), Math.round(y + half), r * 2, unit);
                ctx.fillRect(Math.round(x - r - unit), Math.round(y - half + unit), unit, Math.max(unit, half * 2 - unit));
                ctx.fillRect(Math.round(x + r), Math.round(y - half + unit), unit, Math.max(unit, half * 2 - unit));
            }
        }
        for (var i = 0; i < (water ? 6 : 5); i++) {
            var angle = i * 2.4 + effect.pos.x * .7, spread = (2 + progress * (water ? 12 : 7)) * unit;
            ctx.globalAlpha = fade * (water ? .65 : .35);
            ctx.fillRect(Math.round(x + Math.cos(angle) * spread),
                Math.round(y + Math.sin(angle) * spread * .32 - Math.sin(progress * Math.PI) * (water ? 7 : 3) * unit),
                unit, unit * (water && progress < .4 ? 2 : 1));
        }
    };
});
