/* Shows what a click does before it happens: cursor, route preview and a plain readout. */
define(["jquery", "./map_knowledge", "./workflow-actions", "./game-context", "./tactical-planner", "./route-plan", "./planned-route", "./travel-route", "./pointer-intent-model", "./creature-roster-model", "visual-presentation", "./enums"],
function ($, map, actions, game, planner, routes, plannedRoute, travel, model, roster, presentation, enums) {
    "use strict";
    var last = null, pointer = null, hint = "Point at a tile to see what a click does.";
    function context() {
        var state = window.crawl_party && window.crawl_party.state;
        return { state: state, hero: state && state.members.find(function (entry) { return entry.slot === actions.controlledSlot(); }) };
    }
    function readout() { return $("#hud_floor_items .pointer-readout"); }
    function paint(intent) {
        var root = readout();
        root.attr("data-intent", intent ? intent.kind : "idle");
        root.find(".pointer-title").text(intent ? intent.title : hint);
        root.find(".pointer-threat").text(intent && intent.threat || "");
        root.find(".pointer-left").text(intent ? intent.left : "");
        root.find(".pointer-right").text(intent ? intent.right : "");
        root.find(".pointer-left-row").prop("hidden", !intent);
        root.find(".pointer-right-row").prop("hidden", !intent || !intent.right);
        $("#dungeon").attr("data-pointer-intent", intent ? intent.kind : null);
    }
    function clear() {
        last = pointer = null; travel.cancel(); plannedRoute.preview(null); paint(null);
    }
    function hover(loc) {
        var view = context(), hero = view.hero, cell = map.get(loc.x, loc.y);
        pointer = loc;
        if (!hero || !hero.pos || !cell) { last = null; travel.cancel(); plannedRoute.preview(null); paint(null); return; }
        // The route starts at the hero, so a move refreshes it under a still pointer.
        var key = [loc.x, loc.y, hero.pos.x, hero.pos.y].join();
        if (key === last) return;
        last = key;
        var visible = map.visible(cell), distance = Math.max(Math.abs(loc.x - hero.pos.x), Math.abs(loc.y - hero.pos.y));
        var ally = visible && view.state.members.find(function (entry) {
            return entry.slot !== hero.slot && entry.on_same_level !== false && routes.equal(entry.pos, loc);
        });
        var blocked = actions.reason(hero);
        var attackable = visible && cell.mon && cell.mon.att === 0;
        function show(path, trip) {
            paint(model.classify({ cell: cell, visible: visible, distance: distance, adjacent: distance === 1,
                harmless: Boolean(cell.mon && roster.harmless(cell.mon)),
                ownTile: distance === 0, ally: ally, blocked: blocked, targeting: game.can_target(),
                steps: path ? path.length : undefined, oneStep: Boolean(trip && trip.one_step),
                noRoute: Boolean(trip && !path) }));
            plannedRoute.preview(path ? [hero.pos].concat(path) : null);
        }
        travel.cancel();
        var routed = !blocked && !ally && !attackable && distance > 0 && cell.t && !game.can_target();
        var walker = routed && presentation.preference("route_preview") !== false ? planner.walker() : null;
        // Nothing can be walked until the engine takes commands again.
        if (routed && walker === null && game.get_input_mode() !== enums.mouse_mode.COMMAND) last = null;
        if (walker === "planner") {
            var planned = planner.preview(loc);
            show(planned && planned.map(function (step) { return step.point; }));
        } else if (walker === "engine") {
            // The old route stays up until the answer, so the readout changes once.
            travel.ask(loc, function (trip) {
                if (key !== last) return;
                if (!trip) { last = null; show(null); return; }
                show(trip.route.length ? trip.route : null, trip);
            });
        } else show(null);
    }
    function init() {
        if (readout().length || !document.getElementById("hud_floor_items")) return;
        $("<dl class='pointer-readout' data-intent='idle'>"
            + "<dt class='pointer-heading'><span class='pointer-title'></span><span class='pointer-threat'></span></dt>"
            + "<dd class='pointer-left-row' hidden><kbd>Click</kbd><span class='pointer-left'></span></dd>"
            + "<dd class='pointer-right-row' hidden><kbd>Right-click</kbd><span class='pointer-right'></span></dd></dl>")
            .appendTo("#hud_floor_items");
        paint(null);
        $("#dungeon").off(".pointerIntent").on("cell_hover.pointerIntent", function (event) { hover(event.cell); })
            .on("cell_hover_end.pointerIntent", clear);
    }
    $(document).on("party_state_rendered.pointerIntent game_input_changed.pointerIntent", function () { if (pointer) hover(pointer); })
        .on("map_knowledge_changed.pointerIntent", function () { last = null; if (pointer) hover(pointer); })
        .on("map_knowledge_cleared.pointerIntent", clear)
        .on("graphics_settings_changed.pointerIntent", function () { if (pointer) { last = null; hover(pointer); } })
        .on("game_cleanup.pointerIntent", function () { last = pointer = null; travel.cancel(); plannedRoute.preview(null); });
    return { init: init };
});
