/* Native prop presentation only. Callers retain visibility, collision and actor rules. */
define(["./tileinfo-dngn", "./tileinfo-player"], function (dungeon, actors) {
    "use strict";
    var catalogs={dungeon:new Map(),player:new Map()};
    function indexNames(tiles,target){
        Object.keys(tiles).forEach(function(name){
            var index=tiles[name];if(!Number.isInteger(index)||!families.some(function(entry){return entry.pattern.test(name);}))return;
            var base=tiles.basetile?tiles.basetile(index):index;
            if(base!==index||target.has(index))return;
            target.set(index,name);
        });
    }
    var families=[
        {kind:"tree",pattern:/^DNGN_(?:.*TREE|MANGROVE)(?:_|$)/,height:3.2,maxWidth:2.5,
            support:{kind:"root-contact",radius:.22,height:.035,material:"wood"}},
        {kind:"fountain",pattern:/^DNGN_.*FOUNTAIN/,height:1.2,maxWidth:.9},
        {kind:"arch",pattern:/^DNGN_STONE_ARCH/,height:2.7,maxWidth:1.1},
        {kind:"statue",pattern:/^DNGN_.*STATUE|^MONS_.*STATUE/,height:1.8,maxWidth:1.25,
            support:{kind:"plinth",width:.62,depth:.56,height:.08,material:"stone"}},
        {kind:"idol",pattern:/^DNGN_.*IDOL/,height:1.65,maxWidth:1.1,
            support:{kind:"plinth",width:.6,depth:.5,height:.06,material:"stone"}},
        {kind:"gravestone",pattern:/^DNGN_(?:NECROPOLIS_)?GRAVESTONE/,height:.85,maxWidth:.75,
            support:{kind:"plinth",width:.48,depth:.36,height:.035,material:"stone"}},
        {kind:"sarcophagus",pattern:/^DNGN_SARCOPHAGUS_/,height:.7,maxWidth:1.05},
        {kind:"altar",pattern:/^DNGN_ALTAR_/,height:.85,maxWidth:.9,
            support:{kind:"plinth",width:.66,depth:.6,height:.055,material:"stone"}},
        {kind:"briar",pattern:/^MONS_BRIAR_PATCH/,height:.48,maxWidth:.95},
        {kind:"sapling",pattern:/^MONS_OKLOB_SAPLING/,height:.65,maxWidth:.72},
        {kind:"plant",pattern:/^MONS_(?:WITHERED_PLANT|DEMONIC_PLANT|OKLOB_PLANT|PLANT|ZOMBIE_PLANT)(?:_|$)/,height:1.05,maxWidth:.95},
        {kind:"bush",pattern:/^MONS_(?:BUSH|BURNING_BUSH)(?:_|$)/,height:.75,maxWidth:1.05},
        {kind:"fungus",pattern:/^MONS_(?:FUNGUS|WANDERING_MUSHROOM|ZOMBIE_FUNGUS|SIMULACRUM_FUNGUS|SPECTRAL_FUNGUS)(?:_|$)/,height:.42,maxWidth:.7}
    ];
    indexNames(dungeon,catalogs.dungeon);indexNames(actors,catalogs.player);
    function describe(index,atlas){
        atlas=atlas||"dungeon";
        var tiles=atlas==="player"?actors:atlas==="dungeon"?dungeon:null;
        if(!tiles||!Number.isInteger(index))return null;
        var base=tiles.basetile?tiles.basetile(index):index,name=catalogs[atlas].get(base);
        if(!name)return null;
        var family=families.find(function(entry){return entry.pattern.test(name);});
        if(!family)return null;
        var support=family.support?Object.assign({},family.support):null;
        // Actor plants/statues remain native actors: a prop hint never replaces
        // their body-size class, attitude, combat information or visibility.
        if(atlas==="player")support=null;
        var elevation=support?support.height:0,attachments=support?[support]:[];
        // A socket is not an invented light: activate only when the consumer
        // has a native visible emission/effect for this source tile.
        if(/FIRE_STATUE|BURNING_BUSH|SPARKLING_FOUNTAIN/.test(name))attachments.push({kind:"effect-socket",
            role:"native-light",height:family.height*.72,activation:"native-emission"});
        return {kind:family.kind,source:{atlas:atlas,index:index,base:base,name:name},
            representation:family.representation||"sprite",nativeSprite:family.representation!=="model",
            logicalHeight:family.height,maxWidth:family.maxWidth,elevation:elevation,
            castsShadow:true,actor:atlas==="player",sizePolicy:atlas==="player"?"native-actor":"prop",
            support:support,attachments:attachments,light:null,animated:false};
    }
    function fit(profile,aspect){
        if(!profile)return null;
        var ratio=Number.isFinite(aspect)&&aspect>0?Math.max(.08,Math.min(8,aspect)):1;
        var scale=Math.min(1,profile.maxWidth/(profile.logicalHeight*ratio));
        return {height:profile.logicalHeight*scale,width:profile.logicalHeight*ratio*scale,
            elevation:profile.elevation,logicalHeight:profile.logicalHeight,artScale:scale,
            castsShadow:profile.castsShadow};
    }
    return {describe:describe,fit:fit};
});
