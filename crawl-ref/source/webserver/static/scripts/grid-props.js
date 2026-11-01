/* Small native-material supports for existing sprites; no procedural object placement. */
define([],function(){
    "use strict";
    function build(mesh,options){
        if(!options||!options.profile||!options.profile.nativeSprite)return false;
        var support=options.profile.support;if(!support)return false;
        var material=options.materials&&options.materials[support.material];if(!material)return false;
        var x=options.x,z=options.z,y=Number.isFinite(options.elevation)?options.elevation:0;
        var cell=options.cell||{x:x,y:z};
        if(support.kind==="plinth"){
            var w=support.width,d=support.depth,h=support.height;
            mesh.box(material,[x+.5-w/2,y,z+.5-d/2],[x+.5+w/2,y+h,z+.5+d/2],cell);
            return true;
        }
        if(support.kind==="root-contact"){
            mesh.cylinder(material,x+.5,y,z+.5,support.radius,support.height,cell,8);return true;
        }
        return false;
    }
    return {build:build};
});
