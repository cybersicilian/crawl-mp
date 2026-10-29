define([], function () {
    "use strict";

    // Reusable, bounded transient canvas. Callers supply map visibility and paint;
    // no engine, hero or input rules belong in the layer.
    function create(settings) {
        var renderer, canvas, context, frame = null, effects = [], enabled = false;
        var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        function clear() {
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null; effects = [];
            if (canvas) canvas.remove();
            canvas = context = null;
        }
        function allowed() { return enabled && !document.hidden && !motion.matches; }
        function visible(pos) {
            return pos && renderer.in_view(pos.x, pos.y) && settings.visible(pos);
        }
        function draw(now) {
            frame = null;
            if (!allowed() || !renderer || !renderer.element || !renderer.element.isConnected) {
                clear(); return;
            }
            effects = effects.filter(function (effect) { return now < effect.born + effect.duration; });
            if (!effects.length) { clear(); return; }
            var bounds = renderer.element.getBoundingClientRect();
            if (!bounds.width || !bounds.height) { clear(); return; }
            if (!canvas) {
                canvas = document.createElement("canvas");
                canvas.className = settings.className;
                canvas.setAttribute("aria-hidden", "true");
                Object.assign(canvas.style, { position: "fixed", pointerEvents: "none", zIndex: "20" });
                document.body.appendChild(canvas);
                context = canvas.getContext("2d");
                if (!context) { clear(); return; }
            }
            if (canvas.width !== renderer.element.width) canvas.width = renderer.element.width;
            if (canvas.height !== renderer.element.height) canvas.height = renderer.element.height;
            Object.assign(canvas.style, { left: bounds.left + "px", top: bounds.top + "px",
                width: bounds.width + "px", height: bounds.height + "px" });
            var clip = settings.clipBounds && settings.clipBounds();
            canvas.style.clipPath = clip ? "inset(" + [Math.max(0, clip.top - bounds.top), Math.max(0, bounds.right - clip.right),
                Math.max(0, bounds.bottom - clip.bottom), Math.max(0, clip.left - bounds.left)].map(function (n) { return n + "px"; }).join(" ") + ")" : "none";
            context.clearRect(0, 0, canvas.width, canvas.height);
            effects.forEach(function (effect) {
                // Check both ends: trails must not expose a previously hidden origin.
                if (!visible(effect.pos) || effect.origin && !visible(effect.origin)) return;
                context.save();
                settings.paint(context, effect, renderer.canvas_coords(effect.pos.x, effect.pos.y),
                    Math.max(0, (now - effect.born) / effect.duration), canvas.width / bounds.width);
                context.restore();
            });
            canvas.dataset.effects = String(effects.length);
            frame = window.requestAnimationFrame(draw);
        }
        function play(incoming) {
            if (!allowed() || !renderer || !incoming.length) return;
            var now = window.performance.now();
            incoming.forEach(function (effect) {
                // Autoexplore and rapid packets replace a hero's old cue of the same kind.
                effects = effects.filter(function (old) { return old.key !== effect.key; });
                effects.push(Object.assign({}, effect, { born: now }));
            });
            effects = effects.slice(-(settings.limit || 32));
            if (frame === null) frame = window.requestAnimationFrame(draw);
        }
        document.addEventListener("visibilitychange", function () { if (document.hidden) clear(); });
        motion.addEventListener("change", function () { if (motion.matches) clear(); });
        function remove(key) {
            effects = effects.filter(function (effect) { return effect.key !== key; });
            if (!effects.length) clear();
        }
        return { attach: function (view) { renderer = view; }, play: play, clear: clear, remove: remove,
            allowed: allowed, setEnabled: function (value) { enabled = value; if (!value) clear(); } };
    }
    return { create: create };
});
