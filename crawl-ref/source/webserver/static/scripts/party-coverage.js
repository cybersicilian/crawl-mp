/* Party coverage: role counts, damage types and short warnings from catalog data.
 * Pure functions; native starting values are only quoted when already loaded. */
(function (root, factory) {
    "use strict";
    if (typeof define === "function" && define.amd) define(["hero-roles"], factory);
    else if (typeof module === "object" && module.exports) module.exports = factory(require("./hero-roles"));
    else root.PartyCoverage = factory(root.HeroRoles);
}(typeof self !== "undefined" ? self : this, function (roles) {
    "use strict";
    var FRAGILE_CATEGORIES = { "Mage": true };
    function count(map, key) { map[key] = (map[key] || 0) + 1; }
    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
    /* heroes: [{ name, job: { name, category } | null, species: { name } | null,
     *           active: boolean, status: "ready" | "loading" | "error" | "unavailable", snapshot: { hp, ac, ev } | null }] */
    function summarize(heroes) {
        var active = (heroes || []).filter(function (hero) { return hero && hero.active && hero.job; });
        var roleCounts = {}, damageCounts = {}, warnings = [], names = {};
        roles.ORDER.forEach(function (key) { roleCounts[key] = 0; });
        Object.keys(roles.DAMAGE).forEach(function (key) { damageCounts[key] = 0; });
        active.forEach(function (hero) {
            var role = roles.roleForBackground(hero.job), damage = roles.damageForBackground(hero.job);
            count(roleCounts, role.key); names[role.key] = (names[role.key] || []).concat(hero.name || "Hero");
            if (damage) count(damageCounts, damage.key);
        });
        if (!active.length) {
            warnings.push({ key: "empty", level: "warn", text: "No active heroes. Open a seat or add a companion." });
            return { active: 0, roles: roleCounts, damage: damageCounts, warnings: warnings };
        }
        var casters = roleCounts.caster, frontline = roleCounts.frontline;
        if (!frontline)
            warnings.push({ key: "no-frontline", level: "warn", text: "No frontline. Nobody is built to hold the line." });
        if (casters >= 2 && !frontline)
            warnings.push({ key: "squishy-casters", level: "warn", text: plural(casters, "fragile caster") + " with no cover." });
        else if (casters >= 2 && casters >= active.length - 1 && active.length >= 3)
            warnings.push({ key: "caster-heavy", level: "note", text: plural(casters, "caster") + " share one shield wall." });
        if (!damageCounts.ranged && !damageCounts.magic)
            warnings.push({ key: "all-melee", level: "warn", text: "All melee. No ranged or magic answer to fliers and kiters." });
        else if (!damageCounts.melee && active.length >= 2)
            warnings.push({ key: "no-melee", level: "note", text: "No melee damage. Expect pressure up close." });
        roles.ORDER.forEach(function (key) {
            if (roleCounts[key] >= 3)
                warnings.push({ key: "stacked-" + key, level: "note", text: roleCounts[key] + " " + roles.ROLES[key].label + "s overlap." });
        });
        if (active.length === 1 && FRAGILE_CATEGORIES[active[0].job.category])
            warnings.push({ key: "solo-caster", level: "note", text: "A solo caster starts fragile. Consider a companion." });
        var loading = active.filter(function (hero) { return hero.status === "loading"; }).length;
        var ready = active.filter(function (hero) { return hero.status === "ready" && hero.snapshot; });
        if (loading)
            warnings.push({ key: "loading", level: "info", text: "Native starting values are still loading for " + plural(loading, "hero") + "." });
        else if (ready.length === active.length) {
            var lowest = ready.slice().sort(function (a, b) { return a.snapshot.hp - b.snapshot.hp; })[0];
            if (lowest && ready.length >= 2)
                warnings.push({ key: "lowest-hp", level: "info", text: "Lowest starting HP: " + lowest.snapshot.hp + " (" + lowest.name + ")." });
        }
        return { active: active.length, roles: roleCounts, damage: damageCounts, warnings: warnings, names: names };
    }
    return { summarize: summarize };
}));
