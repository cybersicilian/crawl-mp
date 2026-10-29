define(["jquery", "require", "./map_knowledge"], function ($, require, map) {
    "use strict";
    var image = new Image(), renderer, poses = new Map(), rolls = new Map();
    var timer = null, running = false, floor = null;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    image.src = require.toUrl("./sprites/tortle-shell.png");

    function redraw(pose) {
        if (renderer && pose && renderer.in_view(pose.pos.x, pose.pos.y))
            renderer.render_loc(pose.pos.x, pose.pos.y);
    }
    function tick() {
        window.clearTimeout(timer); timer = null;
        if (!running || document.hidden || !renderer) return;
        var now = window.performance.now(), active = false;
        rolls.forEach(function (until, slot) {
            if (until <= now) {
                rolls.delete(slot);
                var pose = poses.get(slot);
                if (pose) { pose.changed = now; pose.transition = true; }
            }
        });
        poses.forEach(function (pose) {
            if (pose.retracted || pose.transition && now - pose.changed < 240 || rolls.has(pose.slot)) {
                redraw(pose);
                active = active || renderer.in_view(pose.pos.x, pose.pos.y);
            }
        });
        if (active && !motion.matches) timer = window.setTimeout(tick, 80);
    }
    function sync(event, state) {
        var now = window.performance.now(), previous = poses;
        if (floor !== state.floor) { previous = new Map(); rolls.clear(); }
        floor = state.floor;
        poses = new Map();
        (state.members || []).forEach(function (hero) {
            if (!hero.pos || hero.on_same_level === false) return;
            var retracted = (hero.statuses || []).some(function (status) { return status.light === "Shell"; });
            var old = previous.get(hero.slot);
            poses.set(hero.slot, { slot: hero.slot, pos: hero.pos, retracted: retracted,
                changed: old && old.retracted === retracted ? old.changed : now,
                transition: old ? old.retracted !== retracted || old.transition : false });
            if (old && (old.pos.x !== hero.pos.x || old.pos.y !== hero.pos.y)) redraw(old);
        });
        tick();
    }
    function paint(ctx, x, y, width, height, angle, stretch) {
        if (!image.complete || !image.naturalWidth) return false;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(x + width / 2, y + height * 0.64);
        ctx.rotate(angle || 0);
        ctx.scale(1, stretch || 1);
        ctx.drawImage(image, -width / 2, -height * 0.64, width, height);
        ctx.restore();
        return true;
    }
    function draw(view, cx, cy, x, y, normal, hasDoll) {
        if (hasDoll === false) return false;
        var pose = Array.from(poses.values()).find(function (entry) {
            return entry.pos.x === cx && entry.pos.y === cy;
        });
        if (!pose || !map.visible(map.get(cx, cy)) || !image.complete || !image.naturalWidth)
            return false;
        var now = window.performance.now(), age = now - pose.changed;
        if (!motion.matches && (rolls.get(pose.slot) || 0) > now) return true;
        var size = view.scaled_size(), ctx = view.ctx;
        if (pose.retracted && (!pose.transition || age >= 100 || motion.matches)) {
            var phase = motion.matches ? 0 : Math.sin(now / 420);
            return paint(ctx, x, y, size.width, size.height, phase * 0.025, 1 + phase * 0.025);
        }
        if (pose.transition && age < 240 && !motion.matches) {
            var progress = Math.min(1, age / (pose.retracted ? 100 : 240));
            var squash = pose.retracted ? 1 - progress * 0.65 : 0.6 + progress * 0.4;
            ctx.save();
            ctx.translate(x + size.width / 2, y + size.height);
            ctx.scale(1 + (1 - squash) * 0.2, squash);
            ctx.translate(-x - size.width / 2, -y - size.height);
            normal();
            ctx.restore();
            return true;
        }
        return false;
    }
    function reset() {
        window.clearTimeout(timer); timer = null; poses.clear(); rolls.clear(); floor = null;
    }
    image.onload = tick;
    $(document).on("game_init.shellAnimation", function () { reset(); running = true; })
        .on("game_cleanup.shellAnimation", function () { running = false; reset(); })
        .on("party_state_rendered.shellAnimation", sync)
        .on("visibilitychange.shellAnimation", tick);
    motion.addEventListener("change", tick);
    return { attach: function (view) { renderer = view; }, draw: draw, paint: paint,
        roll: function (slot, until) { if (Number.isInteger(slot)) { rolls.set(slot, until); tick(); } } };
});
