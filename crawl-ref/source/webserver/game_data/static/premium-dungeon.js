define(["jquery", "./dungeon_renderer", "./options", "./enums",
        "visual-presentation", "tile-lighting-paint", "./premium-terrain", "./premium-light-field", "./premium-effects", "graphics-dialog"],
function ($, renderer, options, enums, presentation, painting, terrain, field, effects, graphicsDialog) {
    "use strict";
    var running = false, canvas, context, radianceCanvas, radianceContext, frame = null, timer = null, scene, signature;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function allowed() {
        return running && presentation.premium() && !document.hidden && options.ready()
            && ["lighting", "borders", "particles", "reflections", "bloom", "spells"].some(presentation.enabled)
            && renderer.ui_state === enums.ui.NORMAL && options.get("tile_display_mode") === "tiles";
    }
    function cancel() {
        if (frame !== null) window.cancelAnimationFrame(frame);
        if (timer !== null) window.clearTimeout(timer);
        frame = timer = null;
    }
    function clear() {
        cancel(); scene = signature = null;
        if (canvas) canvas.remove();
        if (radianceCanvas) radianceCanvas.remove();
        if (painting.clear) painting.clear();
        canvas = context = radianceCanvas = radianceContext = null;
    }
    function draw(now) {
        frame = null;
        if (!allowed() || !renderer.element || !renderer.element.isConnected) { clear(); return; }
        var element = renderer.element, viewport = element.parentElement;
        if (!viewport || viewport.id !== "dungeon_viewport" || !renderer.cols || !renderer.rows) { clear(); return; }
        if (!canvas) {
            canvas = document.createElement("canvas"); canvas.className = "premium-dungeon-light";
            canvas.setAttribute("aria-hidden", "true"); viewport.appendChild(canvas);
            context = canvas.getContext("2d");
            if (!context) { clear(); return; }
            if (painting.paintRadiance) {
                radianceCanvas = document.createElement("canvas"); radianceCanvas.className = "premium-dungeon-radiance";
                radianceCanvas.setAttribute("aria-hidden", "true"); viewport.appendChild(radianceCanvas);
                radianceContext = radianceCanvas.getContext("2d");
                if (!radianceContext) { clear(); return; }
            }
        }
        if (canvas.width !== element.width) canvas.width = element.width;
        if (canvas.height !== element.height) canvas.height = element.height;
        Object.assign(canvas.style, { width: element.style.width || element.clientWidth + "px",
            height: element.style.height || element.clientHeight + "px",
            left: element.style.left || element.offsetLeft + "px", top: element.style.top || element.offsetTop + "px" });
        if (radianceCanvas) {
            if (radianceCanvas.width !== element.width) radianceCanvas.width = element.width;
            if (radianceCanvas.height !== element.height) radianceCanvas.height = element.height;
            radianceCanvas.style.cssText = canvas.style.cssText;
            radianceContext.clearRect(0, 0, radianceCanvas.width, radianceCanvas.height);
        }
        var next = [renderer.view.x, renderer.view.y, renderer.cols, renderer.rows, element.width, element.height].join(":");
        if (!scene || signature !== next) {
            scene = field.forView(renderer);
            signature = next;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        var animated = presentation.animated() && !motion.matches && options.get("tile_realtime_anim");
        var settings = {};
        ["lighting", "borders", "particles", "reflections", "bloom", "spells"].forEach(function (key) { settings[key] = presentation.enabled(key); });
        painting.paint(context, scene, renderer.canvas_coords.bind(renderer), now, animated, settings);
        var radiance = radianceContext ? painting.paintRadiance(radianceContext, scene, renderer.canvas_coords.bind(renderer), now, animated, settings) : null;
        canvas.dataset.lights = String(scene.lights.length);
        if (radiance) Object.keys(radiance).forEach(function (key) { canvas.dataset[key] = String(radiance[key]); });
        if (animated && ((settings.lighting || settings.reflections || settings.bloom || settings.spells)
            && scene.lights.some(function (light) { return light.animated !== false; })
            || settings.particles && scene.cells.some(function (cell) { return cell.effect; })))
            timer = window.setTimeout(function () { timer = null; request(); }, 100);
    }
    function request() {
        if (!allowed()) { clear(); return; }
        if (frame === null) frame = window.requestAnimationFrame(draw);
    }
    function invalidate() { scene = null; cancel(); request(); }
    function updateButton() {
        var button = document.getElementById("graphics_settings_btn");
        if (!button) return;
        var enabled = presentation.premium();
        button.setAttribute("aria-label", "Graphics settings. " + (enabled ? "Enhanced" : "Classic") + " visuals.");
        button.textContent = "Graphics";
    }
    function init() {
        var dock = document.querySelector("#dcss_quick_dock [data-action-group='expedition']")
            || document.getElementById("dcss_quick_dock");
        if (dock && !document.getElementById("graphics_settings_btn")) {
            var button = document.createElement("button");
            button.id = "graphics_settings_btn"; button.type = "button"; button.className = "dcss-dock-btn";
            button.setAttribute("aria-haspopup", "dialog");
            button.setAttribute("data-tip-title", "Account graphics settings");
            button.setAttribute("data-tip-body", "Choose Classic, Balanced or Premium and tune individual effects. Applies immediately and saves to your account.");
            button.addEventListener("click", function (event) {
                event.stopPropagation(); graphicsDialog.open();
            });
            dock.appendChild(button);
        }
        updateButton(); invalidate();
    }
    $(document).on("game_init.premiumDungeon", function () { clear(); running = true; })
        .on("game_cleanup.premiumDungeon game_preinit.premiumDungeon game_connection_lost.premiumDungeon", function () {
            running = false; clear();
        }).on("map_knowledge_changed.premiumDungeon map_knowledge_cleared.premiumDungeon dungeon_tiles_changed.premiumDungeon game_camera_changed.premiumDungeon game_ui_changed.premiumDungeon", invalidate)
        .on("visual_presentation_changed.premiumDungeon", function () { updateButton(); invalidate(); })
        .on("visibilitychange.premiumDungeon", invalidate);
    $(window).on("resize.premiumDungeon", invalidate);
    options.add_listener(invalidate);
    motion.addEventListener("change", invalidate);
    return { init: init };
});
