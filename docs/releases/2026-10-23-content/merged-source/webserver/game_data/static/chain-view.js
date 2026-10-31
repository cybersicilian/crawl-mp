define(["jquery", "./map_knowledge", "./frame-update"], function ($, map, frameUpdate) {
    "use strict";
    var renderer, canvas, state;
    function clear() { if (canvas) canvas.remove(); canvas = null; }
    function draw() {
        var hero = state && (state.members || []).find(function (member) { return member.chain; });
        var chain = hero && hero.chain;
        if (!chain || !renderer || !renderer.element || !renderer.element.isConnected || document.hidden) {
            clear(); return;
        }
        var ends = [chain.anchor, chain.target];
        if (ends.some(function (point) {
            return !renderer.in_view(point.x, point.y) || !map.visible(map.get(point.x, point.y));
        })) { clear(); return; }
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.className = "living-chain-overlay";
            canvas.setAttribute("aria-hidden", "true");
            Object.assign(canvas.style, { position: "fixed", pointerEvents: "none", zIndex: "21" });
            document.body.appendChild(canvas);
        }
        var bounds = renderer.element.getBoundingClientRect();
        canvas.width = renderer.element.width; canvas.height = renderer.element.height;
        Object.assign(canvas.style, { left: bounds.left + "px", top: bounds.top + "px",
            width: bounds.width + "px", height: bounds.height + "px" });
        var context = canvas.getContext("2d");
        if (!context) { clear(); return; }
        var points = ends.map(function (point) {
            var cell = renderer.canvas_coords(point.x, point.y);
            return { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2, size: cell.width };
        });
        var ratio = canvas.width / bounds.width;
        context.strokeStyle = chain.pinned ? "#e7bf83" : "#d0badf";
        context.lineWidth = 2 * ratio;
        context.setLineDash(chain.pinned ? [] : [4 * ratio, 3 * ratio]);
        context.beginPath(); context.moveTo(points[0].x, points[0].y);
        context.lineTo(points[1].x, points[1].y); context.stroke();
        context.setLineDash([]);
        if (chain.pinned) {
            context.strokeRect(points[0].x - points[0].size * .18,
                points[0].y - points[0].size * .18, points[0].size * .36, points[0].size * .36);
        }
    }
    var refresh = frameUpdate(draw);
    $(document).on("party_state_rendered.livingChain", function (event, incoming) {
        state = incoming; refresh();
    }).on("game_camera_changed.livingChain dungeon_tiles_changed.livingChain hud_workspace_changed.livingChain visibilitychange.livingChain", refresh)
        .on("game_cleanup.livingChain game_connection_lost.livingChain game_preinit.livingChain", function () {
            state = null; refresh.cancel(); clear();
        });
    $(window).on("resize.livingChain", refresh);
    return { attach: function (view) { renderer = view; } };
});
