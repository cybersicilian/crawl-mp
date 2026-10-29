/* Adapt native descriptions to the same accessible rich-tip contract as the game. */
define(["spell-cost"], function (spellCost) {
    "use strict";
    function attach(row, name, kind, description, details) {
        row.tabIndex = 0;
        row.classList.add("starting-entry-row");
        row.dataset.nativeTooltip = "true";
        row.dataset.startingEntry = kind.toLowerCase();
        row.dataset.entryName = name;
        row.setAttribute("data-tip-title", name);
        row.setAttribute("data-tip-badge", kind);
        row.setAttribute("data-tip-body", description || "The native description is unavailable for this entry.");
        row.setAttribute("data-tip-meta", details.filter(Boolean).join(" · "));
    }
    function equipment(row, item) {
        attach(row, item.name, "Equipment", item.description, [item.equipped ? "Equipped" : "Carried", "Native starting equipment"]);
    }
    function spell(row, name, detail, memorized) {
        detail = detail || {};
        var parts = [memorized ? "Memorized" : "In library · Not memorized"];
        if (Number.isFinite(detail.level)) parts.push("Level " + detail.level);
        if (spellCost.cost(detail)) parts.push(spellCost.format(detail));
        if (detail.schools) parts.push(detail.schools);
        if (detail.power) parts.push("Power: " + detail.power);
        if (detail.fail) parts.push("Fail: " + detail.fail);
        if (detail.damage) parts.push("Damage: " + detail.damage);
        if (detail.range) parts.push("Range: " + detail.range);
        attach(row, name, "Spell", detail.description, parts);
    }
    function skill(row, name, level, detail) {
        detail = detail || {};
        var aptitude = Number.isFinite(detail.aptitude) ? "Aptitude " + (detail.aptitude > 0 ? "+" : "") + detail.aptitude : "";
        attach(row, name, "Skill", detail.description, ["Level " + level, aptitude, "Native starting skill"]);
    }
    return { equipment: equipment, spell: spell, skill: skill };
});
