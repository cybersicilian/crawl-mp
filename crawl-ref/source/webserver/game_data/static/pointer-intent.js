/* Shows what a click does before it happens: cursor, route preview and a plain readout. */
define(["jquery", "./map_knowledge", "./workflow-actions", "./game-context", "./tactical-planner", "./route-plan", "./planned-route", "./pointer-intent-model", "./creature-roster-model"],
function ($, map, actions, game, planner, routes, plannedRoute, model, roster) {
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
        last = pointer = null; plannedRoute.preview(null); paint(null);
    }
    function hover(loc) {
        var view = context(), hero = view.hero, cell = map.get(loc.x, loc.y);
        pointer = loc;
        if (!hero || !hero.pos || !cell) { last = null; plannedRoute.preview(null); paint(null); return; }
        // The route starts at the hero, so a move refreshes it under a still pointer.
        var key = [loc.x, loc.y, hero.pos.x, hero.pos.y].join();
        if (key === last) return;
        last = key;
        var visible = map.visible(cell), distance = Math.max(Math.abs(loc.x - hero.pos.x), Math.abs(loc.y - hero.pos.y));
        var ally = visible && view.state.members.find(function (entry) {
            return entry.slot !== hero.slot && entry.on_same_level !== false && routes.equal(entry.pos, loc);
        });
        var blocked = actions.reason(hero), path = null;
        var attackable = visible && cell.mon && cell.mon.att === 0;
        if (!blocked && !ally && !attackable && distance > 0 && cell.t && !game.can_target()) path = planner.preview(loc);
        var intent = model.classify({ cell: cell, visible: visible, distance: distance, adjacent: distance === 1,
            harmless: Boolean(cell.mon && roster.harmless(cell.mon)),
            ownTile: distance === 0, ally: ally, blocked: blocked, targeting: game.can_target(),
            steps: path ? path.length : undefined });
        plannedRoute.preview(path && hero.pos ? [hero.pos].concat(path.map(function (step) { return step.point; })) : null);
        paint(intent);
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
    $(document).on("party_state_rendered.pointerIntent", function () { if (pointer) hover(pointer); })
        .on("game_cleanup.pointerIntent", function () { last = pointer = null; plannedRoute.preview(null); });
    return { init: init };
});
