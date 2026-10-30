define(["jquery", "./workflow-actions", "./equipment-memory-ui", "./frame-update"],
function ($, actions, memoryUI, frameUpdate) {
    "use strict";
    var expanded = Object.create(null), focusToRestore = "";
    function isolate(event) {
        if (event.key !== "Tab") event.stopPropagation();
    }
    function render(card, hero) {
        var data = hero.equipment_profile && hero.equipment_profile.assimilation;
        var previous = card.children(".assimilation-panel");
        if (!data || ![1, 2, 3].includes(data.version) || !Array.isArray(data.slots)) { previous.remove(); return; }
        var controlled = hero.slot === actions.controlledSlot();
        var signature = JSON.stringify([data, controlled, actions.reason(hero), hero.abilities]);
        if (previous.attr("data-signature") === signature) return;
        var digestionOpen = previous.length ? previous.find("details").prop("open") : expanded[hero.slot];
        var focusId = previous[0] && previous[0].contains(document.activeElement) ? document.activeElement.id : focusToRestore;
        var root = $("<section class='assimilation-panel' aria-label='Oozle memory'></section>")
            .attr("data-signature", signature).on("click contextmenu keydown keypress keyup", isolate);
        var heading = $("<header><strong>Assimilation</strong></header>")
            .append($("<span></span>").text(data.used + " / " + data.capacity));
        root.append(heading);
        if (Number.isFinite(data.numeric_percent)) root.append($("<p class='assimilation-quality'></p>")
            .text("Shapeshifting " + (data.shapeshifting_tenths / 10).toFixed(1) + " · " + data.numeric_percent + "% numeric strength"));
        root.append(memoryUI.slots(data, hero.slot));
        var inheritance = data.version >= 3 ? [["Body", data.body_properties]]
            : [["Body", data.body_properties], ["Unarmed", data.unarmed_properties]];
        inheritance.forEach(function (entry) {
            if (Array.isArray(entry[1]) && entry[1].length) root.append($("<div class='assimilation-inheritance'></div>")
                .append($("<small></small>").text(entry[0]), memoryUI.properties({ transient_properties: entry[1] })));
        });
        if (data.next_xl) root.append($("<small class='assimilation-unlock'></small>").text("Next slot at XL " + data.next_xl));
        var work = data.work;
        if (work && work.remaining > 0) {
            root.append($("<div class='assimilation-work' role='status'></div>")
                .append($("<strong></strong>").text("Assimilating · " + work.remaining + " turns left"),
                    $("<progress></progress>").attr({ max: work.total, value: work.total - work.remaining,
                        "aria-label": "Assimilation progress" }), $("<small></small>").text(work.source)));
        }
        else if (controlled) {
            var ability = (hero.abilities || []).find(function (entry) { return entry.name === "Assimilate"; });
            var blocked = ability ? actions.powerReason(hero, ability, "ability") : "Assimilation is unavailable.";
            root.append($("<button type='button' class='assimilation-start'>Assimilate an item…</button>")
                .attr({ id: "assimilation_start_" + hero.slot, title: blocked || "Choose an inventory item. Five owner turns; full extracted bundle; oldest memory replaced." })
                .prop("disabled", Boolean(blocked)).on("click", function () { actions.usePower(hero, ability, "ability"); }));
        }
        var digesting = Array.isArray(data.digesting) ? data.digesting : [];
        if (digesting.length) {
            var details = $("<details class='assimilation-digestion'></details>").prop("open", Boolean(digestionOpen))
                .on("toggle", function () { expanded[hero.slot] = this.open; });
            details.append($("<summary></summary>").attr("id", "assimilation_digestion_" + hero.slot)
                .text("Digesting equipment · " + digesting.length));
            digesting.forEach(function (item) {
                var line = $("<div></div>").append($("<span></span>").text(item.name));
                line.append($("<small></small>").text(item.protected ? "Protected" : Math.ceil(item.remaining_aut / 10) + " exposure turns left"));
                if (Number.isFinite(item.weapon_damage_percent)) line.append($("<small class='assimilation-weapon-wear'></small>")
                    .text(item.weapon_damage_percent + "% base damage · −" + item.weapon_penalty + " accuracy"));
                if (!item.protected) line.append($("<progress max='100'></progress>")
                    .attr({ value: item.progress, "aria-label": "Digestion of " + item.name }));
                details.append(line);
            });
            root.append(details);
        }
        root.append($("<p class='assimilation-rule'></p>").text("One slot holds the whole extracted bundle. Oldest memory is replaced first."));
        if (previous.length) previous.replaceWith(root);
        else card.children(".party-card-sections").length ? root.insertBefore(card.children(".party-card-sections")) : card.append(root);
        if (focusId) { var target = document.getElementById(focusId); if (target) { target.focus({ preventScroll: true }); focusToRestore = ""; } }
    }
    function mount() {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state || !Array.isArray(state.members)) return;
        $("#party_hud_members > .party-card").each(function () {
            var card = $(this), slot = Number(card.attr("data-party-slot"));
            var hero = state.members.find(function (entry) { return entry.slot === slot; });
            if (hero) render(card, hero);
        });
    }
    var refresh = frameUpdate(mount);
    function init() {
        $(document).off(".assimilationPanel")
            .on("party_state_rendered.assimilationPanel player_card_sections_mounted.assimilationPanel game_actions_changed.assimilationPanel", refresh)
            .on("party_cards_rebuilding.assimilationPanel", function () {
                var target = document.activeElement;
                if ($(target).closest(".assimilation-panel").length) focusToRestore = target.id;
            })
            .on("game_cleanup.assimilationPanel", function () {
                expanded = Object.create(null); focusToRestore = ""; refresh.cancel();
            });
        mount();
    }
    return { init: init, mount: mount };
});
