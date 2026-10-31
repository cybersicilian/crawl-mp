/* Native casting costs shared by starting sheets, folios and combat controls. */
define([], function () {
    "use strict";
    function cost(entry) {
        // Older snapshots only supplied the MP cost. Never infer HP casting
        // from an empty mana pool or a species name.
        var value = entry.casting_cost === undefined
            ? { resource: "mp", amount: entry.mp_cost } : entry.casting_cost;
        return value && ["hp", "mp", "heat"].includes(value.resource)
            && Number.isFinite(value.amount) && value.amount >= 0
            && (value.additional_hp === undefined
                || Number.isFinite(value.additional_hp) && value.additional_hp >= 0)
            ? value : null;
    }
    function format(entry) {
        var value = cost(entry);
        if (!value) return "Unavailable";
        var result = value.amount + " " + value.resource.toUpperCase();
        return value.additional_hp ? result + " + " + value.additional_hp + " HP" : result;
    }
    function resource(member) {
        if (["hp", "mp", "heat"].includes(member.spell_resource)) return member.spell_resource;
        var first = (member.spells || []).map(cost).find(Boolean);
        return first ? first.resource : "mp";
    }
    function reason(member, entry) {
        var value = cost(entry);
        if (!value) return "Spell cost information unavailable.";
        var health = value.resource === "hp", heat = value.resource === "heat";
        var available = member[heat ? "mp" : value.resource];
        if (!Number.isFinite(available)) return health ? "Health information unavailable." : heat ? "Heat capacity information unavailable." : "Magic point information unavailable.";
        if (health ? value.amount >= available : value.amount > available)
            return health ? "Not enough health; casting must leave at least 1 HP." : heat ? "Not enough heat capacity." : "Not enough magic points.";
        if (value.additional_hp) {
            if (!Number.isFinite(member.hp)) return "Health information unavailable.";
            var totalHealth = value.additional_hp + (health ? value.amount : 0);
            if (totalHealth >= member.hp)
                return "Not enough health; casting must leave at least 1 HP.";
        }
        if (value.payable === false) return "Cannot pay this spell's " + value.resource.toUpperCase() + " cost right now.";
        return "";
    }
    return { cost: cost, format: format, resource: resource, reason: reason };
});
