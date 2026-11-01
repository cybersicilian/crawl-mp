/* Resolve actual body variants in packed native portraits, excluding equipment. */
define(["./tileinfo-player"],function(tiles){
    "use strict";
    var bodies;
    function key(rect){return [rect.sx,rect.sy,rect.w,rect.h].join(":");}
    function bodyArt(portrait){
        if(!portrait||!Array.isArray(portrait.layers))return null;
        if(!bodies){
            bodies=new Set();
            Object.keys(tiles).forEach(function(name){
                var index=tiles[name];if(!Number.isInteger(index))return;
                // The generated BASE category contains every sex/skin/colour
                // variant, including names such as HUMAN_3 and DRACONIAN_RED.
                var base=Number.isInteger(tiles.BASE_HUMAN)&&Number.isInteger(tiles.SHADOW_SHADOW)
                    &&index>=tiles.BASE_HUMAN&&index<tiles.SHADOW_SHADOW;
                if(!base&&!/^TRANS?_/.test(name))return;
                var info=tiles.get_tile_info(index);if(info)bodies.add(key({sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy}));
            });
        }
        var layers=portrait.layers.filter(function(layer){return (!layer.texture||layer.texture==="player")&&bodies.has(key(layer));});
        return layers.length?{texture:portrait.texture,layers:layers}:null;
    }
    return {bodyArt:bodyArt};
});
