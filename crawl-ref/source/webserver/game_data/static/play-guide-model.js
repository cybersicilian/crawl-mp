/* Suggests a sensible next action. The engine still decides what is legal. */
define([], function () {
    "use strict";
    var threatWords = ["Harmless", "Easy", "Dangerous", "Deadly"];
    var actions = {
        explore: { label: "Explore", key: "o", code: 111, icon: "explore" },
        fight: { label: "Fight", key: "Tab", code: 9, icon: "autofight" },
        rest: { label: "Rest", key: "5", code: 53, icon: "rest" },
        pickup: { label: "Pick up", key: "g", code: 103, icon: "pickup" },
        down: { label: "Go downstairs", key: ">", code: 62, icon: "stairs-down" },
        up: { label: "Leave by the stairs", key: "<", code: 60, icon: "stairs-up" },
        memorise: { label: "Learn a spell", key: "M", code: 77, icon: "spells" },
        travel: { label: "Go to the stairs", key: "G", icon: "navigate" },
        quaff: { label: "Drink a potion", key: "q", icon: "potion" }
    };
    function share(value, max) { return Number.isFinite(value) && max > 0 ? value / max : 1; }
    function healing(hero) {
        return (hero.inventory || []).find(function (item) {
            return /potions? of (?:curing|heal wounds)/i.test(item.name || "");
        }) || null;
    }
    function step(id, reason, overrides) {
        return Object.assign({ id: id, reason: reason }, actions[id], overrides || {});
    }
    function threat(enemy) {
        return threatWords[enemy.threat] || "Unknown";
    }
    /* view: { hero, blocked, enemies: nearest-first, explored, stairsKnown } */
    function suggest(view) {
        var hero = view.hero, enemies = view.enemies || [], steps = [];
        if (!hero) return steps;
        if (view.blocked) return [{ id: "wait", label: "Waiting", reason: view.blocked, icon: "time" }];
        var health = share(hero.hp, hero.hp_max), items = hero.floor_items_known ? hero.floor_items || [] : [];
        var potion = healing(hero), nearest = enemies[0];
        if (nearest) {
            var count = enemies.length > 1 ? " and " + (enemies.length - 1) + " more" : "";
            var summary = threat(nearest) + " · " + nearest.name + count;
            if (health <= 0.4) {
                if (potion) steps.push(step("quaff", "You are badly hurt. " + potion.name + ".", { item: potion, tone: "danger" }));
                if (hero.stairs === "down") steps.push(step("down", "Stairs let you escape this fight.", { tone: "danger" }));
                if (hero.stairs === "up") steps.push(step("up", "Stairs let you escape this fight.", { tone: "danger" }));
            }
            var melee = nearest.distance <= 1 ? "Next to you. " : nearest.distance + " tiles away. ";
            steps.push(step("fight", melee + summary + ".", { tone: nearest.threat >= 2 || health <= 0.4 ? "danger" : "combat" }));
            return steps;
        }
        if (health < 0.65) steps.push(step("rest", "No enemies nearby. Recover HP " + hero.hp + "/" + hero.hp_max + ".", { tone: "calm" }));
        if (items.length) steps.push(step("pickup", items.length > 1 ? items.length + " items on this tile."
            : items[0].name + " is on this tile."));
        if (view.explored) {
            if (hero.stairs === "down") steps.push(step("down", "This floor is explored. Head deeper."));
            else if (view.stairsKnown) steps.push(step("travel", "This floor is explored. Walk to the stairs down."));
            else steps.push(step("explore", "Explored what you can reach. Try again after opening a path."));
        } else {
            steps.push(step("explore", "Walks the floor and stops when something appears."));
            if (hero.stairs === "down") steps.push(step("down", "You are on the stairs down."));
        }
        var library = hero.spell_library;
        if (library && library.memorisable > 0)
            steps.push(step("memorise", library.memorisable + " spell" + (library.memorisable > 1 ? "s" : "") + " ready to learn."));
        return steps.slice(0, 3);
    }
    return { suggest: suggest, healing: healing, threat: threat };
});
