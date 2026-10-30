define(["jquery", "./party-progress-model", "./status-icons", "./tileinfo-main", "./native-tile-art", "./party-initiative", "./enemy-initiative"],
function ($, model, icons, tiles, art, initiative, enemies) {
    "use strict";
    var runeSignature = "";
    function runeIcon(rune) {
        var index = rune.tile && tiles[rune.tile];
        var info = Number.isInteger(index) ? tiles.get_tile_info(index) : null;
        var native = info ? { texture: "main", layers: [{ sx: info.sx, sy: info.sy,
            w: info.ex - info.sx, h: info.ey - info.sy, ox: info.ox + 16 - info.w / 2,
            oy: info.oy + 32 - info.h, ymax: 32 }] } : null;
        var node = art.create(native, rune.name + " rune of Zot", "party-rune-art", icons.icon("rune"));
        node.setAttribute("aria-hidden", "true"); return node;
    }
    function update() {
        var $root = $("#party_progress"); if (!$root.length) return;
        var state = window.crawl_party && window.crawl_party.state;
        var progress = model.project(state);
        initiative.updateMonster($("#party_progress_monsters"), state);
        var goldLabel = progress.gold === null ? "Party gold unavailable" : progress.gold + " shared party gold";
        $("#party_progress_gold").attr({ "aria-label": goldLabel, "data-tip-title": goldLabel,
            "data-tip-body": "Gold is shared by the expedition." });
        $("#party_hud_gold").text(progress.gold === null ? "?" : progress.gold)
            .attr("data-tip-title", goldLabel);
        $("#party_progress_floor").attr({ "aria-label": "Current floor: " + (progress.place || "unavailable"),
            "data-tip-title": "Current floor", "data-tip-body": progress.place || "Floor information unavailable." })
            .find(".party-context-value").text(progress.place || "?");
        var bribeLabel = progress.bribeFund === null ? "No active branch bribe" : "Bribe fund: " + progress.bribeFund + " gold";
        $("#party_progress_bribe").prop("hidden", progress.bribeFund === null)
            .attr({ "aria-label": bribeLabel, "data-tip-title": bribeLabel,
                "data-tip-body": "Gold remaining to bribe the denizens of this branch. Hell branches share one fund." })
            .find(".party-context-value").text(progress.bribeFund === null ? "" : "Bribe: " + progress.bribeFund.toLocaleString("en-US"));
        var next = JSON.stringify([progress.runes, progress.runesKnown]);
        if (runeSignature === next) return;
        runeSignature = next;
        var $runes = $("#party_progress_runes").empty();
        progress.runes.forEach(function (rune) {
            var label = rune.name + " rune of Zot";
            $("<span class='party-progress-rune' tabindex='0' role='img'></span>")
                .attr({ "data-rune-name": rune.name, "aria-label": label + " collected",
                    "data-tip-title": label, "data-tip-body": "Collected by the party." })
                .append(runeIcon(rune)).appendTo($runes);
        });
        if (!progress.runes.length || !progress.runesKnown) {
            var label = progress.runesKnown ? "No runes collected" : "Rune collection information incomplete";
            $("<span class='party-rune-empty' tabindex='0' role='img'></span>")
                .attr({ "aria-label": label, "data-tip-title": label })
                .append($("<span aria-hidden='true'></span>").text(progress.runesKnown ? "0" : "?"))
                .appendTo($runes);
        }
    }
    function init() {
        if (!document.getElementById("party_progress")) {
            var $root = $("<div id='party_progress' role='group' aria-label='Party progress'>"
                + "<span id='party_progress_gold' class='party-context-stat' tabindex='0' role='img' aria-label='Shared party gold'></span>"
                + "<span id='party_progress_floor' class='party-context-stat' tabindex='0' role='img'><span class='party-context-value'></span></span>"
                + "<span id='party_progress_bribe' class='party-context-stat' tabindex='0' role='img' hidden><span class='party-context-value'></span></span>"
                + "<span id='party_progress_rune_group' role='group' aria-label='Collected runes'><span id='party_progress_runes'></span></span></div>");
            $root.find("#party_progress_gold").append(icons.icon("coin"));
            var $gold = $("#party_hud_gold");
            if (!$gold.length) $gold = $("<span id='party_hud_gold'></span>");
            $gold.appendTo($root.find("#party_progress_gold"));
            $root.find("#party_progress_floor").prepend(icons.icon("map"));
            $root.find("#party_progress_rune_group").prepend(icons.icon("rune"));
            $root.append(initiative.createMonster());
            $root.on("click keydown keypress keyup", function (event) { event.stopPropagation(); });
            $root.prependTo("#left_column");
        }
        runeSignature = ""; update();
        enemies.init();
        $(document).off(".partyProgress").on("party_state_rendered.partyProgress", update);
    }
    return { init: init, update: update };
});
