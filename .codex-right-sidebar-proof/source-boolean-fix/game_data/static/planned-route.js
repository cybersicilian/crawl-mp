/* Screen overlay follows native map-space geometry, including zoom and Retina. */
define(["jquery", "./tactical-planner", "./frame-update"], function ($, planner, frameUpdate) {
    "use strict";
    var renderer, canvas;
    function clear() { if (canvas) canvas.remove(); canvas = null; }
    function draw() {
        if (!renderer || !renderer.element || !renderer.element.isConnected) { clear(); return; }
        var plan = planner.view(), entries = (plan.pending ? [plan.pending] : []).concat(plan.entries);
        var points = plan.origin ? [plan.origin] : [];
        entries.forEach(function (entry) { if (entry.point) points.push(entry.point); });
        if (points.length < 2) { clear(); return; }
        if (!canvas) {
            canvas = document.createElement("canvas"); canvas.className = "planned-route";
            canvas.setAttribute("aria-hidden", "true"); document.body.appendChild(canvas);
        }
        var bounds = renderer.element.getBoundingClientRect();
        canvas.width = renderer.element.width; canvas.height = renderer.element.height;
        Object.assign(canvas.style, { left: bounds.left + "px", top: bounds.top + "px",
            width: bounds.width + "px", height: bounds.height + "px" });
        var ctx = canvas.getContext("2d"), ratio = window.devicePixelRatio || 1;
        ctx.strokeStyle = plan.running ? "#92e5ae" : "#89dce6";
        ctx.lineWidth = 2 * ratio; ctx.setLineDash([6 * ratio, 4 * ratio]);
        ctx.lineJoin = "round"; ctx.beginPath();
        points.forEach(function (point, index) {
            var loc = renderer.canvas_coords(point.x, point.y);
            var x = loc.x + loc.width / 2, y = loc.y + loc.height / 2;
            if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }); ctx.stroke(); ctx.setLineDash([]);
        points.slice(1).forEach(function (point, index) {
            if (!renderer.in_view(point.x, point.y)) return;
            var loc = renderer.canvas_coords(point.x, point.y), x = loc.x + loc.width / 2, y = loc.y + loc.height / 2;
            ctx.fillStyle = "#111d24e8"; ctx.beginPath(); ctx.arc(x, y, 7 * ratio, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#e0ffff"; ctx.font = "bold " + 9 * ratio + "px sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(index + 1), x, y);
        });
    }
    var refresh = frameUpdate(draw);
    $(document).on("action_plan_changed.plannedRoute game_camera_changed.plannedRoute hud_workspace_changed.plannedRoute game_ui_changed.plannedRoute", refresh)
        .on("game_cleanup.plannedRoute game_connection_lost.plannedRoute", function () { refresh.cancel(); clear(); });
    $(window).on("resize.plannedRoute", refresh);
    return { attach: function (view) { renderer = view; } };
});
