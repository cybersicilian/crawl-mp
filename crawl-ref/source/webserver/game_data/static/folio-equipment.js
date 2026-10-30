define(["jquery", "./party-model", "item-properties", "./workflow-actions", "chat", "./chat-context", "./equipment-paperdoll", "./native-tile-art", "./item-context-menu", "share-link", "./equipment-memory-ui", "./folio-bag"],
function ($, model, properties, actions, chat, chatContext, paperdoll, art, itemMenus, shareLink, memoryUI, bagUI) {
    "use strict";
    var views = Object.create(null);
    var categories = [
        { key: "all", label: "All items" }, { key: "equipped", label: "Equipped" },
        { key: "gear", label: "Gear" }, { key: "supplies", label: "Supplies" }
    ];
    function category(item, nativeFit) {
        var kind = item.kind_name || (typeof item.base_type === "string" ? item.base_type : "Item");
        var gear = nativeFit ? nativeFit.equipment : /weapon|armour|armor|jewellery|jewelry|staves|staff|gizmo/i.test(kind);
        var icon = /weapon|staves|staff/i.test(kind) ? "blade"
            : /armour|armor/i.test(kind) ? "armour" : /jewel/i.test(kind) ? "rune"
            : /potion/i.test(kind) ? "potion" : /scroll|book/i.test(kind) ? "book"
            : /wand|gizmo/i.test(kind) ? "spark" : /missile/i.test(kind) ? "dexterity" : "loot";
        return { name: kind, group: gear ? "gear" : "supplies", icon: icon };
    }
    function symbol(icon) {
        return $("<span class='folio-item-symbol' aria-hidden='true'></span>").append(properties.icon(icon));
    }
    function inspect(member, item, className, id) {
        var blocked = actions.inspectionReason(member) || (!Number.isInteger(item.slot) ? "Item identity is unavailable." : "");
        var button = $("<button type='button'></button>").addClass(className)
            .attr({ id: id, title: blocked || "Inspect this item and choose its native actions. " + actions.itemSecondaryHint(item),
                "data-folio-key": id.indexOf("party_item_") === 0 ? item.letter || "" : "",
                "aria-description": actions.itemSecondaryHint(item),
                "aria-label": "Inspect " + model.itemName(item) })
            .prop("disabled", Boolean(blocked)).on("click", function (event) {
                if (event.shiftKey) actions.itemSecondaryAction(member, item);
                else actions.describe(member, item);
            });
        return itemMenus.bind(button, member, item);
    }
    function loadout(member) {
        var section = $("<section id='companion_equip_slots' class='folio-loadout'></section>")
            .append($("<div class='folio-section-head'><h2>Loadout</h2><span>Choose an equipped slot to inspect</span></div>"));
        if (!member.equipment_slots_known) return section.append($("<p class='folio-empty'></p>").text("Loadout information unavailable."));
        if (!member.equipment_slots.length) return section.append($("<p class='folio-empty'></p>").text("No equipment slots reported."));
        var grid = $("<div class='folio-loadout-grid'></div>");
        member.equipment_slots.forEach(function (slot, index) {
            var item = !slot.empty && member.inventory.find(function (entry) {
                return Number.isInteger(slot.inv_slot) ? entry.slot === slot.inv_slot : entry.letter === slot.letter;
            });
            var card = item ? inspect(member, item, "folio-slot", "party_loadout_" + member.slot + "_" + index)
                : $("<div class='folio-slot'></div>");
            var icon = /weapon/i.test(slot.slot_name) ? "blade" : /offhand|shield/i.test(slot.slot_name) ? "shield"
                : /armour|armor|body/i.test(slot.slot_name) ? "armour" : /helmet/i.test(slot.slot_name) ? "helmet"
                : /boot/i.test(slot.slot_name) ? "boots" : /glove/i.test(slot.slot_name) ? "gloves"
                : /cloak/i.test(slot.slot_name) ? "cloak" : "rune";
            card.toggleClass("is-empty", Boolean(slot.empty)).append(symbol(icon));
            if (slot.empty && slot.name === "(empty)") card.addClass("is-vacant")
                .attr({ role: "group", "aria-label": (slot.slot_name || "Slot") + ": empty" });
            var copy = $("<span class='folio-slot-copy'></span>")
                .append($("<span class='slot-lbl'></span>").text(slot.slot_name || "Slot"));
            copy.append($("<span class='slot-val'></span>").append(
                properties.render(slot.name || "Empty", { focusable: false })));
            if (slot.melded) copy.append($("<span class='folio-state'>Melded</span>"));
            card.append(copy); grid.append(card);
        });
        return section.append(grid);
    }
    function row(member, item, index) {
        var fit = paperdoll.fit(member, item);
        var kind = category(item, fit), name = model.itemName(item);
        var state = paperdoll.itemState(member, item), worn = state !== "pack";
        var restriction = paperdoll.itemRestriction(member, item);
        var stateLabel = state === "melded" ? "Melded · inactive" : worn ? "Equipped" : "In backpack";
        var result = $("<li class='folio-inventory-row'></li>").attr({ "data-item-slot": item.slot,
            "data-equipped": String(worn), "data-item-state": state });
        var equipment = Boolean(paperdoll.profile(member));
        var artwork = fit ? art.create(fit.art, name, "folio-item-symbol", properties.icon(kind.icon)) : symbol(kind.icon);
        var copy = $("<span class='folio-item-copy'></span>");
        var title = $("<span class='folio-item-title'></span>").append(
            $("<kbd class='folio-letter'></kbd>").text(item.letter || "—"),
            $(properties.render(name, { focusable: !equipment })).attr({ tabindex: equipment ? null : 0, "data-tip-title": properties.parse(name).name,
                "data-tip-body": item.description || item.desc || "Known inventory of " + member.name,
                "data-tip-meta": stateLabel }));
        copy.append(title, $("<span class='folio-item-kind'></span>").text(kind.name));
        if (restriction) copy.append($("<span class='folio-item-fit-reason'></span>").text(restriction.reason));
        if (fit) copy.append(memoryUI.properties(fit.memory));
        if (fit && fit.equipment && fit.fits === false && state !== "melded") copy.append($("<span class='folio-item-fit-reason'></span>").text(fit.reason || "Does not fit now."));
        if (worn) copy.find(".folio-item-kind").append(
            $("<span class='folio-state'></span>").append(properties.icon(state === "melded" ? "moon" : "ready"), document.createTextNode(stateLabel)));
        var open = inspect(member, item, equipment ? "folio-item-open" : "workflow-button folio-inspect",
            "party_item_" + member.slot + "_" + item.slot);
        var buttons = $("<div class='folio-item-actions'></div>");
        if (fit && fit.bag_recovery) {
            var recovery = fit.bag_recovery;
            var recoveryReason = actions.reason(member) || recovery.blocked_reason || "";
            buttons.append($("<button type='button' class='workflow-button folio-bag-recover'>Recover contents</button>")
                .attr({ "aria-label": "Recover contents from " + name,
                    title: recoveryReason || "Take stored items out of this bag." })
                .prop("disabled", Boolean(recoveryReason))
                .on("click", function (event) { event.stopPropagation(); actions.openBag(member, recovery); }));
        }
        if (!worn && member.slot === actions.controlledSlot() && window.crawl_party.state.party_trade === true)
            buttons.append($("<button type='button' class='workflow-button folio-trade'>Trade</button>")
                .attr("aria-label", "Trade " + name).prop("disabled", Boolean(actions.reason(member)))
                .on("click", function () { $(document).trigger("party_trade_open", [null, item.slot]); }));
        if (equipment) open.append(artwork, copy).attr({ "data-tip-title": properties.parse(name).name,
            "data-tip-body": restriction ? restriction.reason : item.description || item.desc || "Inspect this item and choose its native actions.",
            "data-tip-meta": [stateLabel, "Select to inspect", actions.itemSecondaryHint(item)].filter(Boolean).join(" · ") });
        else buttons.append(open.append(properties.icon("eye"), document.createTextNode("Inspect")));
        if (item.record_id) {
            var recordPath = "/randarts/" + encodeURIComponent(item.record_id);
            (equipment ? buttons : copy).append($("<a target='_blank' rel='noopener'>View randart</a>").attr("href", recordPath));
            buttons.append(shareLink.controls(recordPath, name));
        }
        if (member.inventory_known) buttons.append(
            $("<button type='button' class='inventory-share-btn folio-share'></button>")
                .attr({ title: "Tag this item in expedition chat", "aria-label": "Share " + name + " in expedition chat" })
                .append(properties.icon("chat"), $("<span>Tag in chat</span>"))
                .on("click", function (event) {
                    event.stopPropagation();
                    var dialog = document.getElementById("party_inspector_modal");
                    if (dialog && dialog.open) dialog.close("share");
                    chat.tag_item(chatContext.inventory_item(item, member, index));
                }));
        return equipment ? result.append(open, buttons) : result.append(artwork, copy, buttons);
    }
    function render(member) {
        var view = views[member.slot] || (views[member.slot] = { query: "", filter: "all", slot: null });
        if (view.slot && !paperdoll.selected(member, view.slot)) view.slot = null;
        var root = $("<div class='folio-equipment'></div>");
        var equipment = paperdoll.render(member, { selection: view.slot,
            inspect: function (item, id, event) {
                if (event.shiftKey) actions.itemSecondaryAction(member, item);
                else actions.describe(member, item);
            },
            itemHint: actions.itemSecondaryHint,
            contextMenu: function (button, item) { itemMenus.bind(button, member, item); },
            select: function (key) {
                view.slot = view.slot === key ? null : key;
                view.filter = "all"; view.query = ""; search.val(""); apply();
            } });
        root.toggleClass("is-crpg-layout", Boolean(equipment)).append(equipment || loadout(member));
        var inventory = $("<section class='folio-inventory'></section>");
        var head = $("<div class='folio-section-head'><h2></h2></div>");
        head.find("h2").text(equipment ? "Backpack" : "Inventory");
        var summary = $("<div class='folio-inventory-summary'></div>").appendTo(head);
        var count = $("<span class='folio-result-count' role='status'></span>").appendTo(summary);
        if (member.slot === actions.controlledSlot() && window.crawl_party.state.party_trade === true)
            summary.append($("<button type='button' id='folio_trade_open' class='workflow-button'>Trade with party</button>")
                .prop("disabled", Boolean(actions.reason(member)))
                .on("click", function () { $(document).trigger("party_trade_open"); }));
        var search = $("<input type='search' id='party_inventory_search' aria-label='Search inventory' placeholder='Find an item or property…'>").val(view.query);
        var filters = $("<div class='folio-filters' role='group' aria-label='Inventory filters'></div>");
        var slotFilter = $("<button type='button' class='paperdoll-slot-filter' id='party_filter_slot'></button>")
            .on("click", function () { view.slot = null; apply(); });
        var list = $("<ul class='folio-inventory-list' aria-label='Inventory items'></ul>");
        var empty = $("<p class='folio-empty'></p>");
        function apply() {
            var query = view.query.trim().toLowerCase(), shown = 0;
            var selected = paperdoll.selected(member, view.slot);
            list.children().each(function (index) {
                var item = member.inventory[index], kind = category(item, paperdoll.fit(member, item));
                var matches = (view.filter === "all" || (view.filter === "equipped" ? paperdoll.itemState(member, item) !== "pack" : view.filter === kind.group))
                    && (model.itemName(item) + " " + kind.name).toLowerCase().includes(query)
                    && (!selected || paperdoll.matchesSlot(member, item, selected));
                this.hidden = !matches; if (matches) shown++;
            });
            filters.find("button").each(function () {
                this.setAttribute("aria-pressed", String(this.getAttribute("data-filter") === view.filter));
            });
            count.text(shown + " / " + member.inventory.length + " items");
            slotFilter.prop("hidden", !selected).text(selected ? selected.label + " · Clear ×" : "");
            root.find("[data-equip-slot]").each(function () { this.setAttribute("aria-pressed", String(this.getAttribute("data-equip-slot") === view.slot)); });
            empty.text(!member.inventory_known ? "Inventory information unavailable."
                : !member.inventory.length ? "Your pack is empty." : selected ? "No matching items for this slot. Clear the slot filter to see the full pack." : "No items match. Clear the search or choose All items.")
                .prop("hidden", shown > 0);
        }
        categories.forEach(function (filter) {
            filters.append($("<button type='button'></button>").attr({ "data-filter": filter.key, id: "party_filter_" + filter.key }).text(filter.label)
                .on("click", function () { view.filter = filter.key; apply(); }));
        });
        search.on("input", function () { view.query = this.value; apply(); });
        member.inventory.forEach(function (item, index) { list.append(row(member, item, index)); });
        inventory.append(head, $("<div class='folio-inventory-tools'></div>").append(search, filters), slotFilter, list, empty, bagUI.render(member));
        apply(); return root.append(inventory);
    }
    $(document).on("game_cleanup.folioEquipment", function () { views = Object.create(null); });
    return { render: render };
});
