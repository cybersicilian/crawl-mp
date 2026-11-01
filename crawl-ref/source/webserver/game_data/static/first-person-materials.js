/* Native tile surfaces retain their pixel art; shaders supply light and depth. */
define([], function () {
    "use strict";
    var surfaces={},colors=new Map();
    function color(value) {
        if(colors.has(value))return colors.get(value);
        var canvas=document.createElement("canvas");canvas.width=canvas.height=4;
        var context=canvas.getContext("2d");context.fillStyle=value;context.fillRect(0,0,4,4);
        var material={image:canvas,pixelated:true};colors.set(value,material);return material;
    }
    function get(name,fallback){
        name={masonry:"stone",paving:"floor",oak:"wood"}[name]||name;
        return surfaces[name]||fallback;
    }
    function configure(nativeSurfaces){
        surfaces={};Object.keys(nativeSurfaces).forEach(function(name){
            var source=nativeSurfaces[name];if(!source)return;
            surfaces[name]=Object.assign({},source,{pixelated:source.pixelated!==false,relief:0.5,gloss:0.03});
            if(name==="stone"||name==="ceiling")surfaces[name].tileScale=1;
        });
    }
    return {get:get,color:color,configure:configure};
});
