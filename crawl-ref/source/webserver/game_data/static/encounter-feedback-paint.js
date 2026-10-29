define(["./view_data"], function (view) {
    "use strict";
    function paint(ctx, effect, point, progress, ratio) {
        var unit = Math.min(point.width, point.height);
        var x = point.x + point.width / 2, y = point.y + point.height / 2;
        ctx.lineWidth = Math.max(ratio, unit * 0.035);
        ctx.lineCap = "round";
        if (effect.kind === "target") {
            // Four corners settle around the native cursor; the cursor itself stays exact.
            var radius = unit * (0.34 + 0.17 * Math.pow(1 - progress, 3));
            var corner = unit * 0.13;
            ctx.globalAlpha = (1 - progress) * 0.8;
            ctx.strokeStyle = "#f6d79c";
            for (var i = 0; i < 4; i++) {
                var dx = i % 2 ? 1 : -1, dy = i > 1 ? 1 : -1;
                ctx.beginPath();
                ctx.moveTo(x + dx * (radius - corner), y + dy * radius);
                ctx.lineTo(x + dx * radius, y + dy * radius);
                ctx.lineTo(x + dx * radius, y + dy * (radius - corner));
                ctx.stroke();
            }
            return;
        }
        if (effect.kind === "strike") {
            ctx.strokeStyle = "#ffe0b5";
            ctx.globalAlpha = Math.pow(1 - progress, 1.5) * 0.9;
            var sweep = Math.min(1, progress * 3);
            ctx.lineWidth = Math.max(ratio, unit * 0.055 * (1 - progress * 0.6));
            ctx.beginPath();
            ctx.arc(x, y, unit * (0.2 + progress * 0.13), -Math.PI * 0.8,
                -Math.PI * 0.8 + Math.PI * 1.2 * sweep);
            ctx.stroke();
        }
        var colour = effect.kind === "magic" ? view.get_flash_colour(effect.colour) : { r: 255, g: 183, b: 127 };
        if (!colour) return;
        function bright(value) { return Math.min(255, Math.round(value * 1.3 + 45)); }
        ctx.fillStyle = "rgb(" + bright(colour.r) + "," + bright(colour.g) + "," + bright(colour.b) + ")";
        ctx.globalAlpha = Math.pow(1 - progress, 1.5) * 0.85;
        var count = effect.kind === "magic" ? 10 : 4 + Math.min(3, effect.strength || 1);
        for (var spark = 0; spark < count; spark++) {
            var angle = spark * Math.PI * 2 / count + (effect.pos.x + effect.pos.y) * 0.6;
            var radius = unit * (0.09 + progress * 0.36);
            var sx = x + Math.cos(angle) * radius, sy = y + Math.sin(angle) * radius * 0.8;
            var size = Math.max(ratio, unit * 0.045 * (1 - progress * 0.6));
            ctx.fillRect(Math.round(sx), Math.round(sy), Math.ceil(size), Math.ceil(size));
        }
    }
    return paint;
});
