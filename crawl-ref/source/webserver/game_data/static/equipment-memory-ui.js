define(["jquery"], function ($) {
    "use strict";
    function properties(data, focusable) {
        var entries = data && data.transient_properties;
        if (!Array.isArray(entries) || !entries.length) return $();
        var body = entries.every(function (effect) { return effect.scope === "body"; });
        var heading = body ? "Absorbed" : "Transient";
        var root = $("<span class='equipment-memory-properties' role='group'></span>")
            .attr("aria-label", heading + " Oozle properties");
        root.append($("<small class='equipment-memory-label'></small>").text(heading));
        entries.forEach(function (effect) {
            root.append($("<span class='equipment-memory-property' tabindex='0'></span>")
                .text(effect.label).attr({ tabindex: focusable === false ? null : 0, "data-tip-title": heading + " · " + effect.label,
                    "data-tip-body": effect.method + " memory from " + effect.family
                        + ". Stored: " + (effect.source_label || effect.label)
                        + ". Numeric values scale with current Shapeshifting. Lasts until its memory is overwritten."
                        + (effect.scope === "body" ? " Applies once to the ooze, independently of equipped items."
                            : effect.family === "Armour" ? " Body protection is applied once, independent of clothing." : "") }));
        });
        return root;
    }
    function slots(data, heroSlot) {
        var root = $("<ol class='assimilation-slots' aria-label='Stored properties, eligible assimilation slots marked'></ol>");
        data.slots.forEach(function (slot) {
            var memory = slot.memory, next = slot.next && slot.unlocked;
            var effects = memory && Array.isArray(memory.effects) ? memory.effects : memory ? [memory] : [];
            var label = memory ? effects.map(function (effect) { return effect.label; }).join(" · ") : slot.unlocked ? "Empty" : "XL " + slot.unlock_xl;
            var meta = memory ? memory.family : slot.unlocked ? "Ready to fill" : "Locked";
            var explanation = memory ? memory.method + " from " + memory.source
                + (memory.scope === "body" ? ". Applies once to the ooze, independently of equipped items" : ". Applies to " + memory.family)
                + ". All " + effects.length + " properties share this slot. Stored → applied: "
                + effects.map(function (effect) { return (effect.source_label || effect.label) + " → " + effect.label; }).join(", ")
                + ". The whole bundle lasts until overwritten."
                : slot.unlocked ? "Assimilation chooses a random unlocked empty slot when it completes."
                : "Unlocks at experience level " + slot.unlock_xl + ".";
            if (memory && !slot.unlocked) { meta += " · inactive until XL " + slot.unlock_xl; explanation += " Inactive until XL " + slot.unlock_xl + "."; }
            if (next && memory) explanation += " This is the oldest memory and will be replaced next.";
            var row = $("<li class='assimilation-slot' tabindex='0'></li>")
                .attr({ id: "assimilation_slot_" + heroSlot + "_" + slot.slot,
                    "data-locked": String(!slot.unlocked), "data-next": String(next),
                    "data-tip-title": label + " · " + meta, "data-tip-body": explanation,
                    "aria-label": label + ". " + meta + ". " + explanation })
                .append($("<strong></strong>").text(label), $("<small></small>").text(meta));
            if (next) row.append($("<span class='assimilation-next'></span>").text(memory ? "Oldest → next" : "Open"));
            root.append(row);
        });
        return root;
    }
    return { properties: properties, slots: slots };
});
