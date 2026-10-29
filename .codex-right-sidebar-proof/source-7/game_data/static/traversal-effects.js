define(["jquery", "comm", "./map_knowledge", "./shell-animation"], function ($, comm, map, shells) {
    "use strict";

    // Transient presentation only: native traversal owns collisions and timing.
    // Map-space anchors follow camera movement and viewport scaling each frame.
    var renderer, canvas, context, frame = null, particles = [], running = false;
    var floor = null;
    var rolls = [];
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var colours = ["#bca780", "#e0c99c", "#85735d", "#f6dfa8"];
    var limit = 240, lifetime = 620;

    function clear() {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        particles = [];
        rolls = [];
        if (canvas) canvas.remove();
        canvas = context = null;
    }

    function ensure() {
        if (canvas) return;
        canvas = document.createElement("canvas");
        canvas.className = "traversal-particles";
        canvas.setAttribute("aria-hidden", "true");
        Object.assign(canvas.style, { position: "fixed", pointerEvents: "none",
            zIndex: "20", imageRendering: "pixelated" });
        document.body.appendChild(canvas);
        context = canvas.getContext("2d");
    }

    function draw(now) {
        frame = null;
        if (!running || document.hidden || motion.matches || !renderer.element
            || !renderer.element.isConnected) { clear(); return; }
        particles = particles.filter(function (particle) { return now < particle.born + lifetime; });
        rolls = rolls.filter(function (roll) { return now < roll.born + roll.duration; });
        if (!particles.length && !rolls.length) { clear(); return; }
        ensure();
        var bounds = renderer.element.getBoundingClientRect();
        if (!bounds.width || !bounds.height) { clear(); return; }
        var width = renderer.element.width, height = renderer.element.height;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        Object.assign(canvas.style, { left: bounds.left + "px", top: bounds.top + "px",
            width: bounds.width + "px", height: bounds.height + "px" });
        context.clearRect(0, 0, canvas.width, canvas.height);
        var cell = renderer.canvas_coords(0, 0);
        var unit = Math.min(cell.width, cell.height);
        particles.forEach(function (particle) {
            var age = now - particle.born;
            if (age < 0 || !renderer.in_view(particle.x, particle.y)
                || !map.visible(map.get(particle.x, particle.y))) return;
            var progress = age / lifetime;
            var point = renderer.canvas_coords(particle.x, particle.y);
            var x = point.x + point.width * 0.5 + particle.vx * unit * progress;
            var y = point.y + point.height * 0.7 + particle.vy * unit * progress
                - unit * 0.2 * Math.sin(progress * Math.PI);
            var size = Math.max(2, Math.round(unit * particle.size * (1 - progress * 0.55)));
            context.globalAlpha = (1 - progress) * 0.85;
            context.fillStyle = colours[particle.colour];
            context.fillRect(Math.round(x), Math.round(y), size, size);
        });
        context.globalAlpha = 1;
        rolls.forEach(function (roll) {
            var progress = Math.min(1, Math.max(0, (now - roll.born) / roll.duration));
            var step = progress * (roll.path.length - 1), index = Math.floor(step);
            var from = roll.path[index], to = roll.path[Math.min(index + 1, roll.path.length - 1)];
            if (!map.visible(map.get(from.x, from.y))) return;
            var point = renderer.canvas_coords(from.x + (to.x - from.x) * (step - index),
                from.y + (to.y - from.y) * (step - index));
            shells.paint(context, point.x, point.y, point.width, point.height, progress * Math.PI * 6);
        });
        canvas.dataset.particles = String(particles.length);
        frame = window.requestAnimationFrame(draw);
    }

    function burst(point, count, born, impact) {
        for (var index = 0; index < count; index++) {
            var angle = index * Math.PI * 2 / count + (point.x + point.y) * 0.7;
            var speed = impact ? 0.65 : 0.3;
            particles.push({ x: point.x, y: point.y, born: born,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed * 0.6 - 0.12,
                size: impact ? 0.1 : 0.075, colour: index % colours.length });
        }
    }

    function receive(data) {
        if (!running || !renderer || document.hidden || motion.matches
            || !Array.isArray(data.path)) return;
        var path = data.path.slice(0, 128).filter(function (point) {
            return point && Number.isInteger(point.x) && Number.isInteger(point.y);
        });
        if (!path.length) return;
        var now = window.performance.now();
        if (data.sprite === "shell") {
            var route = data.impact && path.length > 1 ? path.slice(0, -1) : path;
            var duration = Math.min(380, 150 + route.length * 18);
            rolls.push({ path: route, born: now, duration: duration });
            rolls = rolls.slice(-4);
            shells.roll(data.actor_slot, now + duration);
        }
        path.forEach(function (point, index) {
            burst(point, 6, now + Math.min(160, index * 12), false);
        });
        // A collision throws a brighter, wider spray than an ordinary stop.
        burst(path[path.length - 1], data.impact ? 18 : 10,
            now + Math.min(160, (path.length - 1) * 12), Boolean(data.impact));
        particles = particles.slice(-limit);
        if (frame === null) frame = window.requestAnimationFrame(draw);
    }

    comm.register_handlers({ traversal_effect: receive });
    $(document).on("game_init.traversalEffects", function () {
        clear(); floor = null; running = true;
    }).on("game_cleanup.traversalEffects", function () {
        running = false; floor = null; clear();
    }).on("visibilitychange.traversalEffects", function () {
        if (document.hidden) clear();
    }).on("party_state_rendered.traversalEffects", function (event, state) {
        if (floor !== null && floor !== state.floor) clear();
        floor = state.floor;
    });
    motion.addEventListener("change", function () { if (motion.matches) clear(); });
    return { attach: function (view) { renderer = view; } };
});
