define([], function () {
    "use strict";

    // Explicit native names only: resistances, cooldowns and prose mentions do
    // not imply an active effect. Shared by portraits and health bars.
    var treatments = [
        { kind: "petrify", pattern: /^(?:petrified|petrifying|stone|petr)$/i },
        { kind: "burning", pattern: /^(?:on fire|fire)$/i },
        { kind: "berserk", pattern: /^(?:berserk|berserking|bearserk)$/i },
        { kind: "poison", pattern: /^(?:(?:(?:mildly|quite|seriously|lethally) )?poisoned(?: \([^)]*\))?|pois)$/i },
        { kind: "frozen", pattern: /^frozen$/i },
        { kind: "confused", pattern: /^(?:confused|conf)$/i },
        { kind: "slow", pattern: /^(?:slowed|slow|hasted and slowed|fast\+slow)$/i },
        { kind: "haste", pattern: /^(?:hasted|haste|fast|hasted and slowed|fast\+slow)$/i },
        { kind: "invisible", pattern: /^(?:invisible|invis)$/i },
        { kind: "barbs", pattern: /^(?:spiked|barbs|barbed spikes)$/i },
        { kind: "flayed", pattern: /^(?:flayed|flay)$/i },
        { kind: "death-door", pattern: /^(?:in death's door|death'?s door|ddoor)$/i },
        { kind: "no-regen", pattern: /^(?:sick|inhibited regen|-regen)$/i },
        { kind: "regen", pattern: /^(?:regenerating|regen(?: \(\d+\))?|elixired|elixir)$/i }
    ];

    // Project native facts without guessing a healthy state from absent data.
    function effects(member) {
        if (member.statuses_known === false || !Array.isArray(member.statuses))
            return [{ key: "unknown", name: "Status information unavailable", tone: "unknown", description: "Active effects have not been reported." }];
        return member.statuses.map(function (status, index) {
            var tone = status.is_bad === true ? "bad" : status.is_bad === false ? "active" : "unknown";
            return { key: status.id === undefined ? index : status.id,
                name: status.text || status.light || "Unnamed effect", tone: tone,
                description: status.desc || "Native active status effect.",
                // tileweb.cc sends ceil(duration / 10), in standard turns.
                duration: Number.isFinite(status.dur) && status.dur > 0 ? status.dur : null,
                expiring: /\bexpiring\b/i.test(status.text || "") };
        }).sort(function (a, b) { return Number(b.tone === "bad") - Number(a.tone === "bad"); });
    }
    function visualEffects(member) {
        var facts = effects(member), matches = [];
        treatments.forEach(function (treatment) {
            var effect = facts.find(function (fact) {
                return treatment.pattern.test(fact.name.replace(/\s*\(expiring\)\s*$/i, "").trim());
            });
            if (effect) matches.push(Object.assign({ kind: treatment.kind }, effect));
        });
        return matches;
    }
    function health(member) {
        var known = Number.isFinite(member.hp) && Number.isFinite(member.hp_max) && member.hp_max > 0;
        var hp = known ? Math.max(0, Math.min(member.hp_max, member.hp)) : 0;
        var capacity = known ? Math.max(member.hp_max, Number.isFinite(member.real_hp_max) ? member.real_hp_max : 0) : 0;
        var forecast = known && Number.isFinite(member.poison_survival)
            ? Math.max(0, Math.min(hp, member.poison_survival)) : null;
        var loss = forecast === null ? 0 : hp - forecast;
        var active = visualEffects(member).filter(function (effect) {
            return /^(poison|burning|berserk|barbs|flayed|death-door|no-regen|regen)$/.test(effect.kind);
        });
        if (loss > 0 && !active.some(function (effect) { return effect.kind === "poison"; }))
            active.push({ kind: "poison", name: "Poisoned" });
        var summary = known ? "Current HP: " + member.hp + " / " + member.hp_max + "." : "Health information unavailable.";
        if (loss > 0) summary += "\nPoison forecast: " + loss + " HP at risk; projected minimum " + forecast
            + " HP with current regeneration." + (forecast === 0 ? " Potentially lethal poison!" : "");
        else if (active.some(function (effect) { return effect.kind === "poison"; }) && forecast === null)
            summary += "\nPoison damage forecast unavailable.";
        if (known && capacity > member.hp_max)
            summary += "\nMaximum HP reduced from " + capacity + " to " + member.hp_max + ". Hatched capacity is unavailable.";
        if (active.length) summary += "\nActive health effects: " + active.map(function (effect) { return effect.name; }).join(", ") + ".";
        function percent(value) { return capacity > 0 ? 100 * value / capacity : 0; }
        return { known: known, hp: hp, maximum: known ? member.hp_max : null,
            percent: known ? 100 * hp / member.hp_max : 0, fill: percent(hp - loss),
            poison: percent(loss), current: percent(hp), capacity: percent(known ? member.hp_max : 0),
            drained: percent(known ? capacity - member.hp_max : 0), forecast: forecast,
            lethal: loss > 0 && forecast === 0, effects: active, summary: summary };
    }
    function faith(member) {
        var god = member.god, known = typeof god === "string";
        var worships = known && Boolean(god) && god !== "No God";
        var special = god === "Xom" ? "xom" : god === "Gozag" ? "gold" : "piety";
        var rank = worships && special === "piety" && Number.isInteger(member.piety_rank)
            && member.piety_rank >= 0 && member.piety_rank <= 6 ? member.piety_rank : null;
        var penance = worships && Number.isFinite(member.penance) ? member.penance > 0 : null;
        var relation = member.god_relation;
        var standing = /^(Shared Covenant|Allied Concordat)$/.test(relation) ? "allied"
            : /^(Rival|Anathema)$/.test(relation) ? "rival" : "none";
        var favor = !known ? "Faith information unavailable." : !worships ? "No deity."
            : special === "gold" ? "Gozag uses gold rather than piety stars."
            : special === "xom" ? "Xom's mood is volatile; ordinary piety stars do not apply."
            : rank === null ? "Favor information unavailable." : "Favor: " + rank + " of 6 stars.";
        if (worships && penance === null) favor += " Penance information unavailable.";
        if (penance) favor += " Under penance.";
        if (worships && relation && relation !== "None" && relation !== "Unaligned") favor += " " + relation + ".";
        var name = !known ? "Faith unavailable" : worships ? god : "No deity";
        var altar = worships ? "DNGN_ALTAR_" + god.replace(/^the /i, "").replace(/^Jiyva\b.*/, "Jiyva")
            .replace(/[^A-Za-z]+/g, "_").toUpperCase() : null;
        return { name: name, known: known, worships: worships, altar: altar, rank: rank,
            kind: special, penance: penance, standing: standing, summary: favor,
            description: [member.faith_description, worships && member.god_politics].filter(Boolean).join("\n") };
    }
    function activity(member, state) {
        if (member.alive === false || member.ghost_haunting) return { label: "Downed", tone: "bad" };
        if (member.on_same_level === false) return { label: member.place || "Elsewhere", tone: "away" };
        if (typeof member.alive !== "boolean") return { label: "Unavailable", tone: "unknown" };
        var combat = state.multiplayer && typeof member.region_combat === "boolean"
            ? member.region_combat : state.combat_locked;
        if (state.multiplayer && combat)
            return { label: member.can_act === false ? "Recovering" : "Ready", tone: "combat" };
        if (combat) return { label: member.slot === state.active_slot ? "Acting"
            : state.simultaneous_turns ? "In combat" : "Waiting", tone: "combat" };
        return { label: "Exploring", tone: "ready" };
    }
    return { effects: effects, visualEffects: visualEffects, health: health, faith: faith, activity: activity };
});
