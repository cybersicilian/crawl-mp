/* Campaign-wide options, controlled by the party host. */
define(["jquery"], function ($) {
    "use strict";
    function create(send) {
        var row = $("<div class='party-campaign-options' role='group' aria-label='Expedition rules'></div>");
        var locks = $("<input type='checkbox' id='campaign_rune_locks' checked>");
        var traps = $("<select id='campaign_traps'></select>");
        [["normal", "Normal"], ["none", "No ordinary traps"], ["floor", "Floor traps only"], ["random", "Random effects only"]]
            .forEach(function (entry) { traps.append($("<option></option>").val(entry[0]).text(entry[1])); });
        row.append($("<label class='party-campaign-locks' for='campaign_rune_locks'>Rune locks</label>").prepend(locks),
            $("<label class='party-campaign-traps' for='campaign_traps'>Traps</label>").append(traps),
            $("<small>Vault travel traps, pressure plates, and passages remain active.</small>"));
        locks.on("change", function () { send({ rune_locks: locks.prop("checked") }); });
        traps.on("change", function () { send({ trap_mode: traps.val() }); });
        return row;
    }
    function render(room, isHost) {
        $("#campaign_rune_locks").prop("checked", room.rune_locks !== false).prop("disabled", !isHost);
        $("#campaign_traps").val(room.trap_mode || "normal").prop("disabled", !isHost);
    }
    return { create: create, render: render };
});
