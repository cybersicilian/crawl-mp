/* Bounded pixel effects. Every particle is clipped to visible, unoccupied tiles. */
define([], function () {
    "use strict";
    var priority = { ember: 0, fire: 0, fountain: 0, lava: 1, water: 2 };
    function rank(cell) { return (Math.imul(cell.x, 374761393) ^ Math.imul(cell.y, 668265263)) >>> 0; }
    function paint(ctx, scene, coords, now, enabled) {
        if (!enabled) return;
        var available = scene.cells.filter(function (cell) { return !cell.occupied || cell.emission && !cell.emission.blocked; });
        var emitters = available.filter(function (cell) {
            return cell.effect === "ember" || cell.effect === "fire" || cell.effect === "fountain"
                || cell.effect === "lava" && (cell.x + cell.y) % 2 === 0
                || cell.effect === "water" && (cell.x * 11 + cell.y * 7) % 5 === 0;
        }).sort(function (a, b) {
            return priority[a.effect] - priority[b.effect] || rank(a) - rank(b);
        }).slice(0, 32);
        if (!emitters.length) return;
        ctx.save(); ctx.beginPath();
        available.forEach(function (cell) { var p = coords(cell.x, cell.y); ctx.rect(p.x, p.y, p.width, p.height); });
        ctx.clip();
        emitters.forEach(function (cell) {
            var p = coords(cell.x, cell.y), unit = Math.max(1, Math.round(p.width / 32));
            var seed = Math.abs(cell.x * 31 + cell.y * 47), cycle = (now / 2600 + seed * .137) % 1;
            if (cell.effect === "lava") {
                for (var spark = 0; spark < 3; spark++) {
                    var life = (cycle + spark / 3) % 1;
                    var sx = p.x + p.width * (.2 + spark * .25 + Math.sin(seed + life * 4) * .07);
                    var sy = p.y + p.height * (.65 - life * .9);
                    ctx.globalAlpha = Math.sin(life * Math.PI) * .72;
                    ctx.fillStyle = life < .4 ? "#ffe2a1" : "#ef9c49";
                    ctx.fillRect(Math.round(sx), Math.round(sy), unit, life < .5 ? unit * 2 : unit);
                    if (spark === 1) {
                        ctx.fillStyle = "#aaa39b"; ctx.globalAlpha = Math.sin(life * Math.PI) * .08;
                        ctx.fillRect(Math.round(sx + unit * 2), Math.round(sy - unit * 3), unit * 3, unit * 2);
                    }
                }
                if (cycle < .45) {
                    ctx.fillStyle = "#ffd38c"; ctx.globalAlpha = Math.sin(cycle / .45 * Math.PI) * .4;
                    ctx.fillRect(p.x + 14 * unit, p.y + 18 * unit, unit * 3, unit);
                    ctx.fillRect(p.x + 13 * unit, p.y + 19 * unit, unit, unit * 2);
                    ctx.fillRect(p.x + 17 * unit, p.y + 19 * unit, unit, unit * 2);
                }
                return;
            }
            if (cell.effect === "water") {
                if (cycle > .65) return;
                var radius = (2 + cycle * 7) * unit;
                var x = p.x + p.width * .5, y = p.y + p.height * .56;
                ctx.fillStyle = cell.effect === "water" ? "#99c3cb" : "#ffc36a";
                ctx.globalAlpha = (1 - cycle / .65) * (cell.effect === "water" ? .13 : .26);
                ctx.fillRect(Math.round(x - radius / 2), Math.round(y - radius / 3), radius, unit);
                ctx.fillRect(Math.round(x - radius / 2), Math.round(y + radius / 3), radius, unit);
                ctx.fillRect(Math.round(x - radius / 2 - unit), Math.round(y), unit, unit);
                ctx.fillRect(Math.round(x + radius / 2), Math.round(y), unit, unit);
                return;
            }
            for (var particle = 0; particle < 3; particle++) {
                var age = (cycle + particle / 3) % 1;
                var fiery = cell.effect === "ember" || cell.effect === "fire";
                var px = fiery ? p.x + p.width * (.5 + Math.sin(age * 5 + seed) * .09)
                    : p.x + p.width * (.5 + (particle - 1) * age * .21);
                var py = fiery ? p.y + p.height * (.48 - age * .65)
                    : p.y + p.height * (.55 - Math.sin(age * Math.PI) * .28);
                ctx.globalAlpha = Math.sin(age * Math.PI) * .6;
                ctx.fillStyle = fiery ? "#ffd28a" : "#a3d5e1";
                ctx.fillRect(Math.round(px), Math.round(py), unit, unit);
                if (cell.effect === "fountain" && age > .5) {
                    ctx.globalAlpha *= .28;
                    ctx.fillRect(Math.round(px), Math.round(py - unit * 2), unit, unit);
                }
            }
        });
        ctx.restore();
    }
    return { paint: paint };
});
