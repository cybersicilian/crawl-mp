/* Project only the current native-visible target. This overlay never participates in picking. */
define(["mesh-camera"], function (math) {
    "use strict";
    function project(camera, point, width, height) {
        var matrix = math.matrix(camera, width, height), clip = [0, 0, 0, 0];
        for (var row = 0; row < 4; row++) for (var c = 0; c < 4; c++) clip[row] += matrix[c * 4 + row] * (c === 3 ? 1 : point[c]);
        if (clip[3] <= .035) return null;
        return { x: (clip[0] / clip[3] + 1) * width / 2, y: (1 - clip[1] / clip[3]) * height / 2 };
    }
    function create(host) {
        var canvas = document.createElement("canvas"); canvas.className = "first-person-highlight"; canvas.hidden = true;
        canvas.setAttribute("aria-hidden", "true"); host.append(canvas);
        function clear() { canvas.hidden = true; delete canvas.dataset.target; delete canvas.dataset.range; }
        function render(scene, camera, width, height, target) {
            clear();
            if (!target || (!target.active && !target.hovering) || target.tactical || !target.location || !scene) return;
            var loc = target.location, cell = scene.get(loc.x, loc.y); if (!cell) return;
            var sprite = scene.subject ? scene.subject(loc.x,loc.y) : scene.sprites.find(function (entry) { return entry.x === loc.x && entry.y === loc.y && entry.layer === "actor"; });
            var points, right = math.basis(camera).right;
            if (sprite) {
                var half = sprite.width / 2, y = sprite.elevation || 0;
                points = [[-half,y], [half,y], [half,y+sprite.height], [-half,y+sprite.height]].map(function (p) {
                    return [loc.x+.5+right[0]*p[0], p[1], loc.y+.5+right[2]*p[0]];
                });
            } else points = [[loc.x,.045,loc.y], [loc.x+1,.045,loc.y], [loc.x+1,.045,loc.y+1], [loc.x,.045,loc.y+1]];
            var projected = points.map(function (p) { return project(camera, p, width, height); });
            if (projected.some(function (p) { return !p; })) return;
            var left = Math.min.apply(null, projected.map(function (p) { return p.x; }));
            var top = Math.min.apply(null, projected.map(function (p) { return p.y; }));
            var bottom = Math.max.apply(null, projected.map(function (p) { return p.y; }));
            var end = Math.max.apply(null, projected.map(function (p) { return p.x; }));
            if (end < 0 || left > width || bottom < 0 || top > height) return;
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
            var ctx = canvas.getContext("2d"), out = target.range === "out", colour = out ? "#ffb36a" : "#e4eef4";
            ctx.clearRect(0, 0, width, height);
            if (sprite && end > left && bottom > top) {
                ctx.globalAlpha = .24; ctx.drawImage(sprite.image, left, top, end-left, bottom-top);
                ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = colour; ctx.fillRect(0, 0, width, height);
                ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
            }
            ctx.strokeStyle = colour; ctx.lineWidth = Math.max(1.5, width / 640);
            ctx.setLineDash(out ? [7, 5] : []); ctx.shadowColor = colour; ctx.shadowBlur = 5;
            ctx.beginPath(); projected.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.stroke();
            ctx.shadowBlur = 0; ctx.setLineDash([]);
            var label = (out ? "× OUT OF RANGE · " : target.acknowledged || target.hovering ? "" : "AIMING · ") + target.label;
            ctx.font = Math.max(12, width / 90) + "px system-ui, sans-serif";
            var textWidth = Math.min(width - 16, ctx.measureText(label).width + 16), x = Math.max(8, Math.min(width-textWidth-8, (left+end-textWidth)/2));
            var textY = Math.max(20, Math.min(height-90, top-12));
            ctx.fillStyle = "#080d16e8"; ctx.fillRect(x-4, textY-17, textWidth+8, 24);
            ctx.fillStyle = colour; ctx.fillText(label, x+4, textY, Math.max(1, textWidth-8));
            canvas.hidden = false; canvas.dataset.target = loc.x + ":" + loc.y; canvas.dataset.range = target.range;
        }
        return { render: render, clear: clear, destroy: function () { canvas.remove(); } };
    }
    return { create: create, project: project };
});
