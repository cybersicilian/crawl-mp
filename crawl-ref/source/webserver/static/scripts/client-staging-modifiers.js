/* Expedition rules: run modifiers ("Seasonings"), friendly fire, rune locks and traps.
 * One chip group for the host; a one-line summary for the sticky launch bar.
 * Score bonuses are the ones the server already advertises; nothing is invented. */
define(["jquery"], function ($) {
    "use strict";
    var SEASONINGS = [
        { id: "fast_boil", label: "Fast Boil", bonus: 25, effect: "Upstairs crumble behind you; floors come faster.",
          tip: "Hellcrawl-inspired rapid delve: upstairs crumble behind the party and floor transitions accelerate." },
        { id: "shared_ladle", label: "Shared Ladle", bonus: 20, effect: "Lethal blows draw vitality from the healthiest hero.",
          tip: "Lifelink cauldron: lethal blows draw emergency vitality from the healthiest cook in the pot." },
        { id: "heavy_pebbles", label: "Heavy Pebbles", bonus: 15, effect: "Relics, runes and floor-firsts score double.",
          tip: "High-stakes loot race: relics, runes, and floor-firsts award double Chef's Citation points." }
    ];
    var TRAPS = [["normal", "Normal"], ["none", "No ordinary traps"], ["floor", "Floor traps only"], ["random", "Random effects only"]];
    function chip(id, label, effect, bonus) {
        var button = $("<button type='button' class='party-rule-chip' aria-pressed='false'></button>");
        if (id) button.attr("id", id);
        button.append($("<span class='party-rule-name'></span>").text(label));
        if (bonus) button.append($("<span class='party-rule-score'></span>").text("+" + bonus + "% score"));
        button.append($("<small class='party-rule-effect'></small>").text(effect));
        return button;
    }
    function create(send) {
        var group = $("<div class='party-expedition-rules' id='party_expedition_rules' role='group' aria-label='Expedition rules'></div>");
        var heading = $("<div class='party-rules-heading'></div>");
        heading.append("<h3>Expedition rules</h3>", "<small>Host only · Applies to the whole party</small>");
        group.append(heading);

        var seasonings = $("<div id='party_seasonings_bar' class='party-seasonings-bar party-rule-chips' role='group' aria-label='Seasonings'></div>");
        seasonings.append("<span class='party-seasonings-label'>Seasonings</span>");
        SEASONINGS.forEach(function (item) {
            seasonings.append(chip("", item.label, item.effect, item.bonus)
                .addClass("party-seasoning-chip").attr("data-seasoning", item.id)
                .attr("data-tip-title", item.label + " (+" + item.bonus + "% score)")
                .attr("data-tip-body", item.tip).attr("data-tip-meta", "Run seasoning · Click to toggle"));
        });
        group.append(seasonings);

        var rules = $("<div class='party-rule-chips' role='group' aria-label='Combat and dungeon rules'></div>");
        rules.append("<span class='party-seasonings-label'>Rules</span>");
        var friendlyFire = chip("party_rule_friendly_fire", "Friendly fire", "Beams, bolts and blasts can hit allies in the line of fire.")
            .attr("data-tip-title", "Friendly fire").attr("data-tip-body", "On: beams, bolts and area effects can strike party allies in the line of fire. Off: allied projectiles and spells pass through party members.");
        var runeLocks = chip("campaign_rune_locks", "Rune locks", "Rune-gated branches stay sealed until the rune is found.")
            .attr("data-tip-title", "Rune locks").attr("data-tip-body", "Rune-gated branch entrances stay locked until the party holds the rune.");
        rules.append(friendlyFire, runeLocks);
        var traps = $("<label class='party-rule-select party-campaign-traps' for='campaign_traps'></label>");
        traps.append("<span class='party-rule-name'>Traps</span>");
        var trapSelect = $("<select id='campaign_traps' class='party-slot-select'></select>");
        TRAPS.forEach(function (entry) { trapSelect.append($("<option></option>").val(entry[0]).text(entry[1])); });
        traps.append(trapSelect, "<small class='party-rule-effect'>Vault travel traps, pressure plates and passages stay active.</small>");
        rules.append(traps);
        // Shared Fate stays a native checkbox: one death ends the expedition for everyone.
        var fate = $("<input type='checkbox' id='campaign_shared_fate' aria-describedby='campaign_shared_fate_help'>");
        var sharedFate = $("<div class='party-rule-select party-campaign-options party-rule-shared-fate' role='group' aria-label='Shared fate'></div>");
        sharedFate.append($("<label class='party-rule-name' for='campaign_shared_fate'>Shared Fate</label>").prepend(fate),
            $("<small id='campaign_shared_fate_help' class='party-rule-effect'>If one player dies, everyone loses. Overrides resurrection and extra lives in multiplayer.</small>"),
            $("<small class='party-rule-effect'>Each co-op hero starts with a scroll of soul recall. Resurrect fallen teammates at half health and magic; replacement scrolls are rare. Each resurrection permanently lowers that hero's level cap by one.</small>"));
        rules.append(sharedFate);
        group.append(rules);

        seasonings.on("click", ".party-seasoning-chip", function (event) {
            event.preventDefault();
            var room = send.room && send.room(); if (!room) return;
            var key = $(this).attr("data-seasoning");
            var current = Array.isArray(room.seasonings) ? room.seasonings.slice() : [];
            var at = current.indexOf(key);
            if (at === -1) current.push(key); else current.splice(at, 1);
            send({ seasonings: current });
        });
        friendlyFire.on("click", function (event) {
            event.preventDefault();
            var room = send.room && send.room(); if (!room) return;
            send({ friendly_fire: room.friendly_fire === false });
        });
        runeLocks.on("click", function (event) {
            event.preventDefault();
            send({ rune_locks: runeLocks.attr("aria-pressed") !== "true" });
        });
        trapSelect.on("change", function () { send({ trap_mode: trapSelect.val() }); });
        fate.on("change", function () { send({ shared_fate: fate.prop("checked") }); });
        return group;
    }
    function summarize(room) {
        var active = Array.isArray(room.seasonings) ? room.seasonings : [];
        var parts = [], bonus = 0;
        SEASONINGS.forEach(function (item) {
            if (active.indexOf(item.id) === -1) return;
            parts.push(item.label); bonus += item.bonus;
        });
        parts.push(room.friendly_fire !== false ? "Friendly fire on" : "Friendly fire off");
        if (room.rune_locks !== false) parts.push("Rune locks");
        if (room.shared_fate === true) parts.push("Shared fate");
        var trap = TRAPS.find(function (entry) { return entry[0] === (room.trap_mode || "normal"); });
        if (trap && trap[0] !== "normal") parts.push("Traps: " + trap[1].toLowerCase());
        return { text: parts.join(" · "), bonus: bonus };
    }
    function render(room, isHost) {
        var active = Array.isArray(room.seasonings) ? room.seasonings : [];
        $("#party_seasonings_bar .party-seasoning-chip").each(function () {
            var key = $(this).attr("data-seasoning");
            $(this).attr("aria-pressed", String(active.indexOf(key) !== -1)).prop("disabled", !isHost);
        });
        $("#party_rule_friendly_fire").attr("aria-pressed", String(room.friendly_fire !== false)).prop("disabled", !isHost);
        $("#campaign_rune_locks").attr("aria-pressed", String(room.rune_locks !== false)).prop("disabled", !isHost);
        $("#campaign_traps").val(room.trap_mode || "normal").prop("disabled", !isHost);
        $("#campaign_shared_fate").prop("checked", room.shared_fate === true).prop("disabled", !isHost);
        $("#party_expedition_rules").toggleClass("is-readonly", !isHost);
        var summary = summarize(room);
        $("#party_rules_summary_text").text(summary.text);
        $("#party_rules_score").text(summary.bonus ? "+" + summary.bonus + "% score" : "Base score")
            .toggleClass("is-bonus", summary.bonus > 0);
    }
    return { create: create, render: render, summarize: summarize, SEASONINGS: SEASONINGS };
});
