/* Native semantic adapter for the same bounded material feathering used overhead. */
define(["./premium-terrain-model","terrain-surface"],function(nativeModel,surfaces){
    "use strict";
    var blend=surfaces.create({cell:64,period:1,maxScale:1,cacheSize:256,cacheBytes:4*1024*1024,surfaceBytes:2*1024*1024});
    var descriptors=new WeakMap(),results=new WeakMap();
    function describe(index){
        var profile=nativeModel.describe({t:{bg:index}});
        return profile&&profile.material||null;
    }
    function descriptor(cell){
        var source=cell.originalFloor||cell.floor;if(!source||!source.image)return null;
        var value=descriptors.get(source.image);
        if(!value){value={key:cell.fluid?cell.surfaceIndex:cell.floorIndex,image:source.image,rect:{x:0,y:0,w:source.size,h:source.size},shade:0};descriptors.set(source.image,value);}
        return value;
    }
    function eligible(cell){return cell&&!cell.solid&&cell.terrainFamily&&cell.floorMaterial&&(!cell.fluid||cell.fluid.kind==="water")&&!cell.connector&&!cell.fixture;}
    function prepare(cells,get){
        cells.forEach(function(cell){cell.originalFloor=cell.fluid?cell.floorMaterial:cell.floor;});
        cells.forEach(function(cell){
            if(!eligible(cell))return;
            var own=descriptor(cell),changed=false;
            if(!own)return;
            var neighbors=surfaces.offsets.map(function(offset){
                var other=get(cell.x+offset.x,cell.y+offset.y);
                if(!eligible(other)||Boolean(cell.fluid)!==Boolean(other.fluid))return own;
                if(cell.fluid&&other.fluid&&cell.fluid.depth===other.fluid.depth&&cell.fluid.murky===other.fluid.murky)return own;
                if(!cell.fluid&&other.terrainFamily===cell.terrainFamily)return own;
                var source=descriptor(other);if(source)changed=true;return source||own;
            });
            if(!changed)return;
            var image=blend.tile(own,neighbors,cell.x,cell.y,64);if(!image)return;
            var value=results.get(image);
            if(!value){value=Object.assign({},cell.floorMaterial,{image:image,pixels:image.getContext("2d").getImageData(0,0,64,64).data,
                size:64,sourceArt:"native",blended:true});results.set(image,value);}
            cell.floorMaterial=value;cell.floor=value;
        });
    }
    return {describe:describe,prepare:prepare,clear:function(){blend.clear();descriptors=new WeakMap();results=new WeakMap();},stats:blend.cacheStats};
});
