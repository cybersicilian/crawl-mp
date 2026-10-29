define(["jquery", "./status-icons"], function ($, icons) {
    "use strict";
    // Generic viewport panels. Only init's registry contains game-specific IDs.
    var key = "dcss.hud.workspace.v1", panels = [], saved = {}, editing = false, drag = null;
    function read() {
        try { var value = JSON.parse(localStorage.getItem(key)); return value && typeof value === "object" ? value : {}; }
        catch (error) { return {}; }
    }
    function save() { try { localStorage.setItem(key, JSON.stringify(saved)); } catch (error) { /* Session layout remains usable. */ } }
    function bounded(rect) {
        var width = Math.min(Math.max(180, rect.width), innerWidth - 8);
        var height = Math.min(Math.max(90, rect.height), innerHeight - 8);
        return { x: Math.max(4, Math.min(rect.x, innerWidth - width - 4)),
            y: Math.max(4, Math.min(rect.y, innerHeight - height - 4)), width: width, height: height };
    }
    function apply(panel, rect) {
        rect = bounded(rect);
        panel.classList.add("hud-floating");
        Object.assign(panel.style, { left: rect.x + "px", top: rect.y + "px", width: rect.width + "px", height: rect.height + "px" });
        panel.style.setProperty("--panel-width", rect.width + "px");
        saved[panel.id] = rect;
    }
    function geometry(panel) {
        var rect = panel.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    function reflow() { $(document).trigger("hud_workspace_changed"); }
    function toggle() {
        editing = !editing;
        document.body.classList.toggle("hud-layout-editing", editing);
        $("#hud_layout_toggle").attr({ "aria-pressed": String(editing),
            "aria-label": editing ? "Finish arranging HUD" : "Arrange HUD panels" });
        $("#hud_layout_help").prop("hidden", !editing);
        reflow();
    }
    function reset() {
        saved = {}; save();
        panels.forEach(function (panel) {
            panel.classList.remove("hud-floating");
            ["left", "top", "width", "height", "--panel-width"].forEach(function (name) { panel.style.removeProperty(name); });
        });
        reflow();
    }
    function start(event, panel, resize) {
        if (!editing || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        drag = { panel: panel, resize: resize, x: event.clientX, y: event.clientY, rect: geometry(panel), id: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function move(event) {
        if (!drag || event.pointerId !== drag.id) return;
        var dx = event.clientX - drag.x, dy = event.clientY - drag.y, rect = drag.rect;
        apply(drag.panel, { x: rect.x + (drag.resize ? 0 : dx), y: rect.y + (drag.resize ? 0 : dy),
            width: rect.width + (drag.resize ? dx : 0), height: rect.height + (drag.resize ? dy : 0) });
    }
    function finish() { if (drag) { drag = null; save(); reflow(); } }
    function handle(panel, label, resize) {
        var button = document.createElement("button"); button.type = "button";
        button.className = resize ? "hud-panel-resize" : "hud-panel-move";
        button.setAttribute("aria-label", (resize ? "Resize " : "Move ") + label);
        button.title = (resize ? "Drag to resize" : "Drag to move") + "; arrow keys adjust, double-click to dock";
        button.appendChild(icons.icon(resize ? "resize-panel" : "drag-panel"));
        button.addEventListener("pointerdown", function (event) { start(event, panel, resize); });
        button.addEventListener("pointermove", move);
        button.addEventListener("pointerup", finish); button.addEventListener("pointercancel", finish);
        button.addEventListener("lostpointercapture", finish);
        button.addEventListener("dblclick", function (event) {
            event.stopPropagation(); delete saved[panel.id];
            panel.classList.remove("hud-floating");
            ["left", "top", "width", "height", "--panel-width"].forEach(function (name) { panel.style.removeProperty(name); });
            save(); reflow();
        });
        button.addEventListener("keydown", function (event) {
            event.stopPropagation();
            if (!editing) return;
            if (event.key === "Escape") { event.preventDefault(); finish(); toggle(); return; }
            var arrows = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
            var offset = arrows[event.key]; if (!offset) return;
            event.preventDefault(); var rect = geometry(panel);
            if (resize || event.shiftKey) { rect.width += offset[0]; rect.height += offset[1]; }
            else { rect.x += offset[0]; rect.y += offset[1]; }
            apply(panel, rect); save(); reflow();
        });
        ["keypress", "keyup", "click"].forEach(function (name) { button.addEventListener(name, function (event) { event.stopPropagation(); }); });
        panel.appendChild(button);
    }
    function init() {
        saved = read(); panels = [];
        [["party_hud", "Heroes"], ["hud_bottom_map", "Minimap"],
            ["message_pane", "Message log"], ["dcss_quick_dock", "Actions"]].forEach(function (entry) {
                var panel = document.getElementById(entry[0]); if (!panel) return;
                panels.push(panel); panel.classList.add("hud-workspace-panel");
                panel.setAttribute("data-panel-label", entry[1]);
                if (!panel.querySelector(".hud-panel-move")) { handle(panel, entry[1], false); handle(panel, entry[1], true); }
                var rect = saved[panel.id];
                if (rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) apply(panel, rect);
            });
        if (!document.getElementById("hud_layout_toggle")) {
            var button = $("<button type='button' id='hud_layout_toggle' class='dcss-dock-btn' aria-pressed='false' aria-label='Arrange HUD panels'></button>")
                .attr({ "data-tip-title": "Arrange HUD panels (Alt+L)", "data-tip-body": "Move and resize panels. Your layout is saved on this browser. Reset restores the default layout." })
                .append(icons.icon("layout")).on("click", toggle);
            $("#dcss_quick_dock [data-action-group='expedition']").append(button);
            $("<div id='hud_layout_help' hidden role='status'>Alt+L: arrange panels. Arrow keys move a focused handle; Shift + arrows resize. Double-click a handle to dock. <button type='button'>Reset layout</button><button type='button'>Done</button></div>")
                .appendTo("#normal").find("button").first().on("click", reset).end().last().on("click", toggle);
            $("#hud_layout_help").on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        }
        reflow();
    }
    document.addEventListener("keydown", function (event) {
        if (!panels.length) return;
        if ((event.altKey && event.key.toLowerCase() === "l") || (editing && event.key === "Escape")) {
            event.preventDefault(); event.stopImmediatePropagation(); finish(); toggle();
        }
    }, true);
    $(window).on("resize.panelWorkspace", function () {
        panels.filter(function (panel) { return saved[panel.id]; }).forEach(function (panel) { apply(panel, saved[panel.id]); });
    });
    $(document).on("game_cleanup.panelWorkspace", function () {
        finish(); panels = []; editing = false; document.body.classList.remove("hud-layout-editing");
    });
    return { init: init, reset: reset };
});
