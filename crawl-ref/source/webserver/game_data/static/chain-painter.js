/* Canvas-only iron links; coordinates and scale belong to the caller. */
define([], function () {
    "use strict";

    var iron = { dark: "#17191f", body: "#747d89", light: "#e0e7ea", ember: "#b45a42" };
    var bronze = { dark: "#211b18", body: "#a38358", light: "#f1d5a0", ember: "#d57b44" };

    function ellipse(context, x, y, rx, ry, angle, start, end) {
        context.beginPath();
        context.ellipse(x, y, rx, ry, angle, start || 0, end === undefined ? Math.PI * 2 : end);
    }

    function link(context, x, y, angle, scale, edge, palette) {
        var rx = 3.3 * scale, ry = (edge ? .85 : 1.9) * scale;
        ellipse(context, x, y + scale, rx, ry, angle);
        context.strokeStyle = palette.dark;
        context.lineWidth = 3.1 * scale;
        context.stroke();
        ellipse(context, x, y, rx, ry, angle);
        context.strokeStyle = palette.body;
        context.lineWidth = 1.7 * scale;
        context.stroke();
        ellipse(context, x, y, rx, ry, angle, Math.PI, Math.PI * 1.85);
        context.strokeStyle = edge ? palette.ember : palette.light;
        context.lineWidth = .65 * scale;
        context.stroke();
    }

    function cuff(context, point, palette, scale) {
        var x = point.x, y = point.y + point.size * .16;
        ellipse(context, x, y, point.size * .23, point.size * .105, 0);
        context.strokeStyle = palette.dark;
        context.lineWidth = 4 * scale;
        context.stroke();
        context.strokeStyle = palette.body;
        context.lineWidth = 2.2 * scale;
        context.stroke();
        ellipse(context, x, y, point.size * .23, point.size * .105, 0, 0, Math.PI);
        context.strokeStyle = palette.light;
        context.lineWidth = .8 * scale;
        context.stroke();
        context.fillStyle = palette.ember;
        context.fillRect(x - 1.2 * scale, y + point.size * .065, 2.4 * scale, 2 * scale);
    }

    function floorAnchor(context, point, scale, palette) {
        context.save();
        context.translate(point.x, point.y);
        ellipse(context, 0, 2 * scale, 5.5 * scale, 2.8 * scale, 0);
        context.fillStyle = "rgba(0,0,0,.65)";
        context.fill();
        context.strokeStyle = palette.dark;
        context.lineWidth = 2.6 * scale;
        context.stroke();
        context.strokeStyle = palette.body;
        context.lineWidth = 1.2 * scale;
        context.stroke();
        context.beginPath();
        context.moveTo(-2 * scale, -5 * scale);
        context.lineTo(2 * scale, -5 * scale);
        context.lineTo(scale, 3 * scale);
        context.closePath();
        context.fillStyle = palette.light;
        context.fill();
        context.strokeStyle = palette.dark;
        context.lineWidth = scale;
        context.stroke();
        context.restore();
    }

    function paint(context, anchor, target, pinned) {
        var scale = target.size / 32;
        var palette = pinned ? bronze : iron;
        // Attach below the torso so the links leave faces and weapons legible.
        var start = { x: anchor.x, y: anchor.y + anchor.size * .16 };
        var end = { x: target.x, y: target.y + target.size * .16 };
        if (pinned) {
            start.x -= anchor.size * .24;
            start.y += anchor.size * .18;
        }
        var dx = end.x - start.x, dy = end.y - start.y;
        var distance = Math.hypot(dx, dy);
        var inset = pinned ? 0 : Math.min(target.size * .22, distance * .2);
        var sag = Math.min(4.5 * scale, distance * .07);
        var count = Math.max(1, Math.ceil((distance - inset * 2) / (4.8 * scale)));
        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        for (var index = 0; index <= count; index++) {
            var t = distance ? (inset + (distance - inset * 2) * index / count) / distance : 0;
            var angle = Math.atan2(dy + sag * Math.PI * Math.cos(Math.PI * t), dx);
            link(context, start.x + dx * t, start.y + dy * t + sag * Math.sin(Math.PI * t),
                angle, scale, index % 2 === 1, palette);
        }
        if (pinned) floorAnchor(context, start, scale, palette);
        cuff(context, target, palette, scale);
        context.restore();
    }

    return { paint: paint };
});
