/* Visible party bodies from their actual layered native portraits. Never reveal through fog. */
define(["./native-tile-art","./creature-dimensions"],function(art,dimensions){
    "use strict";
    function eligible(hero,viewer,origin,cell){
        return Boolean(hero&&hero.pos&&Number.isInteger(hero.pos.x)&&Number.isInteger(hero.pos.y)
            &&(!viewer||!Number.isInteger(viewer.partySlot)||hero.slot!==viewer.partySlot)
            &&hero.on_same_level!==false&&hero.alive!==false&&!hero.ghost_haunting
            &&(!viewer||!(viewer.partyPlace||viewer.place)||!hero.place||hero.place===(viewer.partyPlace||viewer.place))
            &&(hero.pos.x!==origin.x||hero.pos.y!==origin.y)&&cell&&!cell.solid);
    }
    function append(sprites,members,viewer,origin,get,surfaceHeight){
        (members||[]).forEach(function(hero){
            var cell=hero.pos&&get(hero.pos.x,hero.pos.y);
            if(!eligible(hero,viewer,origin,cell))return;
            var existing=sprites.find(function(sprite){return sprite.layer==="actor"&&sprite.body&&sprite.x===hero.pos.x&&sprite.y===hero.pos.y;});
            if(existing){existing.partySlot=hero.slot;existing.label=hero.name;return;}
            var portrait=hero.equipment_profile&&hero.equipment_profile.portrait;if(!portrait)return;
            var image=document.createElement("canvas");image.width=image.height=64;
            if(!art.drawNative(image,portrait))return;
            var pixels=image.getContext("2d").getImageData(0,0,64,64).data;
            var left=64,right=0,top=64,bottom=0;
            for(var y=0;y<64;y++)for(var x=0;x<64;x++)if(pixels[(y*64+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
            if(right<=left||bottom<=top)return;
            var cropped=document.createElement("canvas");cropped.width=right-left;cropped.height=bottom-top;
            cropped.getContext("2d").drawImage(image,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
            var profile=dimensions.describe(null,hero,cropped.width/cropped.height,{});
            sprites.push({image:cropped,x:hero.pos.x,y:hero.pos.y,width:profile.width,height:profile.height,
                elevation:profile.elevation+surfaceHeight(hero.pos.x+.5,hero.pos.y+.5),body:true,layer:"actor",
                sourceArt:"native",pixelated:true,castsShadow:true,depth:Math.min(.8,profile.width*.6),
                size:profile.size,eye:profile.eye,partySlot:hero.slot,label:hero.name,
                hit:function(u,v){return pixels[((top+Math.max(0,Math.min(cropped.height-1,Math.floor(v*cropped.height))))*64+left+Math.max(0,Math.min(cropped.width-1,Math.floor(u*cropped.width))))*4+3]>24;}});
        });
    }
    return {eligible:eligible,append:append};
});
