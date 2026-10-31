define(["require", "jquery", "./party-model", "./power-art", "./party-power-cards", "./workflow-actions", "./menu-keyboard", "spell-cost", "rich-text"],
function (require, $, model, powerArt, powers, actions, keyboard, spellCost, richText) {
    "use strict";
    var dialog, slot, kind = "spell", query = "", affordable = false, opener;
    var schools = [
        { pattern: /fire/i, icon: "flame", tone: "fire" },
        { pattern: /ice/i, icon: "frost", tone: "ice" },
        { pattern: /air/i, icon: "bolt", tone: "air" },
        { pattern: /necro/i, icon: "skull", tone: "death" },
        { pattern: /alch|pois/i, icon: "potion", tone: "alchemy" },
        { pattern: /transloc/i, icon: "blink", tone: "arcane" },
        { pattern: /summ|forge/i, icon: "rune", tone: "earth" },
        { pattern: /earth/i, icon: "armour", tone: "earth" },
        { pattern: /hex/i, icon: "eye", tone: "arcane" }
    ];
    function current() {
        var state = window.crawl_party && window.crawl_party.state;
        return state && state.members.find(function (member) { return member.slot === slot; });
    }
    function ensure() {
        if (dialog) return;
        $("<link rel='stylesheet'>").attr("href", require.toUrl("./styles/folio-controls.css")).appendTo("head");
        dialog = $("<dialog id='power_picker_dialog' closedby='any' aria-labelledby='power_picker_heading'>" +
            "<header class='power-picker-header'><div><span class='power-picker-eyebrow'>Combat grimoire</span>" +
            "<h1 id='power_picker_heading' tabindex='-1'>Spellcasting</h1><p id='power_picker_hero'></p></div>" +
            "<div class='power-picker-header-actions'><span id='power_picker_mp'></span>" +
            "<button type='button' class='folio-quiet-button' id='power_picker_close'>Close · Esc</button></div></header>" +
            "<div class='power-picker-tools'><div class='folio-filters' role='group' aria-label='Power type'>" +
            "<button type='button' data-power-kind='spell'>Spells</button><button type='button' data-power-kind='ability'>Abilities</button></div>" +
            "<input type='search' id='power_picker_search' aria-label='Search spells and abilities' placeholder='Find a spell or school…'>" +
            "<label class='power-picker-affordable'><input type='checkbox' id='power_picker_affordable'> <span id='power_picker_resource_filter'>Within MP</span></label></div>" +
            "<p id='power_picker_context' role='status'></p><div id='power_picker_list' class='power-picker-list'></div>" +
            "<footer class='power-picker-footer'><span id='power_picker_count' role='status'></span>" +
            "<span>Letter: use power · ↑ / ↓: select · Enter: use · /: search · [ / ]: spells / abilities</span></footer></dialog>")
            .appendTo("body")[0];
        $(dialog).on("click", "#power_picker_close", function () { dialog.close("close"); })
            .on("click", ".folio-filters [data-power-kind]", function () {
                kind = this.getAttribute("data-power-kind"); query = ""; render();
            }).on("input", "#power_picker_search", function () { query = this.value; filter(); })
            .on("change", "#power_picker_affordable", function () { affordable = this.checked; filter(); });
        dialog.addEventListener("keydown", function (event) {
            if (keyboard.typing(event.target) || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
            if (event.key === "/") {
                document.getElementById("power_picker_search").focus(); keyboard.consume(event); return;
            }
            if (event.key === "[" || event.key === "]") {
                kind = kind === "spell" ? "ability" : "spell"; query = ""; render(); keyboard.consume(event); return;
            }
            var buttons = dialog.querySelectorAll(".power-picker-cast-button");
            if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                if (keyboard.move(buttons, document.activeElement, event.key)) keyboard.consume(event);
                return;
            }
            var match = Array.from(buttons).find(function (button) {
                return button.getAttribute("data-folio-key") === event.key && keyboard.available(button);
            });
            if (match) {
                if (!event.repeat) keyboard.activate(match);
                keyboard.consume(event);
            }
        });
        ["keydown", "keypress", "keyup"].forEach(function (type) {
            dialog.addEventListener(type, function (event) { event.stopPropagation(); });
        });
        dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close("backdrop"); });
        dialog.addEventListener("close", function () {
            if (window.dcss_tooltips) window.dcss_tooltips.hide();
            $("#dcss_rich_tooltip").hide().appendTo("body");
            if (opener && opener.isConnected && dialog.returnValue !== "native-action") opener.focus({ preventScroll: true });
        });
    }
    function card(member, entry) {
        var spell = kind === "spell", school = schools.find(function (definition) {
            return definition.pattern.test(entry.schools || "");
        }) || { icon: spell ? "spark" : entry.is_god ? "holy" : "trait", tone: "arcane" };
        var blocked = actions.powerReason(member, entry, kind);
        var row = powers.attach($("<article class='power-picker-card'></article>"), entry, spell ? "Spell" : "Ability")
            .attr({ "data-power-id": entry.id, "data-tone": school.tone });
        var symbol = $("<span class='power-picker-symbol' aria-hidden='true'></span>").append(powerArt.create(entry, kind));
        var copy = $("<div class='power-picker-copy'></div>");
        copy.append($("<div class='power-picker-card-title'></div>").append(
            $("<kbd class='folio-letter'></kbd>").text((spell ? entry.letter : entry.hotkey) || "—"),
            $("<h2></h2>").text(entry.name || (spell ? "Spell" : "Ability"))));
        copy.append($("<p class='power-picker-school'></p>").text(spell
            ? "Level " + model.display(entry.level) + " · " + model.display(entry.schools)
            : entry.is_god ? "Divine invocation" : "Innate ability"));
        copy.append($("<div class='power-picker-description'></div>").html(richText.render(entry.desc || entry.description || "Description unavailable.")));
        var stats = $("<div class='power-picker-stats'></div>");
        function stat(label, value, className) {
            stats.append($("<span></span>").addClass(className || "")
                .append($("<small></small>").text(label), $("<strong></strong>").text(value)));
        }
        stat("Failure", model.percentage(entry.fail), parseFloat(entry.fail) >= 30 ? "is-risky" : "");
        if (spell) {
            stat("Power", model.display(entry.power));
            if (entry.damage) stat("Damage", entry.damage);
            if (entry.range) stat("Range", entry.range);
        }
        copy.append(stats);
        var controls = $("<div class='power-picker-cast'></div>")
            .append($("<span class='power-picker-cost'></span>").text(spell ? spellCost.format(entry) : model.display(entry.cost)),
                actions.powerButton(member, entry, kind).addClass("power-picker-cast-button").attr("id", "power_picker_cast_" + entry.id));
        if (blocked && blocked !== actions.reason(member)) controls.append($("<small class='power-picker-blocked'></small>")
            .text(blocked === "Not enough magic points." ? "Needs " + spellCost.format(entry) : blocked));
        return row.append(symbol, copy, controls);
    }
    function filter() {
        var member = current(); if (!member) return;
        var entries = member[kind === "spell" ? "spells" : "abilities"], count = 0;
        $("#power_picker_list .power-picker-card").each(function (index) {
            var entry = entries[index];
            var match = (entry.name + " " + (entry.schools || "")).toLowerCase().includes(query.trim().toLowerCase())
                && (!affordable || kind !== "spell" || !spellCost.reason(member, entry));
            this.hidden = !match; if (match) count++;
        });
        $("#power_picker_count").text(count + " / " + entries.length + (kind === "spell" ? " spells" : " abilities"));
        $("#power_picker_empty").prop("hidden", count > 0).text(!member[kind === "spell" ? "spells_known" : "abilities_known"]
            ? "Power information unavailable." : !entries.length
                ? (kind === "spell" ? "No spells memorised. Learn spells from books as your adventure progresses." : "No active abilities unlocked. Passive effects appear under Traits.")
                : "No powers match. Clear your search or change the cost filter.");
    }
    function render() {
        if (!dialog) return;
        var member = current(); if (!member) { if (dialog.open) dialog.close("hero-unavailable"); return; }
        model.normalize(member);
        var focused = dialog.contains(document.activeElement) ? document.activeElement.id : "";
        var selection = focused === "power_picker_search" ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
        var scroll = document.getElementById("power_picker_list").scrollTop;
        var spell = kind === "spell", entries = member[spell ? "spells" : "abilities"];
        $("#power_picker_heading").text(spell ? "Spellcasting" : "Abilities & invocations");
        $("#power_picker_hero").text(member.name + " · Level " + model.display(member.xl) + " " + model.display(member.species));
        var resource = spellCost.resource(member), unit = resource.toUpperCase();
        $("#power_picker_mp").text(model.display(member[resource]) + " / " + model.display(member[resource + "_max"]) + " " + unit);
        $("#power_picker_resource_filter").text("Within " + unit);
        $("#power_picker_search").val(query).attr("placeholder", spell ? "Find a spell or school…" : "Find an ability…");
        $("#power_picker_affordable").prop("checked", affordable).closest("label").prop("hidden", !spell);
        $(dialog).find(".folio-filters [data-power-kind]").each(function () {
            this.setAttribute("aria-pressed", String(this.getAttribute("data-power-kind") === kind));
        });
        var blocked = actions.reason(member);
        $("#power_picker_context").text(blocked || (spell && resource === "hp"
            ? "Spells cost HP. Casting must leave at least 1 HP. Native targeting and warnings apply."
            : "Native costs, targeting and warnings apply.")).toggleClass("is-blocked", Boolean(blocked));
        var list = $("#power_picker_list").empty();
        entries.forEach(function (entry) { list.append(card(member, entry)); });
        list.append($("<p id='power_picker_empty' class='folio-empty'></p>"));
        filter(); list[0].scrollTop = scroll;
        var target = document.getElementById(focused);
        if (target && !target.disabled) target.focus({ preventScroll: true });
        if (selection) target.setSelectionRange(selection[0], selection[1]);
    }
    function open(type) {
        ensure(); opener = document.activeElement;
        slot = actions.controlledSlot(); kind = type === "ability" ? "ability" : "spell";
        query = ""; affordable = false;
        var folio = document.getElementById("party_inspector_modal");
        if (folio && folio.open) folio.close("power-picker");
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
        render();
        if (!current()) return;
        $("#dcss_rich_tooltip").appendTo(dialog);
        dialog.showModal(); document.getElementById("power_picker_heading").focus();
    }
    $(document).on("party_state_rendered.powerPicker game_actions_changed.powerPicker", function () {
        if (dialog && dialog.open) render();
    }).on("game_cleanup.powerPicker", function () { if (dialog && dialog.open) dialog.close("cleanup"); });
    return { open: open };
});
