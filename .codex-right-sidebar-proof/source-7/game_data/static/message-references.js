define(["jquery", "./map_knowledge", "./tooltip-glossary"], function ($, knowledge, glossary) {
    "use strict";
    // Cache only knowledge already delivered to this client. No hidden bestiary facts.
    var entries = new Map(), limit = 400, dirty = false;
    function remember(title, body, badge, aliases) {
        if (!title || !body) return;
        var id = "known:" + badge + ":" + title.toLowerCase();
        var previous = entries.get(id);
        if (previous && previous.body === body) return;
        dirty = true;
        entries.set(id, { id: id, title: title, body: body, badge: badge,
            aliases: (aliases || [title]).filter(Boolean).map(function (name) { return name.replace(/^(?:the|an?) /i, ""); }) });
        if (entries.size > limit) entries.delete(entries.keys().next().value);
    }
    function mapChanged(event, cells) {
        (cells || []).forEach(function (pos) {
            var cell = knowledge.get(pos.x, pos.y), mon = cell.mon;
            if (mon && mon.name) {
                var threat = ["Trivial threat", "Easy threat", "Dangerous threat", "Extremely dangerous"];
                var body = mon.att > 0 ? "Friendly or neutral creature." : threat[mon.threat] || "An encountered creature.";
                if (mon.typedata && mon.typedata.avghp) body += "\nTypical health: " + mon.typedata.avghp + " HP (species average).";
                body += "\nRecorded from an encounter. Current health and position may have changed.";
                remember(mon.name, body, "Creature", [mon.name, mon.plural]);
            }
            if (cell.item_name) remember(cell.item_name, cell.item_description || "An item seen in the dungeon.", "Item");
        });
        refresh();
    }
    function refresh() {
        if (!dirty) return;
        dirty = false;
        glossary.set_context(Array.from(entries.values()));
        var root = document.getElementById("messages"); if (root) glossary.linkify(root);
    }
    function partyChanged() {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state) return;
        state.members.forEach(function (hero) {
            (hero.inventory || []).forEach(function (item) {
                var plain = item.name.replace(/^(?:an? |the |\d+ )/i, "");
                var singular = plain.replace(/^(potions|scrolls|wands|books|rings|amulets)\b/i, function (word) { return word.slice(0, -1); });
                remember(item.name, item.description || "A known item carried by " + hero.name + ".", "Item", [item.name, plain, singular]);
            });
            ["abilities", "spells"].forEach(function (kind) {
                (hero[kind] || []).forEach(function (power) { remember(power.name, power.desc, kind === "spells" ? "Spell" : "Ability"); });
            });
        });
        refresh();
    }
    $(document).on("map_knowledge_changed.messageReferences", mapChanged)
        .on("party_state_rendered.messageReferences", partyChanged)
        .on("game_init.messageReferences game_cleanup.messageReferences", function () { entries.clear(); dirty = false; glossary.set_context([]); });
    return { refresh: refresh };
});
