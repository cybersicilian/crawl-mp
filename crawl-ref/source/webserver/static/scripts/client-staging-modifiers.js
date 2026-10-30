/* Campaign-wide options, controlled by the party host. */
define(["jquery"], function ($) {
    "use strict";
    function create(send) {
        var row = $("<div class='party-campaign-options' role='group' aria-label='Expedition rules'></div>");
        var locks = $("<input type='checkbox' id='campaign_rune_locks' checked>");
        var traps = $("<select id='campaign_traps'></select>");
        var fate = $("<input type='checkbox' id='campaign_shared_fate' aria-describedby='campaign_shared_fate_help'>");
        [["normal", "Normal"], ["none", "No ordinary traps"], ["floor", "Floor traps only"], ["random", "Random effects only"]]
            .forEach(function (entry) { traps.append($("<option></option>").val(entry[0]).text(entry[1])); });
        row.append($("<label class='party-campaign-locks' for='campaign_rune_locks'>Rune locks</label>").prepend(locks),
            $("<label class='party-campaign-traps' for='campaign_traps'>Traps</label>").append(traps),
            $("<small>Vault travel traps, pressure plates, and passages remain active.</small>"));
        row.append($("<label for='campaign_shared_fate'>Shared Fate</label>").prepend(fate),
            $("<small id='campaign_shared_fate_help'>If one player dies, everyone loses. Overrides resurrection and extra lives in multiplayer.</small>"),
            $("<small>Each co-op hero starts with a scroll of soul recall. Resurrect fallen teammates at half health and magic; replacement scrolls are rare. Each resurrection permanently lowers that hero's level cap by one.</small>"));
        locks.on("change", function () { send({ rune_locks: locks.prop("checked") }); });
        traps.on("change", function () { send({ trap_mode: traps.val() }); });
        fate.on("change", function () { send({ shared_fate: fate.prop("checked") }); });
        return row;
    }
    function render(room, isHost) {
        $("#campaign_rune_locks").prop("checked", room.rune_locks !== false).prop("disabled", !isHost);
        $("#campaign_traps").val(room.trap_mode || "normal").prop("disabled", !isHost);
        $("#campaign_shared_fate").prop("checked", room.shared_fate === true).prop("disabled", !isHost);
    }
    return { create: create, render: render };
});
