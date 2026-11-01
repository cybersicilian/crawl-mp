/* Native anatomy and equipment -> foreground presentation. No species-based fit rules. */
define(["./tileinfo-main"], function (tiles) {
    "use strict";
    var gloveModels = {
        ARM_GLOVES: "leather", ARM_GLOVES_SHINY: "plate", ARM_GLOVES_RUNED: "wraps",
        ARM_GLOVES_GLOWING: "cloth", ARM_GLOVES_RANDART: "cloth", UNRAND_FENCERS: "cloth",
        UNRAND_POWER_GLOVES: "plate", UNRAND_DELATRAS_GLOVES: "wraps",
        UNRAND_CRAB_CLAWS: "crab", UNRAND_FISTS_OF_THUNDER: "plate", UNRAND_GOLEM_GLOVES: "golem"
    };
    function tileMatches(art, name) {
        var index = tiles[name], info = Number.isInteger(index) && tiles.get_tile_info(index);
        return Boolean(info && art && art.texture === "main" && (art.layers || []).some(function (layer) {
            return (!layer.texture || layer.texture === "main") && layer.sx === info.sx && layer.sy === info.sy
                && layer.w === info.ex-info.sx && layer.h === info.ey-info.sy;
        }));
    }
    function anatomy(profile) {
        var name = (profile.hands || "").toLowerCase(), attack = (profile.unarmed_attack || "").toLowerCase();
        if (/blade/.test(name)) return "blade";
        if (/paw/.test(name)) return "paw";
        if (/pincer/.test(name)) return "crab";
        if (/tentacle|eel/.test(name)) return "tentacle";
        if (/pseudopod/.test(name + " " + attack)) return "pseudopod";
        if (/claw/.test(name + " " + attack)) return "claws";
        return /hand|fist/.test(name) ? "bare" : null;
    }
    function readied(hero, player) {
        if (!hero || !player || player.quiver_available === false || player.quiver_available === 0
            || Number.isInteger(player.quiver_item) && player.quiver_item >= 0) return null;
        var description = String(player.quiver_desc || "").replace(/<[^>]*>/g, "");
        // Match an actual known spell, never infer a spell from a weapon or school.
        var spell = (hero.spells || []).filter(function (entry) { return entry.name && description.includes(entry.name); })
            .sort(function (a,b) { return b.name.length-a.name.length; })[0];
        if (!spell) return null;
        return spellVisual(spell);
    }
    function spellVisual(spell){
        if(!spell)return null;
        var school = String(spell.schools || "").toLowerCase(), kind = "arcane";
        [["fire","flame"],["ice","frost"],["air","lightning"],["necromancy","soul"],
            ["earth","earth"],["poison","venom"],["alchemy","venom"],["summon","summoning"]].some(function (entry) {
            if (!school.includes(entry[0])) return false; kind = entry[1]; return true;
        });
        return { name:spell.name, kind:kind, tile:spell.tile, blocked:Boolean(spell.blocked_reason
            || spell.casting_cost && spell.casting_cost.payable === false) };
    }
    function describe(hero, player, held) {
        var profile = hero && hero.equipment_profile;
        if (!profile || profile.version !== 1 || !Array.isArray(profile.slots) || !Array.isArray(profile.items)) return [];
        var kind = anatomy(profile); if (!kind) return [];
        var gloveSlot = profile.slots.find(function (slot) { return slot.type === "hands" && slot.state === "equipped"; });
        var glove = gloveSlot && profile.items.find(function (item) { return item.inv_slot === gloveSlot.inv_slot; });
        if (glove && glove.art) {
            kind = Object.keys(gloveModels).map(function (name) { return tileMatches(glove.art,name) ? gloveModels[name] : null; }).find(Boolean) || "leather";
        }
        var twoHanded = held.some(function (entry) { return entry.hands === 2; });
        var count = /^(hand|fist|claw|paw|tentacle|pincer)$/.test(profile.hands) ? 1 : 2;
        var rings=profile.slots.filter(function(slot){return slot.type==="ring"&&slot.state==="equipped";}).map(function(slot,index){
            var item=profile.items.find(function(value){return value.inv_slot===slot.inv_slot;});
            return item&&item.art?{side:count===1||index%2===0?"main":"offhand",finger:Math.floor(index/(count===1?1:2))%4,
                label:slot.name,art:item.art,slot:slot.inv_slot}:null;
        }).filter(Boolean);
        return ["main","offhand"].slice(0,count).map(function (side) {
            var item = held.find(function (entry) { return entry.side === side; });
            return { side:side, model:kind, grip:Boolean(item || twoHanded),
                label:(gloveSlot && gloveSlot.name || profile.hands), art:glove && glove.art,
                portrait:profile.portrait, rings:rings.filter(function(ring){return ring.side===side;}), unarmed:!item && !twoHanded,
                magic:side === "offhand" && !item && !twoHanded ? readied(hero,player) : null };
        });
    }
    return {describe:describe,readied:readied,anatomy:anatomy,cast:function(hero,event){
        return event&&event.category==="Cast"&&event.name?spellVisual((hero.spells||[]).find(function(spell){return spell.name===event.name;})):null;
    }};
});
