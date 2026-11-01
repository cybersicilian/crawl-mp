/* Visible floor-item facts and deterministic model layouts. No renderer or live-state access.
 * Optional knownStack must bind a complete native floor_items list to this exact tile:
 * {known: hero.floor_items_known, x:hero.pos.x, y:hero.pos.y, items:hero.floor_items}.
 * S_UNDER can mean one item beneath an actor; it never supplies a count or identity.
 */
define(["./enums", "./tileinfo-main"],function(enums,tiles){
    "use strict";
    var names=new Map(),gold=new Map();
    Object.keys(tiles).forEach(function(name){
        if(Number.isInteger(tiles[name])&&!names.has(tiles[name]))names.set(tiles[name],name);
    });
    ["01","02","03","04","05","06","07","08","09","10","16","19","23","25"].forEach(function(suffix,index){
        if(Number.isInteger(tiles["GOLD"+suffix]))gold.set(tiles["GOLD"+suffix],index+1);
    });
    function family(index){
        if(gold.has(index))return "gold";
        var name=names.get(index)||"";
        if(/^(?:POTION_|POT_|UNSEEN_POTION)/.test(name))return "potion";
        if(/^(?:SCROLL_|SCR_|UNSEEN_SCROLL)/.test(name))return "scroll";
        if(/^(?:WPN_|MI_|UNRAND_|UNSEEN_WEAPON)/.test(name))return "weapon";
        if(/^(?:ARM_|THELM_|UNSEEN_ARMOUR)/.test(name))return "armour";
        if(/^(?:RING_|AMU_)/.test(name))return "jewellery";
        if(/^(?:WAND_|UNSEEN_WAND)/.test(name))return "wand";
        if(/^BOOK_/.test(name))return "book";
        if(/^CORPSE_/.test(name))return "corpse";
        if(/^(?:FOOD_|MISC_|STAFF_|RUNE_|UNCOLLECTED_RUNE_|DECK_)|^ORB$/.test(name))return "item";
        return null;
    }
    function boundItems(entry,knownStack){
        if(!knownStack||knownStack.known!==true||knownStack.x!==entry.x||knownStack.y!==entry.y||!Array.isArray(knownStack.items))return null;
        return knownStack.items.filter(function(item){
            return item&&Number.isInteger(item.qty)&&item.qty>0&&Array.isArray(item.tile)&&item.tile.length>0
                &&item.tile.every(Number.isInteger);
        });
    }
    function topIndex(item){return item.tile[item.tile.length-1];}
    function coinLayout(pileClass){
        var count=Math.max(1,Math.min(23,pileClass===1?1:pileClass+Math.floor(pileClass/2)));
        var radius=pileClass<=2?.075:Math.min(.24,.08+pileClass*.012),poses=[];
        for(var n=0;n<count;n++){
            var angle=n*2.399963229728653,ring=Math.sqrt((n+.35)/count)*radius;
            poses.push({x:Math.cos(angle)*ring,z:Math.sin(angle)*ring,y:.022+Math.floor(n/7)*.026,
                angle:angle,tilt:n%4===0?.11:0,radius:.055,height:.018});
        }
        return poses;
    }
    function stackLayout(present,underActor){
        if(!present)return [];
        // Abstract contact silhouettes do not describe an unseen item's kind or count.
        if(underActor)return [{x:0,z:0,y:.008,angle:.23,width:.3,depth:.22,height:.014,bevel:.008,corner:.045}];
        return [
            {x:-.045,z:.025,y:.01,angle:-.22,width:.38,depth:.265,height:.021,bevel:.012,corner:.046},
            {x:.034,z:-.012,y:.027,angle:.28,width:.315,depth:.235,height:.025,bevel:.01,corner:.037},
            {x:-.008,z:-.026,y:.052,angle:-.08,width:.27,depth:.19,height:.019,bevel:.008,corner:.035}
        ];
    }
    function pileStyle(kind,layers,underActor){
        return {kind:kind==="gold"?"coin-pile":underActor?"underlay":"layered-pile",
            topElevation:layers.length?Math.max.apply(null,layers.map(function(layer){return layer.y+layer.height;}))+.006:0,
            contactWidth:underActor?.4:.51,contactDepth:underActor?.31:.39};
    }
    function describe(entry,preparedFg,knownStack){
        if(!entry||!entry.t)return null;
        var bg=enums.prepare_bg_flags(entry.t.bg||0),fg=preparedFg||enums.prepare_fg_flags(entry.t.fg||0);
        if(bg.UNSEEN||bg.MM_UNSEEN||fg.value===tiles.UNSEEN_ITEM)return null;
        var index=fg.value||0,kind=family(index),known=boundItems(entry,knownStack);
        var under=Boolean(fg.S_UNDER||fg.S_UNDER_GOOD||fg.S_UNDER_ARTEFACT);
        var quantity=null,matched=known&&known.filter(function(item){return topIndex(item)===index;});
        if(matched&&matched.length===1)quantity=matched[0].qty;
        var multiple=Boolean(kind&&(under||quantity>1)||known&&known.length>1);
        if(!kind&&!under&&!(known&&known.length))return null;
        var present=under||multiple,underActor=!kind&&under,layers=stackLayout(present,underActor);
        if(kind==="gold")layers=layers.map(function(layer){return Object.assign({},layer,{y:layer.y*.2,height:layer.height*.2,bevel:layer.bevel*.2});});
        var quality=fg.S_UNDER_ARTEFACT?"artefact":fg.S_UNDER_GOOD?"good":"ordinary";
        return {kind:kind||"under-items",tile:kind?index:null,quantity:quantity,
            // Native gold tile tiers are visual classes, including broad quantity buckets.
            pileClass:gold.get(index)||null,coins:kind==="gold"?coinLayout(gold.get(index)):[],
            stack:{present:present,multiple:multiple,underActor:underActor,quality:quality,
                itemCount:known?known.length:null,quantity:quantity,label:!kind&&under?"Items underneath":present?"Item stack":"Item"},
            style:pileStyle(kind,layers,underActor),layers:layers,knownItems:known?known.map(function(item){
                return {tile:topIndex(item),base:item.tile.length>1?item.tile[0]:null,quantity:item.qty};
            }):null};
    }
    return {describe:describe,family:family,coinLayout:coinLayout,stackLayout:stackLayout,pileStyle:pileStyle};
});
