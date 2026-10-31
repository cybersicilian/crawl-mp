define(["./party-model", "spell-cost"], function (model, spellCost) {
    "use strict";

    // Adapt native power snapshots to the shared rich-tooltip contract.
    function attach($row, entry, kind)
    {
        var details = kind === "Spell"
            ? ["Level " + model.display(entry.level), "Cost: " + spellCost.format(entry), model.display(entry.schools),
                "Power: " + model.display(entry.power)]
            : [entry.is_god ? "Divine invocation" : "Innate ability",
                "Cost: " + model.display(entry.cost)];
        details.push("Fail: " + model.percentage(entry.fail));
        return $row.addClass("party-power-row").attr({
            tabindex: 0,
            "data-tip-title": entry.name || kind,
            "data-tip-badge": kind,
            "data-tip-body": entry.desc || entry.description ||
                "No description is available for this " + kind.toLowerCase() + ".",
            "data-tip-meta": details.join(" · ")
        });
    }

    return { attach: attach };
});
