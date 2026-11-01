/* A body takes inspection priority over ground items sharing the same tile. */
define([],function(){
    "use strict";
    function at(sprites,x,y){
        var candidates=(sprites||[]).filter(function(sprite){return sprite.layer==="actor"&&sprite.x===x&&sprite.y===y;});
        return candidates.find(function(sprite){return sprite.body;})||candidates[0]||null;
    }
    return {at:at};
});
