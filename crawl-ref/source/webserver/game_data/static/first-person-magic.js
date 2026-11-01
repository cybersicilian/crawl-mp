/* Readied spell effects reuse native effect sprites, with the same voxel language as equipment. */
define(["./native-tile-art","./tileinfo-main","sprite-voxels"],function(art,tiles,voxels){
    "use strict";
    var effects={flame:"BOLT_FLAME",frost:"BOLT_FROST",lightning:"BOLT_WEAK_ELEC",soul:"BOLT_DRAIN",
        earth:"BOLT_SANDBLAST",venom:"BOLT_POISON_ARROW",summoning:"BOLT_DEFAULT_MAGENTA",arcane:"BOLT_DEFAULT_BLUE"};
    function paint(canvas,kind){
        canvas.width=canvas.height=64;delete canvas.dataset.effect;delete canvas.dataset.sourceArt;
        var effect=effects[kind]||effects.arcane,index=tiles[effect];if(!Number.isInteger(index))return false;
        var source=document.createElement("canvas");source.width=source.height=32;
        if(!art.drawIndices(source,[index],tiles))return false;
        var model=voxels.build(source.getContext("2d").getImageData(0,0,32,32).data,32,32,{depth:2,bevel:true});
        if(!model)return false;
        canvas.width=canvas.height=64;var pose={yaw:.25,pitch:.2,materialLighting:"source"},bounds=voxels.bounds(model,pose);
        pose.scale=Math.min(54/bounds.width,54/bounds.height);pose.x=32-(bounds.left+bounds.right)/2*pose.scale;
        pose.y=32+(bounds.top+bounds.bottom)/2*pose.scale;
        voxels.paint(canvas.getContext("2d"),model,pose);canvas.dataset.sourceArt="native-effect";canvas.dataset.effect=effect;return true;
    }
    return {paint:paint};
});
