/* The server supplies the native legal menu and normalizes stale selections. */
define(["jquery", "searchable-select"], function ($, picker) {
    "use strict";

    function create(slot) {
        var id = "party_slot_weapon_" + slot;
        var noteId = id + "_note";
        var row = $("<div class='party-field-row party-weapon-row'></div>").hide();
        row.append($("<label class='party-field-label'></label>").attr("for", id).text("Starting weapon:"));
        row.append($("<select class='party-slot-select party-slot-weapon'></select>")
            .attr({ id: id, "data-slot": slot, "aria-describedby": noteId }));
        row.append($("<span class='party-field-label'></span>").attr("id", noteId));
        return row;
    }

    function render(box, slot) {
        var choices = slot.weapon_choices || [];
        var row = box.find(".party-weapon-row");
        var select = row.find("select");
        row.toggle(choices.length > 0);
        var key = JSON.stringify(choices);
        if (select.attr("data-choices") !== key) {
            select.empty().attr("data-choices", key);
            choices.forEach(function (weapon) {
                var label = weapon.charAt(0).toUpperCase() + weapon.slice(1);
                select.append($("<option></option>").val(weapon).text(label));
            });
        }
        select.val(slot.weapon || "").prop("disabled", choices.length < 2);
        picker.recommend(select[0], slot.weapon_recommendations);
        row.find("span").text(choices.length === 1
            ? "This race fights unarmed."
            : "★ Recommended · Applied when the expedition begins.");
    }

    return { create: create, render: render };
});
