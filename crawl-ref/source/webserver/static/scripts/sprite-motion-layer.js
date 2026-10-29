/* Native sprite capture and transient compositing; input and world state stay exact. */
define([], function () {
    "use strict";
    function create(settings) {
        var renderer, canvas, context, frame = null, sprites = new WeakMap();
        function ensure() {
            if (canvas) return;
            canvas = document.createElement("canvas"); canvas.className = settings.className;
            canvas.setAttribute("aria-hidden", "true");
            Object.assign(canvas.style, { position: "fixed", pointerEvents: "none", zIndex: "21", imageRendering: "pixelated" });
            document.body.appendChild(canvas); context = canvas.getContext("2d");
        }
        function repaint(now) {
            if (!renderer || !renderer.element || !renderer.element.isConnected || !settings.allowed()) return;
            if (!settings.poses.size) { if (canvas) canvas.remove(); canvas = context = null; return; }
            ensure(); if (!context) return;
            var element = renderer.element, bounds = element.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            if (canvas.width !== element.width) canvas.width = element.width;
            if (canvas.height !== element.height) canvas.height = element.height;
            Object.assign(canvas.style, { left: bounds.left + "px", top: bounds.top + "px", width: bounds.width + "px", height: bounds.height + "px" });
            var clip = settings.clipBounds && settings.clipBounds();
            canvas.style.clipPath = clip ? "inset(" + [Math.max(0, clip.top - bounds.top), Math.max(0, bounds.right - clip.right),
                Math.max(0, bounds.bottom - clip.bottom), Math.max(0, clip.left - bounds.left)].map(function (n) { return n + "px"; }).join(" ") + ")" : "none";
            context.clearRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = false;
            context.save(); context.beginPath();
            settings.cells().forEach(function (cell) { var p = renderer.canvas_coords(cell.x, cell.y); context.rect(p.x, p.y, p.width, p.height); });
            context.clip();
            Array.from(settings.poses.values()).sort(function (a, b) { return a.pos.y - b.pos.y || a.pos.x - b.pos.x; }).forEach(function (pose) {
                var sprite = sprites.get(pose);
                if (!sprite || !settings.visible(pose.origin) || !settings.visible(pose.pos)) return;
                var sample = settings.sample(pose, now), point = renderer.canvas_coords(sample.x, sample.y);
                var size = renderer.scaled_size(), groundX = point.x + size.width / 2, groundY = point.y + size.height;
                context.save();
                context.translate(Math.round(groundX), Math.round(groundY - sample.lift * size.height));
                context.scale(1 + sample.squash * .5, 1 - sample.squash);
                context.drawImage(sprite.canvas, -size.width * 2.5, -size.height * 3, size.width * 5, size.height * 5);
                context.restore();
            });
            context.restore(); canvas.dataset.actors = String(settings.poses.size);
        }
        function tick(now) {
            frame = null;
            if (!renderer || !renderer.element || !renderer.element.isConnected) { clear(false); return; }
            if (!settings.allowed()) { clear(true); return; }
            var bounds = renderer.element.getBoundingClientRect();
            if (!bounds.width || !bounds.height) { clear(true); return; }
            settings.poses.forEach(function (pose, key) {
                if (!settings.visible(pose.origin) || !settings.visible(pose.pos) || !settings.current(pose)) {
                    settings.poses.delete(key); settings.redraw(pose.pos); return;
                }
                if (settings.sample(pose, now).done && !pose.finishing) { pose.finishing = true; settings.redraw(pose.pos); }
            });
            repaint(now);
            if (settings.poses.size) frame = window.requestAnimationFrame(tick);
        }
        function request() { if (frame === null && settings.poses.size) frame = window.requestAnimationFrame(tick); }
        function capture(view, cx, cy, x, y, cell, paint) {
            if (view !== renderer || !settings.allowed()) return false;
            var pose = settings.poses.get(settings.key(cell, cx, cy));
            if (!pose || pose.pos.x !== cx || pose.pos.y !== cy) return false;
            if (pose.finishing) {
                paint(); settings.poses.delete(pose.key); repaint(window.performance.now()); return true;
            }
            var size = view.scaled_size(), sprite = sprites.get(pose), stamp = view.frame_time;
            if (!sprite || sprite.canvas.width !== size.width * 5 || sprite.canvas.height !== size.height * 5) {
                var image = document.createElement("canvas"); image.width = size.width * 5; image.height = size.height * 5;
                sprite = { canvas: image, ctx: image.getContext("2d"), stamp: null }; sprites.set(pose, sprite);
            }
            if (!sprite.ctx) return false;
            if (sprite.stamp !== stamp) { sprite.ctx.clearRect(0, 0, sprite.canvas.width, sprite.canvas.height); sprite.stamp = stamp; }
            var original = view.ctx;
            sprite.ctx.save(); sprite.ctx.translate(size.width * 2 - x, size.height * 2 - y);
            sprite.ctx.globalAlpha = original.globalAlpha; sprite.ctx.imageSmoothingEnabled = false;
            view.ctx = sprite.ctx;
            try { paint(); } finally { view.ctx = original; sprite.ctx.restore(); }
            repaint(window.performance.now()); request(); return true;
        }
        function clear(redraw) {
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null;
            if (redraw) settings.poses.forEach(function (pose) { settings.redraw(pose.pos); });
            settings.poses.clear(); sprites = new WeakMap();
            if (canvas) canvas.remove(); canvas = context = null;
        }
        return { attach: function (view) { renderer = view; }, capture: capture, request: request, clear: clear };
    }
    return { create: create };
});
