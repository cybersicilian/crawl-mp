/* Which authored tip fits this moment. No DOM, sockets or clocks, so it stays testable.
   A rule reads a plain view of the hero; the catalog order is the fallback priority.
   A tip with "during" appears in that input mode, otherwise only during normal play. */
define([], function () {
    "use strict";
    var pace = { often: 30000, normal: 60000, rarely: 150000 };
    var hold = { short: 10000, medium: 20000, long: 45000, manual: 0 };
    // Engine message text that marks a moment no state field shows. The test suite checks
    // each of these still matches what the native source prints.
    var signals = [["stat", /Increase \(s\)trength/i], ["miscast", /^You miscast /],
        ["unseen", /^Something [a-z]+ you\b/], ["malevolence", /horrendous wail|spontaneously manifests/]];
    function calm(view) { return !view.enemies.length; }
    function carrying(view, pattern) {
        return view.inventory.some(function (item) { return pattern.test(item.kind_name || ""); });
    }
    function spare(view, pattern) {
        return view.inventory.some(function (item) { return !item.equipped && pattern.test(item.kind_name || ""); });
    }
    function status(view, pattern) {
        return view.statuses.some(function (text) { return pattern.test(text); });
    }
    function after(turns, rule) {
        return function (view) { return calm(view) && view.turns >= turns && (!rule || rule(view)); };
    }
    function near(kind) { return function (view) { return calm(view) && view.features[kind]; }; }
    var rules = {
        retreat: function (view) { return view.health <= 0.4 && !calm(view); },
        poison: function (view) { return status(view, /^(?:(?:mildly|quite|seriously|lethally) )?pois/i); },
        burning: function (view) { return status(view, /^(?:on fire|fire)$/i); },
        caught: function (view) { return status(view, /^held$/i); },
        confused: function (view) { return status(view, /^(?:confused|conf)$/i); },
        targeting: function () { return true; },
        stat_choice: function (view) { return view.signals.stat === true; },
        downed: function () { return true; },
        teammate_down: function (view) { return view.teammateDown; },
        move: function (view) { return calm(view) && view.turns <= 3; },
        combat: function (view) { return !calm(view) && view.combat; },
        inspect: function (view) { return view.enemies.some(function (enemy) { return enemy.threat >= 2; }); },
        fight: function (view) { return !calm(view); },
        plan: function (view) { return !calm(view) && view.combat && view.turns >= 30; },
        low_magic: function (view) { return !calm(view) && view.resource === "mp" && view.spells > 0 && view.magic <= 0.25; },
        step_away: function (view) { return view.health < 0.65 && view.enemies.some(function (enemy) { return enemy.distance <= 1; }); },
        invisible: function (view) { return view.signals.unseen === true; },
        status: function (view) { return view.badStatuses > 0; },
        contam: function (view) { return status(view, /^contam/i); },
        miscast: function (view) { return view.signals.miscast === true; },
        malevolence: function (view) { return view.signals.malevolence === true; },
        ally: function (view) { return view.allies > 0; },
        harmless: function (view) { return view.harmless > 0; },
        cloud: function (view) { return view.clouds > 0; },
        rest: function (view) { return calm(view) && view.health < 0.65; },
        pickup: function (view) { return calm(view) && view.floorItems > 0; },
        explore: function (view) { return calm(view) && !view.explored; },
        stairs: function (view) { return calm(view) && view.explored; },
        floor_item: function (view) { return calm(view) && view.items > 0; },
        equip: function (view) { return calm(view) && spare(view, /weapon|armour|staves/i); },
        potion: function (view) { return calm(view) && carrying(view, /potion/i); },
        scroll: function (view) { return calm(view) && carrying(view, /scroll/i); },
        wand: function (view) { return calm(view) && carrying(view, /wand/i); },
        jewellery: function (view) { return calm(view) && spare(view, /jewellery/i); },
        talisman: function (view) { return calm(view) && spare(view, /talisman/i); },
        missile: function (view) { return calm(view) && carrying(view, /missile/i); },
        // Books never reach the pack: picking one up adds its spells to the library.
        book: function (view) { return calm(view) && view.library > 0; },
        evoke: function (view) { return calm(view) && carrying(view, /miscellaneous|bauble/i); },
        skills: function (view) { return calm(view) && view.level >= 2 && view.canTrain; },
        spells: function (view) { return calm(view) && view.spells > 0; },
        memorise: function (view) { return calm(view) && view.memorisable > 0; },
        heat: function (view) { return calm(view) && view.resource === "heat"; },
        altar: near("altar"),
        door: near("door"),
        runed_door: near("runed_door"),
        hatch: near("hatch"),
        branch: near("branch"),
        portal: near("portal"),
        shop: near("shop"),
        trap: near("trap"),
        web: near("web"),
        water: near("water"),
        god: function (view) { return calm(view) && view.god !== ""; },
        penance: function (view) { return calm(view) && view.penance; },
        abilities: after(20, function (view) { return view.abilities > 0; }),
        resists: after(40, function (view) { return view.resists; }),
        mutation: after(30, function (view) { return view.mutations > 0; }),
        banes: function (view) { return calm(view) && view.banes > 0; },
        gold: function (view) { return calm(view) && view.gold > 0; },
        rune: function (view) { return calm(view) && view.runes > 0; },
        gem: function (view) { return calm(view) && view.gems > 0; },
        orb: function (view) { return carrying(view, /orbs of power/i); },
        zot: function (view) { return calm(view) && view.zot >= 0.5; },
        abyss: function (view) { return /^abyss/i.test(view.place); },
        party: function (view) { return calm(view) && view.multiplayer; },
        chat: after(10, function (view) { return view.multiplayer; }),
        trade: after(30, function (view) { return view.canTrade; }),
        floors: function (view) { return view.teammateAway; },
        switch_hero: function (view) { return calm(view) && view.party > 1 && !view.multiplayer; },
        ai_teammate: function (view) { return calm(view) && view.aiTeammate; },
        attack_info: function (view) { return calm(view) && view.kills >= 1; },
        full_pack: function (view) { return calm(view) && view.inventory.length >= 48; },
        help: after(60),
        noise: after(100),
        map: after(120),
        run: after(150),
        save: after(180),
        quick: after(220),
        zoom: after(260),
        history: after(320),
        find: after(400),
        arrange: after(500),
        exclusion: after(650, function (view) { return view.canExclude; })
    };
    /* Unseen tips that fit now, in catalog order. Urgent tips are always first in the catalog. */
    function eligible(catalog, view, seen, level) {
        if (level === "off") return [];
        return catalog.filter(function (tip) {
            return !seen[tip.id] && (level !== "essential" || tip.level === "essential")
                && (tip.during || "play") === view.mode && rules[tip.id] && rules[tip.id](view);
        });
    }
    /* What a native feature name means for a tip, from the names in feature-data.h. */
    function classify(name) {
        if (/\bdetected\b|\babandoned\b|golubria/i.test(name)) return null;
        if (/\baltar\b/i.test(name)) return "altar";
        if (/\bshop\b/i.test(name)) return "shop";
        if (/\bruned\b.*\bdoor\b/i.test(name)) return "runed_door";
        if (/\bclosed\b.*\bdoor\b/i.test(name)) return "door";
        if (/escape hatch/i.test(name)) return "hatch";
        if (/\bweb\b/i.test(name)) return "web";
        if (/\btrap\b|\bshaft\b|pressure plate/i.test(name)) return "trap";
        if (/shallow water/i.test(name)) return "water";
        if (/\b(?:out of|back to|back out|exit through)\b/i.test(name)) return null;
        if (/\b(?:staircase|hole|tunnel|opening|passage|gate|gateway) to (?:the|Hell)\b/i.test(name)) return "branch";
        if (/\b(?:gate|gateway|portal|passage|archway|drain|tunnel|forge-door)\b|sand-covered staircase|labyrinth/i.test(name)
            && !/\bmalign\b|to somewhere|another region/i.test(name)) return "portal";
        return null;
    }
    function signal(text) {
        var plain = text.replace(/<[^>]*>/g, "").trim();
        var found = signals.find(function (entry) { return entry[1].test(plain); });
        return found ? found[0] : null;
    }
    /* Tips a pressed key has already taught; a player who found the key needs no lesson. */
    function practiced(catalog, key) {
        return catalog.filter(function (tip) { return (tip.keys || []).indexOf(key) !== -1; });
    }
    /* The fixed shape tip_advisor.py accepts. Names of people never go in this. */
    function context(view) {
        return { health: view.health, magic: view.magic, level: view.level, turns: view.turns, place: view.place,
            species: view.species, background: view.background, god: view.god, explored: view.explored,
            in_party: view.multiplayer, on_stairs: view.stairs, statuses: view.statuses,
            enemies: view.enemies.map(function (enemy) {
                return { name: enemy.name, threat: enemy.threat, distance: enemy.distance };
            }) };
    }
    /* Backticks mark key caps; text stays text so no catalog string reaches innerHTML. */
    function segments(body) {
        return body.split("`").map(function (text, index) {
            return { text: text, key: index % 2 === 1 };
        }).filter(function (part) { return part.text; });
    }
    return { rules: rules, eligible: eligible, classify: classify, signal: signal, practiced: practiced,
        context: context, segments: segments, signals: signals,
        gap: function (value) { return pace[value] || pace.normal; },
        lifetime: function (value) { return value in hold ? hold[value] : hold.medium; } };
});
