/* Trait compatibility comes from the native character catalog. */
define(["jquery", "character-catalog"], function ($, catalog) {
    "use strict";
    function create(slot) {
        var id = "party_slot_trait_" + slot;
        var row = $("<div class='party-field-row party-trait-row'></div>");
        var select = $("<select class='party-slot-select party-slot-trait'></select>")
            .attr("id", id).attr("data-slot", slot).attr("aria-describedby", id + "_reason");
        [["none", "None"], ["mummy", "Mummy"], ["zombie", "Zombie"], ["ghost", "Ghost"]]
            .forEach(function (entry) { select.append($("<option></option>").val(entry[0]).text(entry[1])); });
        row.append($("<label class='party-field-label'>Trait</label>").attr("for", id), select,
            $("<small class='party-trait-reason' role='status'></small>").attr("id", id + "_reason"));
        return row;
    }
    function refresh(card) {
        var species = catalog.species[card.querySelector(".party-slot-species").value];
        var job = card.querySelector(".party-slot-job").value;
        var select = card.querySelector(".party-slot-trait");
        if (!select) return;
        var reasons = species && species.trait_restrictions && species.trait_restrictions[job] || {};
        Array.from(select.options).forEach(function (option) {
            var reason = option.value === "none" ? "" : reasons[option.value];
            if (reason === undefined) reason = "Trait compatibility is unavailable.";
            var trait = catalog.character_traits && catalog.character_traits[option.value];
            option.disabled = !!reason; option.title = reason || (trait && trait.description) || "";
        });
        var selected = select.selectedOptions[0];
        var firstTrait = select.querySelector("option[value='mummy']");
        var message = selected && selected.value !== "none" ? selected.title
            : firstTrait && firstTrait.disabled ? firstTrait.title : "";
        card.querySelector(".party-trait-reason").textContent = message;
        select.setAttribute("aria-invalid", String(!!(selected && selected.disabled)));
    }
    return { create: create, refresh: refresh };
});
