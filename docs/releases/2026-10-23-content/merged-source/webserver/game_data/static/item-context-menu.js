define(["jquery", "./context-menu", "./workflow-actions", "./party-skill-training"], function ($, menus, actions, training) {
    "use strict";
    function state() { return window.crawl_party && window.crawl_party.state; }
    function fingerprint(member, item) {
        return JSON.stringify([actions.controlledSlot(), member.slot, member.place, member.pos, item,
            actions.reason(member), item.assimilation && actions.assimilationReason(member, item),
            training.signature(member), state().inventory_use, state().inventory_secondary, state().party_trade]);
    }
    function inventory(member, item) {
        var expected = fingerprint(member, item);
        function resolve() {
            var hero = state() && state().members.find(function (entry) { return entry.slot === member.slot; });
            var entry = hero && hero.inventory.find(function (entry) { return entry.slot === item.slot; });
            return entry && fingerprint(hero, entry) === expected ? { hero: hero, item: entry } : null;
        }
        function run(callback) { return function () { var value = resolve(); if (value) callback(value.hero, value.item); }; }
        var blocked = actions.reason(member);
        var entries = [{ label: "Inspect", disabled: actions.inspectionReason(member), detail: "Properties and full description",
            run: run(actions.describe) }];
        if (state().inventory_use === true) {
            var unequip = item.equipped && state().inventory_secondary === true;
            var verb = unequip ? actions.itemUnequipVerb(item) : actions.itemVerb(item);
            if (verb !== "Inspect") entries.push({ label: verb, disabled: blocked,
                detail: "Uses time", run: run(unequip ? actions.itemSecondaryAction
                    : function (hero, entry) { actions.itemAction(hero, entry, false); }) });
        }
        if (state().inventory_use === true && Array.isArray(item.device_actions)) item.device_actions.forEach(function (action) {
            entries.push({ label: action.label, disabled: blocked || action.blocked_reason,
                detail: [action.cost, action.effect].filter(Boolean).join(" · "), run: run(function (hero, entry) { actions.itemAction(hero, entry, false, action.key); }) });
        });
        if (state().inventory_use === true && item.can_weave) entries.push({ label: "Weave enchantments…",
            disabled: blocked, detail: "Choose a transfer · Personal capacity: at most 6",
            run: run(function (hero, entry) { actions.itemAction(hero, entry, false, "weave"); }) });
        if (state().inventory_use === true && item.assimilation) entries.push({ label: "Assimilate…",
            disabled: actions.assimilationReason(member, item), consequential: true,
            detail: "Consumes one item · " + item.assimilation.turns + " of your turns",
            run: run(function (hero, entry) { actions.itemAction(hero, entry, false, "assimilate"); }) });
        if (state().inventory_secondary === true) {
            var secondary = item.equipped ? actions.itemUnequipVerb(item) : "Drop";
            if (!entries.some(function (entry) { return entry.label === secondary; })) entries.push({ label: secondary,
                disabled: blocked, consequential: !item.equipped, detail: item.equipped ? "Remove equipped gear" : "Drop this stack on your tile",
                run: run(actions.itemSecondaryAction) });
        }
        if (!item.equipped && state().party_trade === true && state().members.length > 1) entries.push({ label: "Trade with party", disabled: blocked,
            run: run(function (hero, entry) { $(document).trigger("party_trade_open", [null, entry.slot]); }) });
        entries = entries.concat(training.itemEntries(member, item, run));
        return { title: item.name, entries: entries, valid: function () { return Boolean(resolve()); } };
    }
    function bind(element, member, item) {
        var expectedItem = JSON.stringify([member.player_id, item]);
        return menus.bind(element, function () {
            // HUD art can stay mounted while a new training snapshot arrives.
            var hero = state() && state().members.find(function (entry) { return entry.slot === member.slot; });
            var current = hero && hero.inventory.find(function (entry) { return entry.slot === item.slot; });
            return current && JSON.stringify([hero.player_id, current]) === expectedItem ? inventory(hero, current) : null;
        });
    }
    return { bind: bind, inventory: inventory };
});
