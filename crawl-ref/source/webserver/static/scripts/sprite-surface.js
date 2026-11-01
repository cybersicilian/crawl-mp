/* Derive restrained surface detail from existing pixels. Albedo/alpha stay untouched.
 * RGB is tangent-space normal; A is roughness. No silhouette or volume inference. */
define([],function(){
    "use strict";
    function clamp(value,low,high){return Math.max(low,Math.min(high,value));}
    function bake(pixels,width,height,options){
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||pixels.length!==width*height*4)
            throw new Error("Surface pixels must match positive image dimensions");
        options=options||{};
        var roughness=Number.isFinite(options.roughness)?clamp(options.roughness,.2,1):.86;
        var strength=Number.isFinite(options.strength)?clamp(options.strength,0,1):.6;
        var result=new Uint8ClampedArray(pixels.length);
        function luminance(x,y,center){
            if(x<0||y<0||x>=width||y>=height)return center;
            var at=(y*width+x)*4;if(pixels[at+3]<128)return center;
            return (pixels[at]*.2126+pixels[at+1]*.7152+pixels[at+2]*.0722)/255;
        }
        for(var y=0;y<height;y++)for(var x=0;x<width;x++){
            var at=(y*width+x)*4,opaque=pixels[at+3]>=128;
            var center=luminance(x,y,0),dx=0,dy=0;
            if(opaque){
                dx=clamp(luminance(x+1,y,center)-luminance(x-1,y,center),-.22,.22)*strength;
                dy=clamp(luminance(x,y+1,center)-luminance(x,y-1,center),-.22,.22)*strength;
            }
            var length=Math.hypot(dx,dy,1);
            result[at]=Math.round((1-dx/length)*127.5);result[at+1]=Math.round((1+dy/length)*127.5);
            result[at+2]=Math.round((1+1/length)*127.5);
            result[at+3]=Math.round(clamp(roughness-Math.hypot(dx,dy)*.16,.2,1)*255);
        }
        return {data:result,width:width,height:height};
    }
    return {bake:bake};
});
