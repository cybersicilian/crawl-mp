/* Visible-cell water basins. Geometry is cosmetic; native movement/eye height stays authoritative. */
define(["mesh-fluid"],function(fluid){
    "use strict";
    var sides=[[0,-1],[1,0],[0,1],[-1,0]],beds=new WeakMap();
    var dimensions=fluid.volume;
    function bed(source,profile){
        var variants=beds.get(source.image);
        if(!variants){variants=new Map();beds.set(source.image,variants);}
        var key=(profile.depth==="deep"?"deep":"shallow")+(profile.murky?":murky":"");
        if(!variants.has(key))variants.set(key,Object.assign({},source,{fluid:null,opacity:1,transmission:0,
            tint:profile.murky?[.42,.47,.28]:profile.depth==="deep"?[.2,.32,.35]:[.62,.68,.53],roughness:.97,castShadow:false}));
        return variants.get(key);
    }
    function edge(index,x,z,inset){
        if(index===0)return [[x+inset,z+inset],[x+1-inset,z+inset]];
        if(index===1)return [[x+1-inset,z+inset],[x+1-inset,z+1-inset]];
        if(index===2)return [[x+1-inset,z+1-inset],[x+inset,z+1-inset]];
        return [[x+inset,z+1-inset],[x+inset,z+inset]];
    }
    function curtain(mesh,material,a,b,top,bottom){
        mesh.quad(material,[[a[0],top,a[1]],[a[0],bottom,a[1]],[b[0],bottom,b[1]],[b[0],top,b[1]]],
            [[0,0],[1,0],[1,Math.max(.01,top-bottom)],[0,Math.max(.01,top-bottom)]]);
    }
    function build(mesh,options){
        var surface=options.surface,profile=surface&&surface.fluid,d=dimensions(profile);
        if(!d)return null;
        var x=options.x,z=options.z,neighbors=options.neighbors||[],banks=0,seals=0,steps=0;
        var substrate=options.bed||options.bank;
        mesh.floor(bed(substrate,profile),x,z,d.surface-d.depth);
        mesh.floor(surface,x,z,d.surface);
        sides.forEach(function(offset,index){
            var other=neighbors[index],a=edge(index,x,z,0),neighborProfile=other&&other.floorMaterial&&other.floorMaterial.fluid;
            var otherDepth=dimensions(neighborProfile);
            if(!other||other.visible===false||other.known===false){
                // A black volume seal hides the cut at fog without inventing a shoreline.
                curtain(mesh,options.dark,a[0],a[1],0,d.surface-d.depth);seals++;return;
            }
            if(otherDepth){
                if(otherDepth.depth<d.depth){curtain(mesh,options.bank,a[0],a[1],otherDepth.surface-otherDepth.depth,d.surface-d.depth);steps++;}
                return;
            }
            var inner=edge(index,x,z,.055);
            mesh.quad(options.bank,[[a[0][0],0,a[0][1]],[inner[0][0],d.surface-.012,inner[0][1]],
                [inner[1][0],d.surface-.012,inner[1][1]],[a[1][0],0,a[1][1]]]);
            curtain(mesh,options.bank,inner[0],inner[1],d.surface-.012,d.surface-d.depth);banks++;
        });
        // Pick the known water cell itself, including its transparent surface and basin.
        mesh.bounds([x,d.surface-d.depth,z],[x+1,d.surface-.001,z+1],options.cell||{x:x,y:z});
        return {kind:"water-basin",surface:d.surface,depth:d.depth,banks:banks,seals:seals,steps:steps};
    }
    return {build:build,dimensions:dimensions};
});
