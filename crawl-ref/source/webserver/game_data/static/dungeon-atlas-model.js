/* The atlas and 3D overlays share the same recipient-owned perception projection. */
define(["./first-person-perception"], function (perception) {
    "use strict";
    function describe(entry,visible){
        var facts=perception.describe(entry,visible);if(!facts)return null;
        return {x:facts.x,y:facts.y,terrain:facts.terrain||"unknown",terrainKnown:facts.terrainKnown,
            knowledge:facts.knowledge,mapped:facts.mapped,actor:facts.actor,presence:facts.presence,
            signal:facts.presence?facts.presence.kind:null,canInspectActor:facts.canInspectActor,
            label:facts.terrainKnown?entry.feature_name||facts.terrain:facts.presence.label};
    }
    function snapshot(map){
        var bounds=map.bounds(),cells=[],mapped=0;
        if(!bounds)return{bounds:null,cells:cells,mapped:0};
        for(var y=bounds.top;y<=bounds.bottom;y++)for(var x=bounds.left;x<=bounds.right;x++){
            var entry=map.get(x,y),cell=describe(entry,map.visible(entry));
            if(cell){cells.push(cell);if(cell.mapped)mapped++;}
        }
        return{bounds:Object.assign({},bounds),cells:cells,mapped:mapped};
    }
    return{describe:describe,snapshot:snapshot};
});
