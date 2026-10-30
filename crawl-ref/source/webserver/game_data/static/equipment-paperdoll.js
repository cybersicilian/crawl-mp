define(["jquery", "item-properties", "./native-tile-art", "./equipment-memory-ui"], function ($, properties, art, memoryUI) {
    "use strict";
    var types = {
        weapon: { icon: "blade", side: "left" }, offhand: { icon: "shield", side: "right" },
        body: { icon: "armour", side: "right" }, head: { icon: "helmet", side: "left" },
        hands: { icon: "gloves", side: "left" }, feet: { icon: "boots", side: "right" },
        barding: { icon: "armour", side: "right" }, cloak: { icon: "cloak", side: "left" },
        ring: { icon: "rune", side: "accessories" }, amulet: { icon: "rune", side: "accessories" },
        weapon_offhand: { icon: "blade", side: "right" }, haunted_armour: { icon: "armour", side: "extra" },
        gizmo: { icon: "spark", side: "extra" }, bag: { icon: "loot", side: "left" },
        twohander: { icon: "blade", side: "extra", support: true }
    };
    function profile(member) {
        var data = member.equipment_profile;
        return data && data.version === 1 && Array.isArray(data.slots) && Array.isArray(data.items) ? data : null;
    }
    function fit(member, item) {
        var data = profile(member);
        return data && data.items.find(function (entry) { return entry.inv_slot === item.slot; });
    }
    function selected(member, key) {
        var data = profile(member);
        return data && data.slots.find(function (slot) { return slot.key === key && slot.capacity > 0; });
    }
    function itemState(member, item) {
        var data = profile(member);
        var owners = data ? data.slots.filter(function (slot) { return slot.inv_slot === item.slot; }) : [];
        if (owners.some(function (slot) { return slot.state === "melded"; })) return "melded";
        return item.equipped || owners.some(function (slot) {
            return slot.state === "equipped" || slot.state === "occupied";
        }) ? "equipped" : "pack";
    }
    function itemRestriction(member, item) {
        var data = profile(member);
        return data && data.slots.find(function (slot) {
            return slot.inv_slot === item.slot && slot.state === "melded" && slot.reason;
        });
    }
    function matchesSlot(member, item, slot) {
        var candidate = fit(member, item);
        if (!candidate || !candidate.equipment) return false;
        if ((candidate.slot_types || []).includes(slot.type)) return true;
        var support = slot.support_only === undefined ? Boolean((types[slot.type] || {}).support) : slot.support_only;
        return support && (candidate.required_slots || []).some(function (alternatives) {
            return alternatives.includes(slot.type);
        });
    }
    function restriction(label, reason) {
        return $("<span class='paperdoll-restriction' tabindex='0'></span>").text(label)
            .attr({ "data-tip-title": label, "data-tip-body": reason,
                "aria-label": label + ": " + reason });
    }
    function slotCard(member, slot, options) {
        var item = member.inventory.find(function (entry) { return entry.slot === slot.inv_slot; });
        var definition = types[slot.type] || { icon: "rune" };
        var card = $("<button type='button' class='paperdoll-slot'></button>").attr({
            id: "party_loadout_" + member.slot + "_" + slot.key.replace(/[^a-z0-9_]/gi, "_"),
            "data-equip-slot": slot.key, "data-slot-type": slot.type, "data-state": slot.state,
            "aria-pressed": String(options.selection === slot.key),
            "aria-label": slot.label + ": " + (slot.name || slot.state) + (slot.reason ? ". " + slot.reason : ""),
            "aria-description": item && options.itemHint ? options.itemHint(item) : "",
            "data-tip-title": slot.label + (slot.name ? " · " + slot.name : ""),
            "data-tip-body": slot.reason || (item ? "Inspect this equipped item and its native actions." : "Show inventory for this equipment slot."),
            "data-tip-meta": ["Native slot", slot.state, item && options.itemHint && options.itemHint(item)].filter(Boolean).join(" · ")
        });
        var compatibility = item && fit(member, item);
        card.append(art.create(compatibility && compatibility.art, slot.label, "paperdoll-slot-art", properties.icon(definition.icon)));
        var label = definition.side === "extra" && /\d+$/.test(slot.label) ? slot.label.match(/\d+$/)[0] : slot.label;
        var copy = $("<span class='paperdoll-slot-copy'></span>").append($("<span class='paperdoll-slot-label'></span>").text(label));
        copy.append($("<span class='paperdoll-slot-name'></span>").append(
            properties.render(slot.name || (slot.state === "blocked" ? "Form blocked" : "Empty"), { focusable: false })));
        if (["melded", "occupied"].includes(slot.state)) copy.append($("<span class='paperdoll-slot-state'></span>")
            .text(slot.state === "melded" ? "Melded" : "Shared occupancy"));
        if (slot.state === "melded" && slot.reason)
            copy.append($("<span class='paperdoll-slot-state'></span>").text(slot.reason));
        if (compatibility) copy.append(memoryUI.properties(compatibility.memory, false));
        card.append(copy).on("click", function (event) {
            if (item) options.inspect(item, card[0].id, event);
            else options.select(slot.key);
        });
        if (item && options.contextMenu) options.contextMenu(card, item);
        // Blocked and shared slots stay inspectable so their state is explained.
        return card;
    }
    function render(member, options) {
        var data = profile(member);
        if (!data) return null;
        var root = $("<section id='companion_equip_slots' class='equipment-paperdoll' aria-label='Equipment and anatomy'></section>");
        root.append($("<div class='folio-section-head'><h2>Loadout</h2><span>Worn &amp; wielded</span></div>"));
        var identity = $("<div class='paperdoll-identity'></div>").append($("<strong></strong>").text(data.species || member.species),
            $("<span></span>").text([data.size, data.form].filter(Boolean).join(" · ")));
        root.append(identity);
        var board = $("<div class='paperdoll-board'></div>");
        var left = $("<div class='paperdoll-column paperdoll-left'></div>");
        var right = $("<div class='paperdoll-column paperdoll-right'></div>");
        var portrait = $("<div class='paperdoll-portrait'></div>");
        portrait.append($("<strong></strong>").text(member.name),
            art.create(data.portrait, member.name + " · Current appearance", "paperdoll-hero-art",
            $("<span class='paperdoll-no-art'>Appearance unavailable</span>")[0]));
        var weapon = data.slots.find(function (slot) { return slot.type === "weapon"; });
        if (data.unarmed_attack && weapon && (weapon.capacity === 0 || ["melded", "blocked"].includes(weapon.state)))
            portrait.append($("<span class='paperdoll-unarmed'></span>").text(data.unarmed_attack));
        var defences = $("<dl class='paperdoll-defences' aria-label='Current defences'></dl>");
        [["AC", member.ac], ["EV", member.ev], ["SH", member.sh]].forEach(function (entry) {
            if (Number.isFinite(entry[1])) defences.append($("<div></div>").append(
                $("<dt></dt>").text(entry[0]), $("<dd></dd>").text(entry[1])));
        });
        if (defences.children().length) portrait.append(defences);
        var accessories = $("<div class='paperdoll-accessories' aria-label='Jewellery'></div>");
        var extras = Object.create(null);
        var areas = { left: left, right: right, accessories: accessories };
        var restrictions = $("<div class='paperdoll-restrictions' aria-label='Equipment limitations'></div>");
        var order = ["head", "cloak", "bag", "weapon", "hands", "body", "offhand", "weapon_offhand", "feet", "barding", "ring", "amulet", "gizmo", "haunted_armour", "twohander"];
        data.slots.slice().sort(function (a, b) { return order.indexOf(a.type) - order.indexOf(b.type); }).forEach(function (slot) {
            if (slot.capacity > 0) {
                var side = (types[slot.type] || {}).side || "extra";
                if (side === "extra") {
                    if (!extras[slot.type]) extras[slot.type] = {
                        label: slot.label.replace(/\s+\d+$/, ""),
                        slots: $("<div class='paperdoll-extra'></div>").attr("aria-label", slot.label.replace(/\s+\d+$/, ""))
                    };
                    extras[slot.type].slots.append(slotCard(member, slot, options));
                } else areas[side].append(slotCard(member, slot, options));
            } else if (slot.reason && ["weapon", "offhand", "body", "head", "hands", "feet", "cloak", "bag", "ring", "amulet"].includes(slot.type)
                && !(slot.alternatives || []).length) restrictions.append(restriction("No " + slot.label.toLowerCase(), slot.reason));
        });
        (data.restrictions || []).forEach(function (entry) { restrictions.append(restriction(entry.label, entry.reason)); });
        var frame = $("<div class='paperdoll-frame'></div>").append(board.append(left, portrait, right));
        function rack(label, slots) {
            if (!slots.children().length) return;
            frame.append($("<div class='paperdoll-rack'></div>").append(
                $("<h3></h3>").text(label), slots));
        }
        if (accessories.children().length <= 3) portrait.append(accessories);
        else rack("Jewellery", accessories);
        Object.keys(extras).forEach(function (type) { rack(extras[type].label, extras[type].slots); });
        root.append(frame);
        if (restrictions.children().length) root.append(restrictions);
        root.append($("<p class='paperdoll-help'>Select gear to inspect · Empty sockets show matching items</p>"));
        return root;
    }
    return { profile: profile, fit: fit, selected: selected, itemState: itemState, itemRestriction: itemRestriction,
        matchesSlot: matchesSlot, render: render };
});
