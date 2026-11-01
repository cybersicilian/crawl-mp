/* Native fluid identities -> optional surface appearance; no visibility expansion. */
define(["./tileinfo-dngn","mesh-fluid"],function(tiles,fluid){
    "use strict";
    var profiles=new Map();
    function add(names,kind,depth,murky){
        names.forEach(function(name){var index=tiles[name];if(!Number.isInteger(index))return;
            var profile={kind:kind,depth:depth,murky:Boolean(murky),opaque:kind!=="water",opacity:kind==="water"?(murky?.86:depth==="deep"?.79:.46):1,transmission:0,
                roughness:kind==="lava"?0.78:kind==="honey"?0.21:murky?0.36:depth==="deep"?0.17:0.24,
                metalness:0,strength:kind==="lava"?0.8:kind==="honey"?0.7:1};
            profiles.set(tiles.basetile(index),Object.freeze(profile));});
    }
    add(["DNGN_SHALLOW_WATER","DNGN_SHALLOW_WATER_DISTURBANCE","SHOALS_SHALLOW_WATER",
        "SHOALS_SHALLOW_WATER_DISTURBANCE"],"water","shallow",false);
    add(["DNGN_DEEP_WATER","DNGN_OPEN_SEA","SHOALS_DEEP_WATER"],"water","deep",false);
    add(["DNGN_SHALLOW_WATER_MURKY","DNGN_SHALLOW_WATER_MURKY_DISTURBANCE","DNGN_TOXIC_BOG"],"water","shallow",true);
    add(["DNGN_DEEP_WATER_MURKY"],"water","deep",true);
    add(["DNGN_STARWATER"],"water","shallow",false);
    add(["DNGN_LAVA","DNGN_LAVA_SEA"],"lava","deep",false);
    // Native honey is a sticky MF_FEATURE, not water; appearance never changes movement/submersion.
    add(["DNGN_SHALLOW_HONEY"],"honey","shallow",false);
    function describe(index){return Number.isInteger(index)?profiles.get(tiles.basetile(index))||null:null;}
    function material(index,nativeMaterial){
        var profile=describe(index);if(!profile||!nativeMaterial)return nativeMaterial;
        return Object.assign({},nativeMaterial,{fluid:profile,roughness:profile.roughness,metalness:0,
            opacity:profile.opacity,transmission:0,emission:0,castShadow:profile.kind!=="water"});
    }
    function shoreline(get,x,y,profile){
        if(!profile)return [0,0,0,0];
        return [[0,-1],[1,0],[0,1],[-1,0]].map(function(offset){
            var neighbor=get(x+offset[0],y+offset[1]);
            // Fog is not a shore. Only an explicitly supplied known cell may form an edge.
            if(!neighbor||neighbor.visible===false||neighbor.known===false)return 0;
            var other=neighbor.fluid||neighbor.floorMaterial&&neighbor.floorMaterial.fluid;
            return other&&other.kind===profile.kind?0:1;
        });
    }
    return {describe:describe,material:material,shoreline:shoreline,phase:fluid.phase,volume:fluid.volume,uniforms:fluid.uniforms};
});
