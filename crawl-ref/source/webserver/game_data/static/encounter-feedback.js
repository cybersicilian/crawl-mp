define(["jquery", "./map_knowledge", "./enums", "./game-context", "./map-effect-layer",
        "./encounter-feedback-model", "./encounter-feedback-paint"],
function ($, knowledge, enums, game, layers, model, paint) {
    "use strict";
    var tracker = model.create(knowledge), running = false, floor, target;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var layer = layers.create({ className: "encounter-feedback-layer", limit: 40, paint: paint,
        visible: function (pos) { return knowledge.visible(knowledge.get(pos.x, pos.y)); } });
    function reset() { tracker.reset(); layer.clear(); target = null; }
    function resetTarget() { target = null; layer.remove("target"); }
    function changed(event, positions) {
        if (!running) return;
        // Still track snapshots while motion is suppressed; resuming must not replay them.
        var effects = tracker.update(positions);
        if (layer.allowed()) layer.play(effects);
    }
    function cursor(event, data) {
        if (!running || !data || data.type !== enums.CURSOR_MOUSE) return;
        var pos = data.loc;
        if (!game.can_target || !game.can_target() || !model.position(pos)
            || !knowledge.visible(knowledge.get(pos.x, pos.y))) { resetTarget(); return; }
        if (target && target.x === pos.x && target.y === pos.y) return;
        target = { x: pos.x, y: pos.y };
        layer.play([{ kind: "target", key: "target", pos: target, duration: 280 }]);
    }
    $(document).on("game_init.encounterFeedback", function () {
        reset(); floor = undefined; running = true; layer.setEnabled(true);
    }).on("game_cleanup.encounterFeedback game_preinit.encounterFeedback game_connection_lost.encounterFeedback", function () {
        running = false; layer.setEnabled(false); reset();
    }).on("map_knowledge_changed.encounterFeedback", changed)
        .on("map_knowledge_cleared.encounterFeedback", reset)
        .on("map_cursor_changed.encounterFeedback", cursor)
        .on("game_ui_changed.encounterFeedback", resetTarget)
        .on("party_state_rendered.encounterFeedback", function (event, state) {
            if (floor !== undefined && floor !== state.floor) reset();
            floor = state.floor;
        }).on("visibilitychange.encounterFeedback", function () { if (document.hidden) reset(); });
    motion.addEventListener("change", reset);
    return { attach: layer.attach };
});
