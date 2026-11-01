define(["jquery", "comm", "./player", "./tileinfo-main", "./status-icons", "./workflow-actions", "./party-power-cards", "./power-art", "./native-tile-art", "spell-cost", "./frame-update", "./item-context-menu", "./equipment-paperdoll"],
function ($, comm, player, tiles, icons, actions, powerCards, powerArt, art, spellCost, frameUpdate, itemMenus, paperdoll) {
    "use strict";
    var filter = "all", signature = "";
    function member() {
        var state = window.crawl_party && window.crawl_party.state;
        return state && state.members.find(function (hero) { return hero.slot === actions.controlledSlot(); });
    }
    function iconButton(name, label) {
        return $("<button type='button' class='hud-icon-button'></button>")
            .attr({ "aria-label": label, "data-tip-title": label }).append(icons.icon(name));
    }
    function panel(id, title, glyph) {
        var root = $("<section class='hud-panel'></section>").attr({ id: id, "aria-label": title });
        var heading = $("<header class='hud-panel-heading'></header>").append(icons.icon(glyph),
            $("<strong></strong>").text(title), $("<small class='hud-panel-context'></small>"));
        root.append(heading, $("<div class='hud-panel-body'></div>"));
        return root;
    }
    function openInventory() {
        var hero = member();
        if (!hero) return;
        if (actions.reason(hero)) {
            if (window.crawl_party.open_inspector) window.crawl_party.open_inspector(hero.slot, "equipment");
            return;
        }
        comm.send_message("key", { keycode: 105 });
    }
    function openSpellLibrary() {
        var hero = member();
        if (!hero || actions.reason(hero)) return;
        comm.send_message("key", { keycode: 77 });
    }
    function itemAction(slot, describeOnly, secondary) {
        var hero = member(), item = hero && hero.inventory.find(function (entry) { return entry.slot === slot; });
        if (item) {
            if (secondary) actions.itemSecondaryAction(hero, item);
            else actions.itemAction(hero, item, describeOnly);
        }
    }

    function drawTile(canvas, item, hero) {
        hero = hero || member();
        var profile = hero && hero.equipment_profile;
        var entry = profile && Array.isArray(profile.items) && profile.items.find(function (candidate) { return candidate.inv_slot === item.slot; });
        if (entry) return art.draw(canvas, entry.art);
        if (!hero || hero.slot !== actions.controlledSlot()) return false;
        var native = player.inv[item.slot];
        if (!native || native.name !== item.name) return false;
        return drawTiles(canvas, native.tile);
    }
    function drawTiles(canvas, tile) {
        return art.drawIndices(canvas, tile, tiles);
    }
    function artState(hero) {
        return [hero.equipment_profile, player.inv, ["main", "icons"].map(function (id) {
            var image = document.getElementById(id);
            return Boolean(image && image.complete && image.naturalWidth);
        })];
    }
    function itemIcon(item) {
        var kind = item.kind_name || "";
        return /armour/i.test(kind) ? "armour" : /stave|staff/i.test(kind) ? "staff"
            : /weapon/i.test(kind) ? "weapon" : /potion/i.test(kind) ? "potion"
            : /scroll/i.test(kind) ? "scroll" : /book/i.test(kind) ? "book"
            : /jewel/i.test(kind) ? "jewellery" : /wand/i.test(kind) ? "wand"
            : /missile|ammunition/i.test(kind) ? "ammo" : "supplies";
    }
    function itemButton(hero, item, inspectOnly) {
        var verb = inspectOnly ? "Inspect" : actions.itemVerb(item);
        var blocked = inspectOnly ? "" : actions.reason(hero);
        var quantity = item.qty > 1 ? "Quantity: " + item.qty : "";
        var restriction = paperdoll.itemRestriction(hero, item);
        var button = iconButton(itemIcon(item), verb + " " + item.name + (quantity ? " · " + quantity : "")).addClass("hud-item-slot")
            .attr({ id: (inspectOnly ? "party_pack_" : "hud_item_") + hero.slot + "_" + item.slot,
                "data-tip-title": item.name, "data-tip-badge": item.kind_name || "Item",
                "data-tip-body": restriction ? restriction.reason : item.description || "Inspect this item for its known properties and available actions.",
                "data-tip-meta": [restriction ? "Melded · inactive" : item.equipped ? "Equipped" : "In pack", quantity, inspectOnly ? "Inspect " + hero.name + "'s equipment"
                    : blocked || "Click: " + verb.toLowerCase() + ". Right-click: actions.",
                    inspectOnly ? "" : actions.itemSecondaryHint(item)].filter(Boolean).join(" · "),
                "aria-disabled": String(Boolean(blocked)) })
            .toggleClass("is-equipped", Boolean(item.equipped)).toggleClass("is-melded", Boolean(restriction));
        if (restriction) button.attr("aria-label", verb + " " + item.name + ". Melded: " + restriction.reason);
        if (inspectOnly) {
            button.on("click contextmenu", function (event) {
                event.preventDefault(); event.stopPropagation();
                var party = window.crawl_party;
                if (party && party.open_inspector) party.open_inspector(hero.slot, "equipment");
            });
        }
        else {
            button.attr({ draggable: "true", "data-quick-kind": "item", "data-quick-id": item.slot,
                "aria-description": actions.itemSecondaryHint(item) })
                .on("click", function (event) { itemAction(item.slot, false, event.shiftKey); });
            itemMenus.bind(button, hero, item);
        }
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
        canvas.setAttribute("aria-hidden", "true");
        if (drawTile(canvas, item, hero)) button.empty().append(canvas);
        button.append($("<kbd class='hud-slot-letter'></kbd>").text(item.letter));
        if (item.qty > 1) button.append($("<span class='hud-slot-quantity'></span>").text(item.qty));
        if (restriction) button.append($("<span class='hud-melded-mark' aria-hidden='true'>M</span>"));
        else if (item.equipped) button.append($("<span class='hud-equipped-mark' aria-hidden='true'>◆</span>"));
        return button;
    }
    function renderInventory(hero) {
        var root = $("#hud_inventory"), body = root.find(".hud-item-grid"), focus = document.activeElement.id;
        root.attr("aria-label", "Inventory for " + hero.name);
        root.find(".hud-panel-context").text(hero.inventory.length + " / 52");
        root.find("[data-item-filter]").each(function () {
            $(this).attr("aria-pressed", String(this.dataset.itemFilter === filter));
        });
        var scroll = body.scrollTop(); body.empty();
        hero.inventory.filter(function (item) {
            return filter === "all" || (filter === "equipped" ? item.equipped : !item.equipped);
        }).forEach(function (item) {
            body.append(itemButton(hero, item, false));
        });
        if (!body.children().length) body.append($("<p class='hud-empty'></p>").text(
            !hero.inventory_known ? "Inventory information unavailable." : filter === "all" ? "Your pack is empty." : "No matching items."));
        body.scrollTop(scroll);
        var previous = document.getElementById(focus); if (previous) previous.focus({ preventScroll: true });
    }
    function renderPowers(hero) {
        var body = $("#hud_powers .hud-panel-body"), focus = document.activeElement.id, scroll = body.scrollTop();
        $("#hud_powers").attr("aria-label", "Abilities and spells for " + hero.name);
        $("#hud_powers .hud-panel-context").text(hero.abilities.length + hero.spells.length + " known");
        var libraryReason = actions.reason(hero);
        var library = hero.spell_library;
        var counts = library && Number.isInteger(library.total) && Number.isInteger(library.memorisable)
            ? library.total + (library.total === 1 ? " spell" : " spells") + " · " + library.memorisable + " can memorize"
            : "Counts unavailable";
        var noTrigger = library && Number.isInteger(library.without_automatic_trigger)
            ? library.without_automatic_trigger : 0;
        if (noTrigger > 0) counts += " · " + noTrigger + " no trigger";
        $("#hud_spell_library").prop("disabled", Boolean(libraryReason)).attr({
            "aria-label": "Spell library: " + counts + " (M)",
            "data-tip-key": "Key: M",
            "data-tip-body": libraryReason || "Browse unlearned spells in the shared library, including hidden spells and divine offers. The count shows spells you can individually memorize now, using your experience level and free spell levels. " + (hero.species === "Automaton" ? "No trigger counts unlearned spells without an automatic trigger, including hidden spells; you can still memorize them. " : "") + "Opening the library takes no turn."
        }).find(".hud-spell-library-counts").text(counts);
        body.empty();
        [["ability", hero.abilities], ["spell", hero.spells]].forEach(function (group) {
            group[1].forEach(function (entry) {
                var kind = group[0], label = (kind === "spell" ? "Cast " : "Use ") + entry.name;
                var button = actions.powerButton(hero, entry, kind).removeClass("workflow-button").addClass("hud-power-button")
                    .attr({ id: "hud_power_" + hero.slot + "_" + kind + "_" + entry.id,
                        draggable: "true", "data-quick-kind": kind, "data-quick-id": entry.id }).empty()
                    .append($(powerArt.create(entry, kind)).attr("aria-hidden", "true"));
                var shortcut = kind === "spell" ? entry.letter : entry.hotkey;
                if (shortcut) button.append($("<kbd class='hud-power-key' aria-hidden='true'></kbd>").text(shortcut));
                if (kind === "spell")
                    button.append($("<small class='hud-power-cost' aria-hidden='true'></small>").text(spellCost.format(entry)));
                // Failure chance is native; absent values stay unknown rather than zero.
                var fail = entry.fail === undefined || entry.fail === null || entry.fail === "" ? null : parseFloat(entry.fail);
                if (kind === "spell" || fail !== null)
                    button.append($("<small class='hud-power-fail' aria-hidden='true'></small>")
                        .attr("data-fail-tier", fail === null || !Number.isFinite(fail) ? "unknown" : fail >= 30 ? "risky" : fail >= 10 ? "caution" : "safe")
                        .text(fail === null || !Number.isFinite(fail) ? "?%" : Math.round(fail) + "%"));
                powerCards.attach(button, entry, kind === "spell" ? "Spell" : "Ability");
                var blocked = actions.powerReason(hero, entry, kind);
                if (blocked) button.attr("data-tip-meta", button.attr("data-tip-meta") + " · " + blocked);
                var details = [spellCost.format(entry), fail !== null && Number.isFinite(fail) ? "fail " + Math.round(fail) + "%" : ""]
                    .filter(function (part) { return part && part !== "Unavailable"; });
                button.attr({ "aria-label": label + (kind === "spell" && details.length ? " (" + details.join(", ") + ")" : "")
                    + (blocked ? ". Unavailable: " + blocked : ""), tabindex: 0 });
                if (blocked) button.attr("data-blocked", "true"); else button.removeAttr("data-blocked");
                // Keep disabled powers focusable so their cost/failure tooltip can be read.
                if (button.prop("disabled")) button.prop("disabled", false).attr("aria-disabled", "true");
                if (button.attr("aria-disabled") === "true") button[0].addEventListener("click", function (event) {
                    event.preventDefault(); event.stopImmediatePropagation();
                }, true);
                body.append(button);
            });
        });
        if (!body.children().length) body.append($("<p class='hud-empty'></p>").text(
            hero.abilities_known && hero.spells_known ? "No active powers yet. Learn a spell or unlock an ability."
                : "Power information unavailable."));
        body.scrollTop(scroll);
        var previous = document.getElementById(focus); if (previous) previous.focus({ preventScroll: true });
    }
    function update(force) {
        var hero = member(); if (!hero || !document.getElementById("hud_inventory")) return;
        var state = window.crawl_party && window.crawl_party.state;
        var next = JSON.stringify([
            hero.slot, hero.name, hero.xl, hero.hp, hero.mp, hero.alive, hero.ghost_haunting,
            hero.inventory_known, hero.inventory,
            hero.abilities_known, hero.abilities,
            hero.spells_known, hero.spells, hero.spell_library,
            Boolean(state && state.inventory_use),
            actions.reason(hero), actions.ready(),
            artState(hero), filter, powerArt.ready()
        ]);
        if (!force && signature === next) return;
        signature = next; renderInventory(hero); renderPowers(hero);
        $(document).trigger("hud_inventory_updated");
    }
    function init() {
        var sidebar = document.getElementById("right_column"); if (!sidebar) return;
        if (!document.getElementById("hud_inventory")) {
            var powers = panel("hud_powers", "Abilities & spells", "powers");
            powers.find(".hud-panel-heading").append(iconButton("book", "Spell library (M)")
                .attr("id", "hud_spell_library").append($("<span class='hud-spell-library-label'>Spell library<br></span>")
                    .append($("<small class='hud-spell-library-counts'></small>")))
                .on("click", openSpellLibrary));
            var inventory = panel("hud_inventory", "Inventory", "inventory");
            var filters = $("<div class='hud-inventory-tools' role='group' aria-label='Inventory filters'></div>");
            // Filters form one segmented control with short visible captions.
            var segments = $("<span class='hud-segmented' role='group' aria-label='Show'></span>").appendTo(filters);
            [["all", "filter-all", "All items", "All"], ["equipped", "filter-equipped", "Equipped items", "Worn"], ["pack", "filter-pack", "Unequipped items", "Pack"]]
                .forEach(function (entry) {
                    segments.append(iconButton(entry[1], entry[2]).addClass("hud-segment").attr("data-item-filter", entry[0])
                        .append($("<span class='hud-segment-label' aria-hidden='true'></span>").text(entry[3]))
                        .on("click", function () { filter = entry[0]; update(true); }));
                });
            filters.append(iconButton("inventory-open", "Open full inventory (i)").on("click", openInventory));
            filters.append(iconButton("inventory", "Trade with party").attr("id", "hud_trade_open")
                .on("click", function () { $(document).trigger("party_trade_open"); }));
            inventory.find(".hud-panel-heading").append(filters);
            inventory.find(".hud-panel-body").append($("<div class='hud-item-grid' role='group' aria-label='Carried items'></div>"));
            powers.appendTo(sidebar); inventory.appendTo(sidebar);
            $("#hud_powers, #hud_inventory").on("keydown.hud keypress.hud keyup.hud", function (event) { event.stopPropagation(); });
        }
        signature = ""; update(true);
        $("#main, #icons").off("load.hudItems").on("load.hudItems", function () {
            update(true); $(document).trigger("inventory_art_ready");
        });
        $(document).trigger("hud_inventory_ready");
    }
    var refresh = frameUpdate(update);
    $(document).on("party_state_rendered.hudInventory player_card_sections_mounted.hudInventory game_actions_changed.hudInventory player_state_changed.hudInventory", refresh)
        .on("game_cleanup.hudInventory", function () { refresh.cancel(); signature = ""; filter = "all"; });
    return { init: init, update: update, itemButton: itemButton, itemIcon: itemIcon, drawTile: drawTile, drawTiles: drawTiles, artState: artState };
});
