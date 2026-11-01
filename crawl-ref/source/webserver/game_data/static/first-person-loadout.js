/* Native equipment and action-count projection. No guessed slot identities or input intents. */
define([], function () {
    "use strict";
    function held(hero, player) {
        var profile = hero && hero.equipment_profile, result = [], seen = new Set();
        if (profile && profile.version === 1 && Array.isArray(profile.slots) && Array.isArray(profile.items)) {
            profile.slots.forEach(function (slot) {
                if (!["weapon", "offhand", "weapon_offhand"].includes(slot.type) || slot.state !== "equipped" || seen.has(slot.inv_slot)) return;
                var item = profile.items.find(function (entry) { return entry.inv_slot === slot.inv_slot; });
                if (!item || !item.art) return;
                seen.add(slot.inv_slot);
                result.push({ side: slot.type === "weapon" ? "main" : "offhand", slot: slot.inv_slot,
                    label: slot.name || "Held item", art: item.art, hands: item.hands || 1,
                    weapon: slot.type === "weapon" || Number.isInteger(item.hands) });
            });
            return result;
        }
        // Older streams expose wielded weapon indices, but never a shield index.
        ["weapon_index", "offhand_index"].forEach(function (key, i) {
            var index = player && player[key], item = player && player.inv && player.inv[index];
            if (!Number.isInteger(index) || index < 0 || !item || !Array.isArray(item.tile) || item.quantity === 0) return;
            if (seen.has(index)) return; seen.add(index);
            result.push({ side: i ? "offhand" : "main", slot: index, label: item.name || "Held item", tile: item.tile, hands: 1, weapon: true });
        });
        return result;
    }
    function tracker() {
        var previous=null,identity=null,detail=null;
        function reset(){previous=identity=detail=null;}
        function update(hero){
            detail=null;
            if(!hero||!Array.isArray(hero.actions)||hero.actions_known===false){reset();return null;}
            var key=JSON.stringify([hero.player_id,hero.slot,hero.name,hero.place]),totals=new Map(),subtypes=new Map();
            hero.actions.forEach(function(entry){
                if(Number.isInteger(entry.total)&&entry.total>=0)totals.set(entry.category,entry.total);
                (entry.subtypes||[]).forEach(function(subtype){
                    if(typeof subtype.name==="string"&&Number.isInteger(subtype.count)&&subtype.count>=0)
                        subtypes.set(entry.category+"\n"+subtype.name,subtype.count);
                });
            });
            var old=identity===key?previous:null;previous={totals:totals,subtypes:subtypes};identity=key;
            if(!old)return null;
            function event(kind,categories){
                var grown=categories.filter(function(category){return (totals.get(category)||0)>(old.totals.get(category)||0);});
                if(!grown.length)return null;
                detail={category:grown.length===1?grown[0]:null,name:null};
                if(grown.length===1){
                    var category=grown[0],prefix=category+"\n",changed=[];
                    subtypes.forEach(function(count,key){if(key.startsWith(prefix)&&count>(old.subtypes.get(key)||0))changed.push({name:key.slice(prefix.length),delta:count-(old.subtypes.get(key)||0)});});
                    // Native reports only its top eight subtypes. Do not guess a
                    // spell from a newly entering row or an ambiguous batch.
                    var delta=totals.get(category)-(old.totals.get(category)||0);
                    if(changed.length===1&&changed[0].delta===delta)detail.name=changed[0].name;
                }
                return kind;
            }
            return event("cast",["Cast","Invoke","Evoke"])||event("fire",["Fire"])||event("throw",["Throw"])
                ||event("attack",["Attack","Melee","Stab"])||event("block",["Block"]);
        }
        return {update:update,reset:reset,detail:function(){return detail;}};
    }
    return { held: held, tracker: tracker };
});
