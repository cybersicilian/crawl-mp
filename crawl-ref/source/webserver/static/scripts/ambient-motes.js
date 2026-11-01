/* World-anchored drifting motes. Each is a pure function of its home cell and the
 * clock, so nothing is simulated and panning never restarts or relocates them. */
define([], function () {
    "use strict";
    var span = 3, kinds = {
        dust: { colour: "214,196,160", share: .16, size: 1, alpha: .3, vx: .05, vy: -.03, sway: .3 },
        pollen: { colour: "206,226,120", share: .12, size: 1.2, alpha: .36, vx: .07, vy: -.05, sway: .5 },
        fireflies: { colour: "206,244,110", share: .07, size: 1.5, alpha: .8, vx: .05, vy: .04, sway: .7, pulse: 1.3 },
        snow: { colour: "236,244,255", share: .42, size: 1.4, alpha: .66, vx: .11, vy: .34, sway: .35 },
        embers: { colour: "255,150,70", share: .2, size: 1.2, alpha: .7, vx: .06, vy: -.32, sway: .4, pulse: 2.2 },
        ash: { colour: "178,170,162", share: .26, size: 1.2, alpha: .42, vx: .1, vy: .16, sway: .5 },
        spores: { colour: "150,226,120", share: .1, size: 1.3, alpha: .4, vx: .03, vy: -.12, sway: .6 },
        spray: { colour: "220,240,246", share: .14, size: 1, alpha: .32, vx: .3, vy: -.04, sway: .3 },
        wisps: { colour: "170,214,206", share: .05, size: 2, alpha: .26, vx: .08, vy: -.06, sway: .8, pulse: .7 },
        sparkle: { colour: "246,232,190", share: .07, size: 1, alpha: .85, vx: 0, vy: -.02, sway: .1, pulse: 3 },
        void: { colour: "190,120,246", share: .1, size: 1.2, alpha: .5, vx: .02, vy: -.16, sway: .7, pulse: 1.1 }
    };
    function hash(x, y, salt) {
        var n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2147483647);
        n = Math.imul(n ^ n >>> 13, 1274126177);
        return ((n ^ n >>> 16) >>> 0) / 4294967295;
    }
    function wrap(value) { return value - Math.floor(value); }
    // Choose the cells that keep a mote, independent of the order they arrive in.
    function scatter(cells, kind) {
        var style = kinds[kind];
        if (!style) return [];
        return cells.filter(function (cell) { return hash(cell.x, cell.y, 1) < style.share; }).map(function (cell) {
            return { x: cell.x, y: cell.y, u: hash(cell.x, cell.y, 2), v: hash(cell.x, cell.y, 3), phase: hash(cell.x, cell.y, 4) * Math.PI * 2 };
        });
    }
    function paint(ctx, motes, kind, scale, origin, time, open) {
        var style = kinds[kind];
        if (!style) return 0;
        var drawn = 0, size = style.size * scale / 14;
        ctx.fillStyle = "rgb(" + style.colour + ")";
        for (var n = 0; n < motes.length; n++) {
            var mote = motes[n], u = wrap(mote.u + style.vx * time / span), v = wrap(mote.v + style.vy * time / span);
            var x = mote.x + u * span + Math.sin(time * .9 + mote.phase) * style.sway * .25;
            var y = mote.y + v * span + Math.cos(time * .7 + mote.phase) * style.sway * .2;
            if (open && !open(Math.floor(x), Math.floor(y))) continue;
            var fade = Math.sin(u * Math.PI) * Math.sin(v * Math.PI), glow = style.pulse ? .55 + .45 * Math.sin(time * style.pulse + mote.phase) : 1;
            ctx.globalAlpha = Math.max(0, style.alpha * Math.sqrt(fade) * glow);
            ctx.beginPath(); ctx.arc((x - origin.x) * scale, (y - origin.y) * scale, size / 2, 0, Math.PI * 2); ctx.fill();
            drawn++;
        }
        ctx.globalAlpha = 1;
        return drawn;
    }
    return { kinds: kinds, scatter: scatter, paint: paint };
});
