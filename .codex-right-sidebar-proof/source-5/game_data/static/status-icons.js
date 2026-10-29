define(["item-properties"], function (properties) {
    "use strict";

    var rules = [
        [/poison|rpois|toxic|venom/i, "poison"],
        [/burn|fire|rfire|flam|sticky/i, "flame"],
        [/cold|frost|rcold|frozen|ice/i, "frost"],
        [/elec|lightning|shock/i, "bolt"],
        [/confus|daze|vertigo/i, "confusion"],
        [/silenc/i, "silence"],
        [/paraly|petrif|constrict|held|bound|mesmer/i, "chain"],
        [/contamin|glow|vulnerab|frail/i, "danger"],
        [/see.?invis|sinv|blind/i, "eye"],
        [/corro|acid/i, "corrosion"],
        [/negative energy|life protection/i, "skull"],
        [/strength|\bstr\b/i, "strength"],
        [/intelligence|\bint\b/i, "intelligence"],
        [/dexterity|\bdex\b/i, "dexterity"],
        [/haste|fast|speed|swift/i, "speed"],
        [/slow|recov|exhaust/i, "slow"],
        [/fly|flying|flight/i, "wing"],
        [/invis|stealth|shadow|umbra/i, "moon"],
        [/might|berserk|slay/i, "blade"],
        [/shield|protect|resist|armour|will|ward|\bmr\b/i, "shield"],
        [/regen|heal|vital/i, "heart"],
        [/ghost|dead|drain|haunt|doom/i, "skull"],
        [/spell|magic|mana|mp\b/i, "spark"],
        [/trait|mutat|innate/i, "trait"],
        [/ready/i, "ready"]
    ];

    function resolve(label) {
        var property = properties.describe(label);
        if (property.kind !== "unknown") return property.icon;
        for (var i = 0; i < rules.length; i++)
            if (rules[i][0].test(label)) return rules[i][1];
        return "rune";
    }

    function decorate(root) {
        if (!root) return;
        root.querySelectorAll(".party-buff-pill, .status_light").forEach(function (el) {
            var name = resolve(el.getAttribute("data-tip-title") || el.textContent);
            if (el.getAttribute("data-status-icon") === name && el.querySelector(".tt-icon")) return;
            var old = el.querySelector(".tt-icon");
            if (old) old.remove();
            el.setAttribute("data-status-icon", name);
            el.insertBefore(properties.icon(name), el.firstChild);
        });
    }

    return { icon: properties.icon, resolve: resolve, decorate: decorate,
        names: properties.iconNames, has: properties.hasIcon };
});
