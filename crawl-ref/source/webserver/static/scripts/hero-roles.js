/* Shared tactical role vocabulary for heroes, derived from the native background.
 * Lobby and in-game surfaces require this module so badges stay consistent.
 * AMD in the browser (`define(["hero-roles"], ...)` from /static/scripts or
 * /gamedata); CommonJS for node unit tests. No engine numbers live here. */
(function (root, factory) {
    "use strict";
    if (typeof define === "function" && define.amd) define([], factory);
    else if (typeof module === "object" && module.exports) module.exports = factory();
    else root.HeroRoles = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";
    var ROLES = {
        frontline: { key: "frontline", label: "Frontline", short: "FL", summary: "Holds the line and soaks hits." },
        striker: { key: "striker", label: "Striker", short: "ST", summary: "Deals burst damage from reach or ambush." },
        caster: { key: "caster", label: "Caster", short: "CA", summary: "Blasts and controls with spells; fragile early." },
        support: { key: "support", label: "Support", short: "SU", summary: "Hexes, buffs and healing for the party." },
        scout: { key: "scout", label: "Scout", short: "SC", summary: "Stealth, speed and tricks; avoids fair fights." },
        unknown: { key: "unknown", label: "Hero", short: "?", summary: "Role unknown until a background is chosen." }
    };
    Object.keys(ROLES).forEach(function (key) { ROLES[key].name = ROLES[key].label; });
    var DAMAGE = { melee: "Melee", ranged: "Ranged", magic: "Magic" };
    // Explicit mapping by background name; the catalog category is the fallback.
    var BY_NAME = {
        "Fighter": ["frontline", "melee"], "Gladiator": ["frontline", "melee"], "Berserker": ["frontline", "melee"],
        "Monk": ["frontline", "melee"], "Paladin": ["frontline", "melee"], "Death Knight": ["frontline", "melee"],
        "Abyssal Knight": ["frontline", "melee"], "Chaos Knight": ["frontline", "melee"], "Ronin": ["frontline", "melee"],
        "Fencer": ["striker", "melee"], "Reaver": ["striker", "melee"], "Slime Priest": ["frontline", "melee"],
        "Neckbeard": ["frontline", "melee"], "Cinder Acolyte": ["striker", "magic"], "Blood Liturgist": ["support", "magic"],
        "Hunter": ["striker", "ranged"], "Brigand": ["striker", "ranged"], "Hexslinger": ["striker", "ranged"],
        "Stalker": ["scout", "melee"], "Rogue": ["scout", "melee"], "Delver": ["scout", "melee"],
        "Archaeologist": ["scout", "melee"], "Apothecary": ["support", "ranged"],
        "Conjurer": ["caster", "magic"], "Fire Elementalist": ["caster", "magic"], "Ice Elementalist": ["caster", "magic"],
        "Air Elementalist": ["caster", "magic"], "Earth Elementalist": ["caster", "magic"], "Necromancer": ["caster", "magic"],
        "Summoner": ["caster", "magic"], "Alchemist": ["caster", "magic"], "Hedge Wizard": ["caster", "magic"],
        "Forgewright": ["caster", "magic"], "Mystic": ["caster", "magic"],
        "Enchanter": ["support", "magic"], "Skald": ["support", "melee"], "Warper": ["support", "ranged"],
        "Healer": ["support", "melee"], "Preacher": ["support", "magic"], "Sage": ["support", "magic"],
        "Shapeshifter": ["striker", "melee"], "Jester": ["support", "ranged"], "Hermit": ["support", "melee"],
        "Wanderer": ["scout", "melee"], "Artificer": ["striker", "ranged"], "Billionaire": ["support", "ranged"],
        "Philosopher": ["support", "magic"]
    };
    var BY_CATEGORY = {
        "Warrior": ["frontline", "melee"], "Zealot": ["frontline", "melee"], "Mage": ["caster", "magic"],
        "Warrior-mage": ["support", "magic"], "Metamorph": ["striker", "melee"], "Adventurer": ["scout", "melee"]
    };
    function lookup(name, category) {
        return BY_NAME[name] || BY_CATEGORY[category] || null;
    }
    /* roleForBackground("Fighter") -> { key: "frontline", label: "Frontline", short, summary }.
     * Accepts a background name or a catalog job record ({ name, category }). */
    function roleForBackground(background) {
        var name = background && typeof background === "object" ? background.name : background;
        var category = background && typeof background === "object" ? background.category : undefined;
        var entry = lookup(name, category);
        return entry ? ROLES[entry[0]] : ROLES.unknown;
    }
    /* damageForBackground("Hunter") -> { key: "ranged", label: "Ranged" }; null when unknown. */
    function damageForBackground(background) {
        var name = background && typeof background === "object" ? background.name : background;
        var category = background && typeof background === "object" ? background.category : undefined;
        var entry = lookup(name, category);
        return entry ? { key: entry[1], label: DAMAGE[entry[1]] } : null;
    }
    /* Class list for a badge element: shared design-system classes plus a local fallback. */
    function badgeClasses(roleKey) {
        var key = ROLES[roleKey] ? roleKey : "unknown";
        return "party-role-badge tr-badge tr-badge-role tr-badge-" + key;
    }
    return {
        ROLES: ROLES, ORDER: ["frontline", "striker", "caster", "support", "scout"],
        DAMAGE: DAMAGE, roleForBackground: roleForBackground, damageForBackground: damageForBackground,
        role: roleForBackground, badgeClasses: badgeClasses
    };
}));
