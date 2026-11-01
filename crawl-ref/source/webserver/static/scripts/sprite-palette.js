/* Exact modal RGB of opaque source pixels; no assumed human/skin colour space. */
define([],function(){
    "use strict";
    function dominant(pixels){
        if(!pixels||pixels.length%4!==0)return null;
        var colours=new Map();
        for(var i=0;i<pixels.length;i+=4){
            if(pixels[i+3]<128)continue;
            var rgb=[pixels[i],pixels[i+1],pixels[i+2]];
            // Native outline ink is near black. Dark skin/fur and white scales
            // remain valid material colours rather than being normalized away.
            if(Math.max.apply(null,rgb)<24)continue;
            var key=rgb.join(":"),entry=colours.get(key)||{rgb:rgb,count:0};entry.count++;colours.set(key,entry);
        }
        var best=null;colours.forEach(function(entry){if(!best||entry.count>best.count)best=entry;});
        return best?best.rgb.concat(255):null;
    }
    return {dominant:dominant};
});
