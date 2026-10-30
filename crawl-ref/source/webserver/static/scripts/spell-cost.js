/* Native casting costs shared by starting sheets, folios and combat controls. */
define([], function () {
    "use strict";
    function cost(entry) {
        // Older snapshots only supplied the MP cost. Never infer HP casting
        // from an empty mana pool or a species name.
        var value = entry.casting_cost === undefined
            ? { resource: "mp", amount: entry.mp_cost } : entry.casting_cost;
        return value && ["hp", "mp"].includes(value.resource)
            && Number.isFinite(value.amount) && value.amount >= 0 ? value : null;
    }
    function format(entry) {
        var value = cost(entry);
        return value ? value.amount + " " + value.resource.toUpperCase() : "Unavailable";
    }
    function resource(member) {
        if (["hp", "mp"].includes(member.spell_resource)) return member.spell_resource;
        var first = (member.spells || []).map(cost).find(Boolean);
        return first ? first.resource : "mp";
    }
    function reason(member, entry) {
        var value = cost(entry);
        if (!value) return "Spell cost information unavailable.";
        var health = value.resource === "hp", available = member[value.resource];
        if (!Number.isFinite(available)) return health ? "Health information unavailable." : "Magic point information unavailable.";
        if (health ? value.amount >= available : value.amount > available)
            return health ? "Not enough health; casting must leave at least 1 HP." : "Not enough magic points.";
        if (value.payable === false) return "Cannot pay this spell's " + value.resource.toUpperCase() + " cost right now.";
        return "";
    }
    return { cost: cost, format: format, resource: resource, reason: reason };
});
