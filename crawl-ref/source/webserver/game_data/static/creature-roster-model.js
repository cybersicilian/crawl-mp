/* Combine recipient-visible map contacts with optional native timing readings. */
define([], function () {
    "use strict";
    function key(creature) {
        return creature.contact_key || (creature.id ? String(creature.id) : creature.x + "," + creature.y);
    }
    function category(creature) {
        if (creature.att === 4) return "allies";
        if (creature.att > 0 || creature.non_threatening) return "neutrals";
        return "enemies";
    }
    function collect(readings, contacts) {
        var byPosition = new Map(), result = [], used = new Set();
        contacts.forEach(function (contact) { byPosition.set(contact.x + "," + contact.y, contact); });
        (readings || []).forEach(function (reading) {
            if (!Number.isFinite(reading.x) || !Number.isFinite(reading.y)) return;
            // A remembered invisible contact must never borrow a visible actor's facts.
            var contact = reading.perception !== "last_known" && byPosition.get(reading.x + "," + reading.y);
            if (contact && contact.name !== reading.name) contact = null;
            if (contact) used.add(contact);
            result.push(Object.assign({}, contact || {}, reading, { contact_key: key(reading) }));
        });
        contacts.forEach(function (contact) { if (!used.has(contact)) result.push(contact); });
        return result;
    }
    function groups(creatures) {
        var groups = [
            { id: "enemies", label: "Enemies", open: true, count: 0, stacks: new Map() },
            { id: "allies", label: "Allies", open: true, count: 0, stacks: new Map() },
            { id: "neutrals", label: "Neutrals", open: false, count: 0, stacks: new Map() }
        ];
        var byId = new Map(groups.map(function (group) { return [group.id, group]; }));
        creatures.forEach(function (creature) {
            var group = byId.get(category(creature));
            // Only identical displayed readings share a stack. Injured, affected or
            // differently timed actors stay separate; no aggregate health is invented.
            var stack = JSON.stringify([creature.name, creature.type, creature.perception,
                creature.damage_level, creature.health, creature.energy_deficit, creature.speed,
                creature.ready, creature.statuses_known, creature.statuses, creature.aura_radius]);
            if (!group.stacks.has(stack)) group.stacks.set(stack, []);
            group.stacks.get(stack).push(creature); group.count++;
        });
        return groups;
    }
    return { key: key, category: category, collect: collect, groups: groups };
});
