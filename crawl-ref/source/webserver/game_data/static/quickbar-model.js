define([], function () {
    "use strict";
    var keys = "1234567890", count = keys.length;
    function shortcut(index) { return keys[index] || ""; }
    function keyIndex(key) { return typeof key === "string" && key.length === 1 ? keys.indexOf(key) : -1; }
    function itemMemory(value) {
        if (!value || typeof value.name !== "string" || !value.name) return null;
        var saved = { name: value.name };
        ["kind_name", "description"].forEach(function (key) {
            if (typeof value[key] === "string") saved[key] = value[key];
        });
        // Preserve the native art contract, including identification overlays.
        if (value.art && Array.isArray(value.art.layers)
            && value.art.layers.every(function (layer) { return layer && typeof layer === "object"; })) saved.art = value.art;
        return saved;
    }
    function binding(value) {
        if (!value || !["item", "spell", "ability"].includes(value.kind) || !Number.isSafeInteger(value.id)) return null;
        // Native inventories include consumable slots beyond the 52 lettered
        // equipment slots. Resolve against the hero's current inventory below.
        if (value.kind === "item" && value.id < 0) return null;
        var valid = { kind: value.kind, id: value.id };
        if (value.kind === "spell" && value.quick_cast === true) valid.quick_cast = true;
        if (value.kind === "item" && value.action !== undefined) {
            if (!["prototype", "overclock", "breakthrough", "overclock_finite"].includes(value.action)
                || !Number.isSafeInteger(value.uid) || value.uid <= 0) return null;
            valid.action = value.action; valid.uid = value.uid;
        }
        var saved = value.kind === "item" && itemMemory(value.last_item);
        if (saved) valid.last_item = saved;
        return valid;
    }
    function normalize(values) {
        return Array.from({ length: count }, function (_, index) { return binding(Array.isArray(values) && values[index]); });
    }
    function resolve(member, value) {
        var valid = binding(value); if (!member || !valid) return null;
        var entries = member[valid.kind === "item" ? "inventory" : valid.kind === "spell" ? "spells" : "abilities"] || [];
        var entry = entries.find(function (entry) {
            return valid.action === "prototype"
                ? Array.isArray(entry.device_actions) && entry.device_actions.some(function (action) { return action.key === "prototype"; })
                : valid.action ? entry.uid === valid.uid : (valid.kind === "item" ? entry.slot : entry.id) === valid.id;
        }) || null;
        return entry && valid.action ? deviceAction(entry, valid.action) : entry;
    }
    function remember(member, value) {
        var valid = binding(value), entry = resolve(member, valid);
        if (!entry || valid.kind !== "item") return valid;
        var profile = member.equipment_profile;
        var appearance = profile && Array.isArray(profile.items) && profile.items.find(function (item) { return item.inv_slot === entry.slot; });
        var saved = itemMemory({ name: entry.name, kind_name: entry.kind_name, description: entry.description,
            art: appearance && appearance.art });
        if (saved) valid.last_item = saved;
        return valid;
    }
    function deviceAction(entry, key) {
        var action = Array.isArray(entry.device_actions) && entry.device_actions.find(function (value) { return value.key === key; });
        return action ? Object.assign({}, entry, { source_name: entry.name, name: action.label + " · " + entry.name,
            action: key, blocked_reason: action.blocked_reason, cost: action.cost,
            description: [action.effect, entry.description].filter(Boolean).join(" · ") }) : null;
    }
    function catalog(member, kind, query) {
        var entries = member && member[kind === "item" ? "inventory" : kind === "spell" ? "spells" : "abilities"] || [];
        if (kind === "item") entries = entries.flatMap(function (entry) {
            return [entry].concat((entry.device_actions || []).filter(function (action) { return action.key !== "designate"; })
                .map(function (action) { return deviceAction(entry, action.key); }));
        });
        var search = String(query || "").trim().toLowerCase();
        return entries.filter(function (entry) {
            return [entry.name, entry.schools, entry.letter, entry.hotkey].join(" ").toLowerCase().includes(search);
        });
    }
    return { count: count, shortcut: shortcut, keyIndex: keyIndex,
        binding: binding, normalize: normalize, resolve: resolve, remember: remember, catalog: catalog };
});
