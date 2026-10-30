define(["./party-model"], function (party) {
    "use strict";
    // Names are rune_type_name() in item-name.cc; symbols match tilepick.cc.
    var runeTiles = { iron: "RUNE_DIS", obsidian: "RUNE_GEHENNA", icy: "RUNE_COCYTUS", bone: "RUNE_TARTARUS",
        slimy: "RUNE_SLIME", silver: "RUNE_VAULTS", serpentine: "RUNE_SNAKE", elven: "RUNE_ELVEN",
        golden: "RUNE_TOMB", decaying: "RUNE_SWAMP", barnacled: "RUNE_SHOALS", gossamer: "RUNE_SPIDER",
        clay: "RUNE_BURROWS", mossy: "MISC_RUNE_OF_ZOT", demonic: "RUNE_DEMONIC", abyssal: "RUNE_ABYSS", glowing: "RUNE_MNOLEG",
        magical: "RUNE_LOM_LOBON", fiery: "RUNE_CEREBOV", dark: "RUNE_GLOORX_VLOQ" };
    function project(state) {
        var members = state && Array.isArray(state.members) ? state.members : [];
        var hero = members.find(function (member) { return member.slot === party.controlledSlot(state); });
        var gold = state && state.gold;
        var bribeFund = hero && hero.god === "Gozag" ? hero.bribe_fund : null;
        var runes = [], known = members.length > 0;
        members.forEach(function (member) {
            if (!Array.isArray(member.runes) || member.runes_known === false) known = false;
            (Array.isArray(member.runes) ? member.runes : []).forEach(function (name) {
                if (typeof name !== "string" || !name) { known = false; return; }
                if (!runes.includes(name)) runes.push(name);
            });
        });
        return { gold: Number.isFinite(gold) && gold >= 0 ? gold : null,
            bribeFund: Number.isInteger(bribeFund) && bribeFund > 0 ? bribeFund : null,
            place: hero && typeof hero.place === "string" && hero.place ? hero.place : null,
            runesKnown: known, runes: runes.map(function (name) {
                return { name: name, tile: Object.prototype.hasOwnProperty.call(runeTiles, name) ? runeTiles[name] : null };
            }) };
    }
    return { project: project };
});
