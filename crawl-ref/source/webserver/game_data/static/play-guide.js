/* One sensible next step, kept short so the rail stays useful. */
define(["jquery", "comm", "./map_knowledge", "./workflow-actions", "./frame-update", "./status-icons", "./play-guide-model", "./go-menu", "./creature-roster-model"],
function ($, comm, map, actions, frameUpdate, icons, model, go, roster) {
    "use strict";
    var signature = "", exploredPlace = null, current = [];
    var scanRadius = 8;
    function context() {
        var state = window.crawl_party && window.crawl_party.state;
        return { state: state, hero: state && state.members.find(function (entry) { return entry.slot === actions.controlledSlot(); }) };
    }
    function enemies(hero) {
        var found = [], origin = hero.pos;
        if (!origin) return found;
        for (var y = origin.y - scanRadius; y <= origin.y + scanRadius; y++) {
            for (var x = origin.x - scanRadius; x <= origin.x + scanRadius; x++) {
                var cell = map.get(x, y);
                if (!cell || !cell.mon || !map.visible(cell) || cell.mon.att !== 0 || roster.harmless(cell.mon)) continue;
                found.push({ name: cell.mon.name, threat: cell.mon.threat,
                    distance: Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) });
            }
        }
        return found.sort(function (a, b) { return a.distance - b.distance; });
    }
    function run(step) {
        var view = context(), hero = view.hero;
        if (!hero || actions.reason(hero)) return;
        if (step.id === "quaff") actions.itemAction(hero, step.item, false);
        else if (step.id === "travel") go.travel("down");
        else if (Number.isInteger(step.code)) comm.send_message("key", { keycode: step.code });
    }
    function button(step, index) {
        var node = $("<button type='button' class='play-guide-step'></button>")
            .attr({ "data-guide-step": step.id, "data-tone": step.tone || "plain" })
            .toggleClass("is-primary", index === 0);
        node.append(icons.icon(step.icon), $("<span class='play-guide-label'></span>").text(step.label));
        if (step.key) node.append($("<kbd></kbd>").text(step.key));
        return node.on("click", function () { this.blur(); run(step); });
    }
    function update() {
        var root = $("#play_guide"); if (!root.length) return;
        var view = context(), hero = view.hero; if (!hero) return;
        if (exploredPlace && exploredPlace !== hero.place) exploredPlace = null;
        var explored = exploredPlace === hero.place;
        var steps = model.suggest({ hero: hero, blocked: actions.reason(hero), enemies: enemies(hero), explored: explored,
            stairsKnown: explored && Boolean(go.nearest("down", hero.pos)) });
        var next = JSON.stringify(steps.map(function (step) { return [step.id, step.label, step.reason, step.tone]; }));
        current = steps;
        if (next === signature) return;
        signature = next;
        var body = root.find(".play-guide-steps").empty();
        steps.forEach(function (step, index) { body.append(button(step, index)); });
        root.find(".play-guide-reason").text(steps[0] ? steps[0].reason : "");
        root.attr("data-tone", steps[0] && steps[0].tone || "plain");
        var key = steps[0] && (steps[0].id === "fight" ? "\t" : steps[0].key);
        $("#dcss_quick_dock [data-dock-key]").each(function () {
            this.classList.toggle("is-suggested", this.dataset.dockKey === key);
        });
    }
    function init() {
        if (!document.getElementById("party_hud")) return;
        $("#hud_floor_items").appendTo("#hud_bottom_row");
        $("#play_guide").remove();
        var root = $("<section id='play_guide' aria-label='Next step'><h2>Next step</h2>"
            + "<p class='play-guide-reason' role='status'></p><div class='play-guide-steps'></div>"
            + "</section>");
        root.on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        $("#party_ping_toolbar").before(root);
        signature = ""; update();
    }
    var refresh = frameUpdate(update);
    $(document).on("party_state_rendered.playGuide game_actions_changed.playGuide map_knowledge_changed.playGuide", refresh)
        .on("game_explore_finished.playGuide", function () {
            var hero = context().hero; exploredPlace = hero && hero.place; refresh();
        })
        .on("game_cleanup.playGuide", function () {
            refresh.cancel(); signature = ""; exploredPlace = null; current = [];
            $("#play_guide").remove();
        });
    $(window).on("resize.playGuide", refresh);
    function explored() {
        var hero = context().hero;
        return Boolean(hero && exploredPlace === hero.place);
    }
    return { init: init, update: update, context: context, enemies: enemies, explored: explored, steps: function () { return current; } };
});
