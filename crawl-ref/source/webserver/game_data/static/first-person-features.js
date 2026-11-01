/* Native terrain identities -> model attachment slots and optical properties. */
define(["./tileinfo-dngn"],function(tiles){
    "use strict";
    var names=new Map();
    Object.keys(tiles).forEach(function(name){if(Number.isInteger(tiles[name])&&!names.has(tiles[name]))names.set(tiles[name],name);});
    function describe(index){
        var name=names.get(tiles.basetile(index))||"",door=/DOOR|GATE_/.test(name);
        var open=door&&/OPEN|BROKEN/.test(name),closed=door&&!open;
        var connector=/^(DNGN_(?:ENTER(?:_|$)|EXIT_|RETURN(?:_|$)|PORTAL(?:_|$)|TRANSIT_|STARRY_PORTAL|ABYSSAL_STAIR|ESCAPE_HATCH)|SHOP_)/.test(name)
            ?{kind:/HATCH/.test(name)?"hatch":/PORTAL|ABYSS|PANDEMONIUM/.test(name)?"portal":/^SHOP_/.test(name)?"shop":"branch",
                inactive:/GONE|EXPIRED/.test(name),direction:/HATCH_UP/.test(name)?"up":"down",name:name,sourceTile:index}:null;
        var fixture=connector&&connector.kind==="hatch"?{kind:"hatch",direction:connector.direction}:null;
        if(/^DNGN_(?:TRAP_|BINDING_SIGIL|ICE_THORNS)/.test(name)){
            var kind=/TRAP_SHAFT/.test(name)?"shaft":/TRAP_PLATE/.test(name)?"plate":/TRAP_(?:BOLT|SPEAR|NET)/.test(name)?"mechanical"
                :/TRAP_ALARM/.test(name)?"alarm":/TRAP_WEB/.test(name)?"web":"sigil";
            fixture={kind:kind,direction:"down"};
        }
        if(fixture)Object.assign(fixture,{active:!/_INACTIVE/.test(name),name:name,sourceTile:index});
        var glass=/TRANSPARENT|CLEAR_DOOR|GATE_.*CLEAR/.test(name),crystal=/CRYSTAL/.test(name);
        var torch=/TORCH/.test(name),floor=/STAIRS_DOWN/.test(name)?"stairs_down":/STAIRS_UP/.test(name)?"stairs_up"
            :null;
        var wall=index>=tiles.FLOOR_MAX&&index<tiles.WALL_MAX;
        var plain=torch?tiles[name.replace(/_TORCH(?:_\d+)?$/,"")]:index;
        var attachments=[];
        if(torch)attachments.push({kind:"torch",mount:"wall",height:2.18,sourceTile:index});
        if(/FOUNTAIN/.test(name))attachments.push({kind:"fountain",mount:"floor",height:0.8,sourceTile:index});
        if(/LAVA/.test(name))attachments.push({kind:"emissive-surface",mount:"floor",height:0.35,sourceTile:index});
        return {name:name,kind:closed?"door":open?"open_door":floor,solid:wall||closed,door:door,open:open,doorAxis:/VGATE/.test(name)?"v":/GATE_/.test(name)?"h":null,
            doorSegment:door&&/GATE_/.test(name)?(name.match(/_(LEFT|MIDDLE|RIGHT|UP|DOWN)$/)||[])[1]?.toLowerCase():null,
            runed:door&&/RUNED/.test(name),sealed:door&&/SEALED/.test(name),broken:door&&/BROKEN/.test(name),connector:connector,fixture:fixture,
            torch:torch,wallTexture:Number.isInteger(plain)?plain:index,transparent:glass,
            optical:glass?{opacity:0.28,transmission:0.8,roughness:0.12,castShadow:false}
                :crystal?{opacity:1,transmission:0,roughness:0.17,castShadow:true}:null,
            water:/WATER|OPEN_SEA/.test(name),lava:/LAVA/.test(name),attachments:attachments};
    }
    return {describe:describe};
});
