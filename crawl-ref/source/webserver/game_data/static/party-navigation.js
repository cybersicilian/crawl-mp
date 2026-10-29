define(["jquery", "comm", "./party-model", "./workflow-actions", "./status-icons"],
function ($, comm, model, actions, icons) {
    "use strict";
    function state() { return window.crawl_party && window.crawl_party.state; }
    function hero(slot) { return state() && state().members.find(function (member) { return member.slot === slot; }); }
    function reason(member) {
        var data = state(), origin = data && hero(model.controlledSlot(data));
        if (!data || !origin || !member) return "Hero position unavailable.";
        var relative = model.relativePosition(data, member);
        if (relative.kind === "self") return "You are already here.";
        if (relative.kind === "away") return "Navigate to is only available on the same floor.";
        if (relative.kind !== "nearby") return "Hero position unavailable.";
        if (relative.distance <= 1) return "You are already beside this hero.";
        return actions.reason(origin);
    }
    function navigate(slot) {
        var member = hero(slot);
        if (!member || reason(member)) return;
        // Use the same native pathfinding, danger checks and interruption as a
        // dungeon click, resolving the current position immediately before use.
        comm.send_message("click_cell", { x: member.pos.x, y: member.pos.y, button: 1 });
    }
    function create(slot) {
        $(document).off("game_actions_changed.partyNavigation").on("game_actions_changed.partyNavigation", update);
        var $compass = $("<span class='party-compass' role='img' tabindex='0' data-tip-live></span>");
        // jQuery 1.8 addClass does not support SVG elements. Native classList
        // keeps the static rose and independently rotating needle addressable.
        var rose = icons.icon("compass-rose"), needle = icons.icon("compass-needle");
        rose.classList.add("compass-rose"); needle.classList.add("compass-needle");
        $compass.append(rose, needle,
            "<span class='compass-here' aria-hidden='true'></span>",
            $("<span class='compass-unknown' aria-hidden='true'></span>").append(icons.icon("question")));
        $compass.on("click keydown keypress keyup", function (event) { event.stopPropagation(); });
        var $button = $("<button type='button' class='party-mini-btn party-navigate-btn'></button>")
            .attr({ "data-navigate-slot": slot, "aria-label": "Navigate to hero" })
            .append(icons.icon("navigate"), document.createTextNode("Navigate to"))
            .on("click", function (event) { event.stopPropagation(); navigate(slot); });
        return [$compass[0], $button[0]];
    }
    function update() {
        var data = state(); if (!data || !data.members) return;
        $("#party_hud_members .party-member-card").each(function () {
            var member = hero(Number($(this).attr("data-party-slot")));
            if (!member) return;
            var relative = model.relativePosition(data, member), blocked = reason(member);
            var text = relative.kind === "self" ? "Your controlled hero"
                : relative.kind === "away" ? "Different floor: " + model.display(member.place)
                : relative.kind === "unknown" ? "Position unavailable"
                : relative.distance ? relative.direction + " · " + relative.distance + " tiles away" : "Same position";
            $(this).find(".party-compass").attr({ "data-direction-state": relative.kind === "nearby" && !relative.distance ? "here" : relative.kind,
                "aria-label": member.name + ": " + text, "data-tip-title": member.name + " · Direction",
                "data-tip-body": text, "data-tip-meta": "Relative to your controlled hero; north is up on the map." })
                .find(".compass-needle").css("transform", "rotate(" + (relative.angle || 0) + "deg)");
            // Visibility is known from native state. jQuery's toggle reads
            // computed layout for each card after the preceding DOM writes.
            $(this).find(".party-navigate-btn").prop("disabled", Boolean(blocked)).css("display", relative.kind === "self" ? "none" : "")
                .attr({ "aria-label": "Navigate to " + member.name, "data-tip-title": "Navigate to " + member.name,
                    "data-tip-body": blocked || "Travel toward this hero's current position. Normal movement costs, route availability and danger interruptions apply.",
                    "data-tip-meta": "Same floor only · Stops beside nearby teammates · Does not follow a moving hero." });
        });
        if (window.dcss_tooltips && $(".party-compass[aria-describedby~='dcss_rich_tooltip']").length)
            window.dcss_tooltips.refresh();
    }
    return { create: create, update: update, navigate: navigate };
});
