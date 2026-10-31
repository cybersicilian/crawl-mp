/* Mission bar: who is in control, the turn mode, where we are and the world clock.
   Presentation only; party.js, gameplay-controls.js and party-progress.js keep
   writing the authoritative hero, mode, gold, floor and rune facts. */
define(["jquery", "./party-model", "./player", "character-catalog", "./frame-update", "./status-icons"],
function ($, model, player, catalog, frameUpdate, icons) {
    "use strict";
    var portraitKey = "";
    function state() { return window.crawl_party && window.crawl_party.state; }
    function hero() {
        var current = state();
        return current && current.members.find(function (member) { return member.slot === model.controlledSlot(current); });
    }
    function label(target, text) {
        var $target = $(target);
        if (!$target.length || $target.children(".mission-label").length) return;
        var $label = $("<span class='mission-label' aria-hidden='true'></span>").text(text);
        var $icon = $target.children(".tt-icon").first();
        if ($icon.length) $icon.after($label); else $target.prepend($label);
    }
    function portrait(member) {
        var root = document.getElementById("mission_portrait"); if (!root) return;
        var key = member ? [member.slot, member.species].join(":") : "";
        if (key === portraitKey) return;
        portraitKey = key; root.textContent = "";
        var species = member && catalog.species && catalog.species[member.species];
        if (species && species.tile) {
            var art = document.createElement("img"); art.src = species.tile.src; art.alt = "";
            art.width = art.height = 32; root.appendChild(art);
        } else root.appendChild(icons.icon("user"));
        var tag = document.createElement("small");
        tag.textContent = member ? "P" + (member.slot + 1) : "";
        root.appendChild(tag);
        root.style.setProperty("--mission-accent", member ? model.colours[member.slot % model.colours.length] : "");
    }
    function clock(current) {
        var root = document.getElementById("mission_clock"); if (!root) return;
        var value = document.getElementById("mission_clock_value");
        var turn = Number.isFinite(player.turn) ? player.turn : null;
        var world = current && Number.isFinite(current.world_aut_clock) ? current.world_aut_clock
            : Number.isFinite(player.time) ? player.time : null;
        var text = turn !== null ? String(turn) : world !== null ? (world / 10).toFixed(1) : "?";
        var detail = world !== null ? "World clock " + (world / 10).toFixed(1) + " decaAut" : "";
        if (value.textContent !== text) value.textContent = text;
        var description = turn !== null ? "Turn " + turn + (detail ? " · " + detail : "")
            : world !== null ? detail : "World clock unavailable";
        if (root.getAttribute("aria-label") !== description) {
            root.setAttribute("aria-label", description);
            root.setAttribute("data-tip-title", turn !== null ? "Game turn " + turn : "World clock");
            root.setAttribute("data-tip-body", (detail || "Turn information is unavailable.")
                + " Ten aut make one normal-speed turn; the engine advances the clock.");
        }
    }
    function update() {
        var current = state(), member = hero();
        var banner = document.getElementById("party_turn_banner"); if (!banner) return;
        portrait(member);
        clock(current);
        var combat = Boolean(member && current && model.inCombat(current, member));
        banner.setAttribute("data-mode", combat ? "combat" : "explore");
        var who = document.getElementById("party_banner_who");
        if (who && member) who.setAttribute("title", member.name + (member.species ? " · " + member.species : "") + (member.job ? " " + member.job : ""));
    }
    var refresh = frameUpdate(update);
    function init() {
        var banner = document.getElementById("party_turn_banner"); if (!banner) return;
        // Expedition facts rendered by party-progress.js join the strip in flow.
        var $progress = $("#party_progress"), $status = $("#mission_status");
        if ($progress.length && $status.length && !$status.find("#party_progress").length) $progress.appendTo($status);
        label("#party_progress_gold", "Gold");
        label("#party_progress_floor", "Floor");
        label("#party_progress_rune_group", "Runes");
        var $tools = $("#mission_bar_tools");
        if ($tools.length) {
            var $zoom = $("#hud_zoom_controls");
            if ($zoom.length && !$tools.find("#hud_zoom_controls").length) $zoom.prependTo($tools);
            $("#party_banner_cycle, #party_banner_center").appendTo($tools);
        }
        $(banner).off(".missionBar").on("keydown.missionBar keypress.missionBar keyup.missionBar", "button, [tabindex]", function (event) {
            event.stopPropagation();
        });
        portraitKey = ""; update();
    }
    $(document).on("party_state_rendered.missionBar player_state_changed.missionBar game_actions_changed.missionBar", refresh)
        .on("game_cleanup.missionBar", function () { refresh.cancel(); portraitKey = ""; });
    return { init: init, update: update };
});
