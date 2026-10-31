define(["jquery", "./map_knowledge", "./frame-update", "./chain-painter"], function ($, map, frameUpdate, painter) {
    "use strict";
    var renderer, canvas, state;
    function clear() { if (canvas) canvas.remove(); canvas = null; }
    function visible(point) {
        return point && Number.isFinite(point.x) && Number.isFinite(point.y)
            && renderer.in_view(point.x, point.y) && map.visible(map.get(point.x, point.y));
    }
    function draw() {
        if (!renderer || !renderer.element || !renderer.element.isConnected || document.hidden) {
            clear(); return;
        }
        var chains = (state && state.members || []).map(function (member) { return member.chain; })
            .filter(function (chain) { return chain && visible(chain.anchor) && visible(chain.target); });
        if (!chains.length) { clear(); return; }
        var bounds = renderer.element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) { clear(); return; }
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.className = "living-chain-overlay";
            canvas.setAttribute("aria-hidden", "true");
            Object.assign(canvas.style, { position: "fixed", pointerEvents: "none", zIndex: "21" });
            document.body.appendChild(canvas);
        }
        if (canvas.width !== renderer.element.width) canvas.width = renderer.element.width;
        if (canvas.height !== renderer.element.height) canvas.height = renderer.element.height;
        Object.assign(canvas.style, { left: bounds.left + "px", top: bounds.top + "px",
            width: bounds.width + "px", height: bounds.height + "px" });
        var context = canvas.getContext("2d");
        if (!context) { clear(); return; }
        context.clearRect(0, 0, canvas.width, canvas.height);
        chains.forEach(function (chain) {
            var points = [chain.anchor, chain.target].map(function (point) {
                var cell = renderer.canvas_coords(point.x, point.y);
                return { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2, size: cell.width };
            });
            painter.paint(context, points[0], points[1], chain.pinned);
        });
    }
    var refresh = frameUpdate(draw);
    $(document).on("party_state_rendered.livingChain", function (event, incoming) {
        state = incoming; refresh();
    }).on("game_camera_changed.livingChain dungeon_tiles_changed.livingChain hud_workspace_changed.livingChain visibilitychange.livingChain", refresh)
        .on("game_cleanup.livingChain game_connection_lost.livingChain game_preinit.livingChain", function () {
            state = null; refresh.cancel(); clear();
        });
    $(window).on("resize.livingChain", refresh);
    return { attach: function (view) { renderer = view; refresh(); } };
});
