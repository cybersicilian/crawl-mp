/* Explicit door-only use of the approved oak asset; native states remain authoritative. */
define(["jquery", "./environment-art", "./tileinfo-dngn"],function($,art,tiles){
    "use strict";
    var cache=new Map(),names=new Map();
    Object.keys(tiles).forEach(function(name){if(Number.isInteger(tiles[name])&&!names.has(tiles[name]))names.set(tiles[name],name);});
    // Crops stay in the approved closed-door cell: rectangular oak and clean arch stone.
    var crops={panel:{x:177,y:200,w:192,h:205},frame:{x:221,y:48,w:59,h:48}};
    function sheet(){
        var image=document.getElementById(art.features.id);
        if(!image)return null;
        if(!image.getAttribute("src")&&image.dataset.src){
            $(image).off("load.firstPersonDoors").one("load.firstPersonDoors",function(){
                cache.clear();$(document).trigger("art_materials_ready");
            });
            image.src=image.dataset.src;
        }
        return image.complete&&image.naturalWidth?image:null;
    }
    function material(source,crop,width,height){
        var canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
        var ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=false;
        ctx.drawImage(source,crop.x,crop.y,crop.w,crop.h,0,0,width,height);
        return {image:canvas,pixelated:true,roughness:.78,metalness:0,sourceArt:art.features.file};
    }
    function nativePanel(source){
        if(!source)return null;
        var size=source.size||source.image.width;
        var result=material(source.image,{x:size*.28,y:size*.35,w:size*.44,h:size*.58},128,256);
        result.sourceArt="native";return result;
    }
    function identity(index){
        var base=tiles.basetile(index),name=names.get(base)||"";
        var closedName=name.replace(/OPEN|RUNED|SEALED|BROKEN/,"CLOSED");
        return {name:name,closed:Number.isInteger(tiles[closedName])?tiles[closedName]:tiles.DNGN_CLOSED_DOOR,
            clear:/CLEAR/.test(name),broken:/BROKEN/.test(name),marked:/RUNED|SEALED/.test(name)};
    }
    function difference(state,closed){
        if(!state||!closed||!state.pixels||!closed.pixels)return null;
        var size=state.size||state.image.width,other=closed.size||closed.image.width;
        if(size!==other)return null;
        var canvas=document.createElement("canvas");canvas.width=canvas.height=size;
        var ctx=canvas.getContext("2d"),mask=ctx.createImageData(size,size);
        var left=size,top=size,right=0,bottom=0,count=0;
        for(var i=0;i<mask.data.length;i+=4){
            var delta=Math.abs(state.pixels[i]-closed.pixels[i])+Math.abs(state.pixels[i+1]-closed.pixels[i+1])+Math.abs(state.pixels[i+2]-closed.pixels[i+2]);
            if(state.pixels[i+3]>192&&delta>65){
                for(var channel=0;channel<4;channel++)mask.data[i+channel]=state.pixels[i+channel];
                var x=i/4%size,y=Math.floor(i/4/size);
                left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);count++;
            }
        }
        if(!count)return null;
        ctx.putImageData(mask,0,0);
        return {image:canvas,bounds:{x:left,y:top,w:right-left,h:bottom-top},count:count};
    }
    function markings(target,state,closed,sealed){
        var mask=difference(state,closed);if(!mask)return;
        var ctx=target.image.getContext("2d"),bounds=mask.bounds,w=target.image.width,h=target.image.height;
        ctx.imageSmoothingEnabled=false;
        // Glyphs span the full native tile, independently of the cropped wood interior.
        var height=sealed?h*.95:Math.min(h*.28,w*.96*bounds.h/bounds.w);
        ctx.drawImage(mask.image,bounds.x,bounds.y,bounds.w,bounds.h,w*.02,sealed?h*.025:h*.28,w*.96,height);
        target.nativeMarkingBounds=bounds;target.nativeMarkingPixels=mask.count;
    }
    function panel(index,nativeTexture){
        var state=identity(index),source=sheet();
        // Broken silhouettes and glass panes must never become intact opaque oak.
        if(state.clear||state.broken||!source){
            var nativeResult=nativePanel(nativeTexture(state.marked||/OPEN/.test(state.name)?state.closed:index)||nativeTexture(state.closed));
            if(nativeResult&&state.marked)markings(nativeResult,nativeTexture(index),nativeTexture(state.closed),/SEALED/.test(state.name));
            return nativeResult;
        }
        var key="panel:"+index;if(cache.has(key))return cache.get(key);
        var result=material(source,crops.panel,128,256);result.authoredHardware=true;
        if(state.marked)markings(result,nativeTexture(index),nativeTexture(state.closed),/SEALED/.test(state.name));
        result.doorState=state.name;cache.set(key,result);return result;
    }
    function wood(index,nativeTexture){
        var source=sheet();if(!source)return nativePanel(nativeTexture(identity(index).closed));
        if(!cache.has("model-grain")){
            // Grain only: iron straps, the handle and glyphs are actual mesh components.
            var result=material(source,{x:215,y:252,w:79,h:62},64,128);
            result.roughness=.82;result.relief=.4;result.modelGrain=true;cache.set("model-grain",result);
        }
        return cache.get("model-grain");
    }
    function stairOverlay(index,nativeTexture){
        var name=names.get(tiles.basetile(index))||"";
        if(!/SEALED_STAIRS|ONE_WAY_STAIRS/.test(name))return null;
        var base=/STAIRS_UP/.test(name)?tiles.DNGN_STONE_STAIRS_UP:tiles.DNGN_STONE_STAIRS_DOWN;
        var mask=difference(nativeTexture(index),nativeTexture(base));if(!mask)return null;
        return {image:mask.image,pixelated:true,preservePalette:true,transparent:true,castShadow:false,
            sourceArt:"native",nativeMarkingPixels:mask.count};
    }
    function frame(fallback){
        var source=sheet();if(!source)return fallback;
        if(!cache.has("frame")){var result=material(source,crops.frame,64,64);result.tileScale=.42;result.roughness=.92;cache.set("frame",result);}
        return cache.get("frame");
    }
    return {panel:panel,wood:wood,frame:frame,stairOverlay:stairOverlay,identity:identity,clear:function(){cache.clear();}};
});
