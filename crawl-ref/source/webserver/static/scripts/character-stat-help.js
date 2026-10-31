/* Shared rules explanations for native HUDs, starting sheets and comparisons. */
define(function () {
    "use strict";
    var stats = {
        hp: { label: "HP", title: "Health (HP)", badge: "Vital", body: "Your life force. If HP drops to 0, you die (or become a haunting ghost in Co-op Party mode, reviving when an ally descends stairs)." },
        mp: { label: "MP", title: "Magic Points (MP)", badge: "Vital", body: "Arcane and divine energy used to cast spells ('z') and invoke abilities ('a'). Max MP scales with Spellcasting, Invocations, and Evocations." },
        ac: { label: "AC", title: "Armour Class (AC)", badge: "Defense", body: "Mitigates physical damage from attacks via a 0..AC random reduction roll plus guaranteed percentage shaving. Increased by worn armour, Armour skill, and Strength." },
        ev: { label: "EV", title: "Evasion (EV)", badge: "Defense", body: "Chance to completely dodge melee blows, ranged projectiles, and bolt spells. Increased by Dodging skill and Dexterity; reduced by heavy armour encumbrance." },
        sh: { label: "SH", title: "Shields (SH)", badge: "Defense", body: "Chance to block physical attacks and projectiles before EV or AC are checked. Requires an equipped shield or magical barrier and scales with Shields skill & Dexterity." },
        str: { label: "STR", title: "Strength (Str)", badge: "Attribute", body: "Increases melee and ranged weapon damage and reduces the EV and spellcasting encumbrance penalties from wearing heavier body armour and shields." },
        int: { label: "INT", title: "Intelligence (Int)", badge: "Attribute", body: "Increases magical spell power and lowers spellcasting failure rates across all spell schools." },
        dex: { label: "DEX", title: "Dexterity (Dex)", badge: "Attribute", body: "Boosts Evasion (EV), Shield blocking (SH), Stealth effectiveness, and accuracy with melee and ranged weapons." }
    };
    var resistances = [
        { key: "rFire", start: "rF", label: "Fire", title: "rFire (Fire Resistance)", icon: "fire", max: 3, body: "Reduces damage from fire, steam, and fiery blasts (up to 3 pips)." },
        { key: "rCold", start: "rC", label: "Cold", title: "rCold (Cold Resistance)", icon: "cold", max: 3, body: "Reduces damage from ice, frost, and freezing attacks (up to 3 pips)." },
        { key: "rElec", start: "rElec", label: "Lightning", title: "rElec (Electricity)", icon: "electricity", max: 1, bool: true, body: "Ordinary resistance reduces lightning damage by two-thirds. Full immunity prevents electrical damage." },
        { key: "rPois", start: "rPois", label: "Poison", title: "rPois (Poison)", icon: "poison", max: 1, body: "Protects against poison and venom; Gargoyles possess complete poison immunity." },
        { key: "rNeg", start: "rN", label: "Negative energy", title: "rNeg (Life Protection)", icon: "life", max: 3, body: "Protects against negative energy, draining, and torment side-effects." },
        { key: "rCorr", start: "rCorr", label: "Acid", title: "rCorr (Corrosion)", icon: "corrosion", max: 1, bool: true, body: "Resists acid damage and equipment corrosion." },
        { key: "Will", start: "Will", label: "Willpower", title: "Willpower (Will)", icon: "will", max: 5, body: "Resists hexes, paralysis, confusion, banishment, and mental enchantments. Each icon represents 40 willpower, up to five icons; the exact rating is in the tooltip." },
        { key: "Stlth", label: "Stealth", title: "Stealth (Stlth)", icon: "stealth", max: 10, body: "Reduces the chance that sleeping or wandering monsters notice you. Each icon represents 50 stealth, rounded up, to a maximum of ten icons; the exact rating is in the tooltip." },
        { key: "SeeInvis", start: "See invisible", label: "See invisible", title: "See Invisible (sInv)", icon: "see-invisible", max: 1, bool: true, body: "Allows perceiving invisible monsters without penalties." },
        { key: "Fly", label: "Flight", title: "Flight (Fly)", icon: "flight", max: 1, bool: true, body: "Allows crossing deep water and lava and evading ground traps." }
    ];
    function levels(definition, value) {
        if (typeof value === "boolean") value = Number(value);
        if (!Number.isFinite(value)) return null;
        // Match native output.cc scales; elemental defenses already arrive as levels.
        if (definition.key === "Will")
            return Math.sign(value) * Math.min(definition.max, Math.floor(Math.abs(value) / 40));
        if (definition.key === "Stlth")
            return Math.min(definition.max, Math.ceil(Math.max(0, value) / 50));
        return value;
    }
    function explain(node, definition, value, context) {
        node.tabIndex = 0;
        node.setAttribute("data-tip-title", definition.title + (value === undefined ? "" : ": " + value));
        node.setAttribute("data-tip-body", definition.body);
        node.setAttribute("data-tip-badge", definition.badge || "Resistance");
        node.setAttribute("data-tip-meta", context || "Native starting value · Before temporary effects");
        return node;
    }
    return { stats: stats, combat: ["hp", "mp", "ac", "ev", "sh"], resistances: resistances, levels: levels, explain: explain };
});
