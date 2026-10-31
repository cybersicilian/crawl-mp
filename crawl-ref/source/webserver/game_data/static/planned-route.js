/* Screen overlay follows native map-space geometry, including zoom and Retina. */
define(["jquery", "./tactical-planner", "./frame-update"], function ($, planner, frameUpdate) {
    "use strict";
    var renderer, canvas;
    var slot_colours = ["#fce94f", "#34e2e2", "#8ae234", "#ad7fa8"];
    function clear() { if (canvas) canvas.remove(); canvas = null; }
    function controlled() {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state) return null;
        var slot = Number.isInteger(state.controlled_slot) ? state.controlled_slot : state.active_slot;
        return (state.members || []).find(function (member) { return member.slot === slot; }) || null;
    }
    function centre(point) {
        var loc = renderer.canvas_coords(point.x, point.y);
        return { x: loc.x + loc.width / 2, y: loc.y + loc.height / 2, unit: Math.min(loc.width, loc.height) };
    }
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
        var ctx = canvas.getContext("2d"), ratio = canvas.width / Math.max(1, bounds.width);
        var member = controlled(), colour = member ? slot_colours[member.slot % slot_colours.length] : "#89dce6";
        var unit = centre(points[0]).unit, width = Math.max(2 * ratio, unit * 0.07);
        // Dark halo under the dashed line keeps it readable over bright floors.
        [["rgba(0,0,0,0.7)", width + 2 * ratio], [plan.running ? colour : colour + "cc", width]].forEach(function (pass) {
            ctx.strokeStyle = pass[0]; ctx.lineWidth = pass[1];
            ctx.setLineDash([Math.max(6 * ratio, unit * 0.25), Math.max(4 * ratio, unit * 0.16)]);
            ctx.lineJoin = ctx.lineCap = "round"; ctx.beginPath();
            points.forEach(function (point, index) {
                var at = centre(point);
                if (!index) ctx.moveTo(at.x, at.y); else ctx.lineTo(at.x, at.y);
            }); ctx.stroke();
        });
        ctx.setLineDash([]);
        var pendingIndex = plan.pending ? 0 : -1, last = points.length - 2;
        points.slice(1).forEach(function (point, index) {
            if (!renderer.in_view(point.x, point.y)) return;
            var at = centre(point), radius = Math.max(7 * ratio, at.unit * 0.22);
            var active = index === pendingIndex, destination = index === last;
            ctx.beginPath();
            if (destination) {
                // Diamond marks the final tile of the plan.
                ctx.moveTo(at.x, at.y - radius * 1.25); ctx.lineTo(at.x + radius * 1.25, at.y);
                ctx.lineTo(at.x, at.y + radius * 1.25); ctx.lineTo(at.x - radius * 1.25, at.y); ctx.closePath();
            } else ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = active ? colour : "rgba(14, 22, 28, 0.9)"; ctx.fill();
            ctx.lineWidth = Math.max(ratio, at.unit * 0.035); ctx.strokeStyle = active ? "#101418" : colour; ctx.stroke();
            ctx.fillStyle = active ? "#101418" : "#f2f6f7"; ctx.font = "bold " + Math.round(Math.max(9 * ratio, at.unit * 0.28)) + "px monospace";
            ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(index + 1), at.x, at.y + ratio * 0.5);
        });
    }
    var refresh = frameUpdate(draw);
    $(document).on("action_plan_changed.plannedRoute game_camera_changed.plannedRoute hud_workspace_changed.plannedRoute game_ui_changed.plannedRoute", refresh)
        .on("game_cleanup.plannedRoute game_connection_lost.plannedRoute", function () { refresh.cancel(); clear(); });
    $(window).on("resize.plannedRoute", refresh);
    return { attach: function (view) { renderer = view; } };
});
