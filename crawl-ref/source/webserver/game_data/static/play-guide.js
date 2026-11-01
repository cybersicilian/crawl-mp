/* Fills the rail's free height with the next sensible step and the core controls. */
define(["jquery", "comm", "./map_knowledge", "./workflow-actions", "./frame-update", "./status-icons", "./play-guide-model", "./go-menu", "./creature-roster-model"],
function ($, comm, map, actions, frameUpdate, icons, model, go, roster) {
    "use strict";
    var signature = "", exploredPlace = null, current = [];
    var scanRadius = 8;
    var controls = [["Click", "Walk to a tile, or hit an adjacent enemy"], ["Right-click", "See what a tile or creature can do"],
        ["Shift-click", "Plan a route step by step"], ["@", "Attack info"], ["?", "All keyboard help"]];
    var tips = ["Fight in corridors so only one enemy can reach you at a time.",
        "Stairs are an escape: only monsters next to you follow.",
        "Right-click a creature to read what it can do before you fight it.",
        "Recover with Rest before exploring further. It costs almost nothing.",
        "Unknown potions and scrolls are usually safe to try at full health with no enemies near.",
        "Press m to choose which skills your hero trains.",
        "Wear the armour you find, but heavy armour makes spells harder to cast.",
        "Altars let you worship a god. Press ^ to see what yours offers.",
        "Cmd/Ctrl+F finds any item you have seen in the dungeon."];
    function tip(place) {
        var total = 0;
        for (var index = 0; index < String(place).length; index++) total += String(place).charCodeAt(index);
        return tips[total % tips.length];
    }
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
    // A lone hero has free rail height, so the tile panel joins the guide and the log widens.
    function placeFloor(state) {
        var floor = document.getElementById("hud_floor_items"), slot = document.querySelector("#play_guide .play-guide-floor");
        var row = document.getElementById("hud_bottom_row");
        if (!floor || !slot || !row) return;
        var solo = state.members.length === 1 && !state.multiplayer;
        var inRail = solo && window.innerHeight >= 860 && window.innerWidth >= 1100;
        document.body.classList.toggle("workflow-floor-in-rail", inRail);
        var parent = inRail ? slot : row;
        if (floor.parentNode !== parent) parent.appendChild(floor);
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
        placeFloor(view.state);
        if (exploredPlace && exploredPlace !== hero.place) exploredPlace = null;
        var explored = exploredPlace === hero.place;
        var steps = model.suggest({ hero: hero, blocked: actions.reason(hero), enemies: enemies(hero), explored: explored,
            stairsKnown: explored && Boolean(go.nearest("down", hero.pos)) });
        var advice = tip(hero.place);
        if (root.find(".play-guide-tip").text() !== advice) root.find(".play-guide-tip").text(advice);
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
        $("#play_guide").remove();
        var root = $("<section id='play_guide' aria-label='Next step'><h2>Next step</h2>"
            + "<p class='play-guide-reason' role='status'></p><div class='play-guide-steps'></div>"
            + "<div class='play-guide-floor'></div><p class='play-guide-tip'></p>"
            + "<dl class='play-guide-controls'></dl></section>");
        controls.forEach(function (entry) {
            root.find("dl").append($("<div></div>").append($("<dt></dt>").append($("<kbd></kbd>").text(entry[0])),
                $("<dd></dd>").text(entry[1])));
        });
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
            document.body.classList.remove("workflow-floor-in-rail");
            $("#play_guide").remove();
        });
    $(window).on("resize.playGuide", refresh);
    return { init: init, update: update, steps: function () { return current; } };
});
