/* One decorative canvas stretched over the dungeon viewport, for effects that do
 * not need a native paint. It never captures input and it stops with the view. */
define(["jquery", "./dungeon_renderer", "./options", "./enums", "visual-presentation"],
function ($, renderer, options, enums, presentation) {
    "use strict";
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function animated() {
        return presentation.animated() && !motion.matches && options.get("tile_realtime_anim") && options.get("tile_misc_anim");
    }
    function create(settings) {
        var running = false, canvas, context, frame = null, timer = null;
        function allowed() {
            return running && settings.allowed() && !document.hidden && options.ready()
                && renderer.ui_state === enums.ui.NORMAL && options.get("tile_display_mode") === "tiles";
        }
        function cancel() {
            if (frame !== null) window.cancelAnimationFrame(frame);
            if (timer !== null) window.clearTimeout(timer);
            frame = timer = null;
        }
        function clear() { cancel(); if (canvas) canvas.remove(); canvas = context = null; }
        function place(element) {
            var rule = canvas.style, left = element.style.left || element.offsetLeft + "px", top = element.style.top || element.offsetTop + "px";
            var width = element.style.width || element.clientWidth + "px", height = element.style.height || element.clientHeight + "px";
            if (rule.left !== left) rule.left = left;
            if (rule.top !== top) rule.top = top;
            if (rule.width !== width) rule.width = width;
            if (rule.height !== height) rule.height = height;
        }
        function draw(now) {
            frame = null;
            var element = renderer.element, viewport = element && element.parentElement;
            if (!allowed() || !element || !element.isConnected || !viewport || viewport.id !== "dungeon_viewport" || !renderer.cols || !renderer.rows) { clear(); return; }
            if (!canvas) {
                canvas = document.createElement("canvas"); canvas.className = settings.className;
                canvas.setAttribute("aria-hidden", "true"); viewport.appendChild(canvas);
                context = canvas.getContext("2d");
                if (!context) { clear(); return; }
            }
            var width = renderer.cols * settings.resolution, height = renderer.rows * settings.resolution;
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            place(element);
            var moving = animated(), again = settings.paint(context, settings.resolution, now, moving, renderer);
            if (moving && again && settings.cadence) timer = window.setTimeout(function () { timer = null; request(); }, settings.cadence);
        }
        function request() {
            if (!allowed()) { clear(); return; }
            if (frame === null) frame = window.requestAnimationFrame(draw);
        }
        function invalidate() { cancel(); request(); }
        var name = "." + settings.name;
        $(document).on("game_init" + name, function () { clear(); running = true; request(); })
            .on(["game_cleanup", "game_preinit", "game_connection_lost"].join(name + " ") + name, function () { running = false; clear(); })
            .on(["map_knowledge_changed", "map_knowledge_cleared", "game_camera_changed", "game_ui_changed", "hud_workspace_changed",
                "visual_presentation_changed", "visibilitychange"].join(name + " ") + name, invalidate);
        // Tile repaints do not move this layer; only follow the native canvas.
        $(document).on("dungeon_tiles_changed" + name, function () {
            var element = renderer.element;
            if (!canvas || !element) return;
            if (canvas.style.width !== (element.style.width || element.clientWidth + "px")
                || canvas.style.height !== (element.style.height || element.clientHeight + "px")
                || canvas.style.left !== (element.style.left || element.offsetLeft + "px")
                || canvas.style.top !== (element.style.top || element.offsetTop + "px")) invalidate();
        });
        $(window).on("resize" + name, invalidate);
        options.add_listener(invalidate);
        motion.addEventListener("change", invalidate);
        return { invalidate: invalidate, clear: clear };
    }
    return { create: create };
});
