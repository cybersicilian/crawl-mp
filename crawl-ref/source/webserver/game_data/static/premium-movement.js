/* DCSS adapter: only confirmed, adjacent, currently visible actor movement. */
define(["jquery", "./map_knowledge", "./options", "./enums", "./cell-renderer-layers", "./premium-terrain-model", "./view_data",
    "visual-presentation", "sprite-motion", "sprite-motion-layer", "./map-effect-layer", "footstep-paint"],
function ($, map, options, enums, layers, terrain, view, presentation, motions, sprites, effects, footstep) {
    "use strict";
    var tracker = motions.create(), renderer, running = false, heroes = new Map(), floor;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function allowed() {
        return running && renderer && renderer.element && renderer.element.isConnected
            && presentation.premium() && presentation.animated() && !document.hidden && !motion.matches
            && (presentation.enabled("movement") || presentation.enabled("particles"))
            && options.ready() && options.get("tile_realtime_anim") && options.get("tile_display_mode") === "tiles"
            && renderer.ui_state === enums.ui.NORMAL;
    }
    function visible(pos) { return renderer && renderer.in_view(pos.x, pos.y) && map.visible(map.get(pos.x, pos.y)); }
    function marked(pos) {
        var entry = map.get(pos.x, pos.y), cell = entry.t;
        if (!cell) return true;
        var bg = enums.prepare_bg_flags(cell.bg || 0), cloud = enums.prepare_fg_flags(cell.cloud || 0);
        return Boolean(bg.CURSOR1 || bg.CURSOR2 || bg.CURSOR3 || bg.TUT_CURSOR || cloud.value || (cell.ov || []).length || entry.flc
            || Object.keys(view.cursor_locs).some(function (key) {
                var cursor = view.cursor_locs[key]; return cursor && cursor.x === pos.x && cursor.y === pos.y;
            }));
    }
    function eligible(from, to) {
        if (!visible(from) || !visible(to) || marked(from) || marked(to)) return false;
        if (from.x !== to.x && from.y !== to.y)
            return visible({ x: from.x, y: to.y }) && visible({ x: to.x, y: from.y });
        return true;
    }
    function cells() {
        var result = [];
        if (!renderer) return result;
        for (var y = renderer.view.y; y < renderer.view.y + renderer.rows; y++)
            for (var x = renderer.view.x; x < renderer.view.x + renderer.cols; x++)
                if (map.visible(map.get(x, y))) result.push({ x: x, y: y });
        return result;
    }
    function key(cell, x, y) {
        var hero = Array.from(heroes.values()).find(function (entry) { return entry.x === x && entry.y === y; });
        return hero ? hero.key : cell.mon && cell.mon.id ? "monster:" + cell.mon.id : null;
    }
    function redraw(pos) { if (renderer && visible(pos)) renderer.render_loc(pos.x, pos.y); }
    function clipBounds() {
        var viewport = renderer && renderer.element && renderer.element.parentElement;
        return viewport && viewport.id === "dungeon_viewport" ? viewport.getBoundingClientRect() : null;
    }
    var layer = sprites.create({ className: "premium-actor-motion", poses: tracker.poses, sample: tracker.sample,
        allowed: function () { return allowed() && presentation.enabled("movement"); }, visible: visible, cells: cells, key: key, redraw: redraw, clipBounds: clipBounds,
        current: function (pose) { return key(map.get(pose.pos.x, pose.pos.y), pose.pos.x, pose.pos.y) === pose.key
            && !marked(pose.origin) && !marked(pose.pos); } });
    var steps = effects.create({ className: "premium-footsteps", limit: 24, visible: visible, paint: footstep, clipBounds: clipBounds });
    function reset(redrawActors) { layer.clear(redrawActors); steps.clear(); tracker.reset(); }
    function sync() {
        if (!renderer || !running) return;
        var entries = Array.from(heroes.values());
        cells().forEach(function (pos) {
            var cell = map.get(pos.x, pos.y);
            var hero = Array.from(heroes.values()).some(function (entry) { return entry.x === pos.x && entry.y === pos.y; });
            if (!hero && cell.mon && cell.mon.id) entries.push({ key: "monster:" + cell.mon.id, x: pos.x, y: pos.y,
                identity: String(cell.mon.type || cell.mon.name || cell.mon.id) });
        });
        var previous = Array.from(tracker.poses.values());
        var changed = tracker.update(entries, window.performance.now(), function (a, b) { return allowed() && eligible(a, b); });
        previous.forEach(function (pose) { if (!tracker.poses.has(pose.key)) redraw(pose.pos); });
        if (!allowed()) { reset(true); return; }
        steps.setEnabled(presentation.enabled("particles"));
        steps.play(changed.filter(function (pose) {
            return !enums.prepare_fg_flags(map.get(pose.pos.x, pose.pos.y).t.fg || 0).FLYING;
        }).map(function (pose) {
            var material = terrain.describe(map.get(pose.pos.x, pose.pos.y));
            return { key: pose.key, origin: pose.origin, pos: pose.pos, surface: material && material.surface,
                duration: material && material.surface === "water" ? 520 : 290 };
        }));
        changed.forEach(function (pose) { redraw(pose.origin); redraw(pose.pos); }); layer.request();
    }
    layers.addActorPainter(layer.capture);
    $(document).on("game_init.premiumMovement", function () { reset(false); heroes.clear(); floor = undefined; running = true; })
        .on("game_cleanup.premiumMovement game_preinit.premiumMovement game_connection_lost.premiumMovement", function () {
            running = false; reset(false); heroes.clear(); floor = undefined;
        }).on("map_knowledge_changed.premiumMovement", sync)
        .on("map_knowledge_cleared.premiumMovement", function () { reset(false); heroes.clear(); })
        .on("party_state_rendered.premiumMovement", function (event, state) {
            if (!state) return;
            if (floor !== state.floor) reset(true);
            floor = state.floor; heroes.clear();
            (state.members || []).forEach(function (hero) {
                if (!hero.pos || hero.on_same_level === false || hero.alive === false || hero.ghost_haunting) return;
                heroes.set(hero.slot, { key: "hero:" + hero.slot, x: hero.pos.x, y: hero.pos.y, identity: hero.name + ":" + hero.place });
            }); sync();
        }).on("visual_presentation_changed.premiumMovement visibilitychange.premiumMovement game_ui_changed.premiumMovement", function () { reset(true); });
    options.add_listener(function () { reset(true); });
    motion.addEventListener("change", function () { reset(true); });
    return { attach: function (view) { renderer = view; layer.attach(view); steps.attach(view); } };
});
