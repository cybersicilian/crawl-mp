define(["jquery"], function ($) {
    "use strict";
    function properties(data, focusable) {
        var entries = data && data.transient_properties;
        if (!Array.isArray(entries) || !entries.length) return $();
        var root = $("<span class='equipment-memory-properties' role='group' aria-label='Transient Oozle properties'></span>");
        root.append($("<small class='equipment-memory-label'>Transient</small>"));
        entries.forEach(function (effect) {
            root.append($("<span class='equipment-memory-property' tabindex='0'></span>")
                .text(effect.label).attr({ tabindex: focusable === false ? null : 0, "data-tip-title": "Transient · " + effect.label,
                    "data-tip-body": effect.method + " memory for " + effect.family
                        + ". Stored: " + (effect.source_label || effect.label)
                        + ". Numeric values scale with current Shapeshifting. Lasts until its memory is overwritten."
                        + (effect.family === "Armour" ? " Body protection is applied once, independent of clothing." : "") }));
        });
        return root;
    }
    function slots(data, heroSlot) {
        var root = $("<ol class='assimilation-slots' aria-label='Stored properties, oldest marked for replacement'></ol>");
        data.slots.forEach(function (slot) {
            var memory = slot.memory, next = slot.next && slot.unlocked;
            var effects = memory && Array.isArray(memory.effects) ? memory.effects : memory ? [memory] : [];
            var label = memory ? effects.map(function (effect) { return effect.label; }).join(" · ") : slot.unlocked ? "Empty" : "XL " + slot.unlock_xl;
            var meta = memory ? memory.family : slot.unlocked ? "Ready to fill" : "Locked";
            var explanation = memory ? memory.method + " from " + memory.source + ". Applies to " + memory.family
                + ". All " + effects.length + " properties share this slot. Stored → applied: "
                + effects.map(function (effect) { return (effect.source_label || effect.label) + " → " + effect.label; }).join(", ")
                + ". The whole bundle lasts until overwritten."
                : slot.unlocked ? "The next completed digestion or Assimilation can fill this slot."
                : "Unlocks at experience level " + slot.unlock_xl + ".";
            if (memory && !slot.unlocked) { meta += " · inactive until XL " + slot.unlock_xl; explanation += " Inactive until XL " + slot.unlock_xl + "."; }
            if (next && memory) explanation += " This is the oldest memory and will be replaced next.";
            var row = $("<li class='assimilation-slot' tabindex='0'></li>")
                .attr({ id: "assimilation_slot_" + heroSlot + "_" + slot.slot,
                    "data-locked": String(!slot.unlocked), "data-next": String(next),
                    "data-tip-title": label + " · " + meta, "data-tip-body": explanation,
                    "aria-label": label + ". " + meta + ". " + explanation })
                .append($("<strong></strong>").text(label), $("<small></small>").text(meta));
            if (next) row.append($("<span class='assimilation-next'></span>").text(memory ? "Oldest → next" : "Next"));
            root.append(row);
        });
        return root;
    }
    return { properties: properties, slots: slots };
});
