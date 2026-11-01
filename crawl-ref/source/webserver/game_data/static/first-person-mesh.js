/* Native semantic cells become reusable meshes; only known cells supply geometry. */
define(["mesh-geometry", "./first-person-materials", "grid-architecture", "grid-props", "grid-loot", "grid-water", "grid-dungeon-fixtures", "grid-connectivity"], function (geometry, materials, architecture, props, loot, water, fixtures, connectivity) {
    "use strict";
    function build(cells, get, sprites) {
        var mesh=geometry.create(),lights=[];
        var stone=Object.assign({},materials.get("stone",materials.color("#626158")),{roughness:.88});
        var wood=Object.assign({},materials.get("wood",materials.color("#4c3320")),{roughness:.94});
        var ceiling=Object.assign({},materials.get("ceiling",stone),{castShadow:false});
        var iron=Object.assign({},materials.color("#292e30"),{roughness:.32,metalness:.85});
        var doorIron=Object.assign({},materials.color("#595954"),{roughness:.42,metalness:.7});
        var rune=Object.assign({},materials.color("#dfa338"),{emission:.12,roughness:.3,metalness:.38});
        var seal=Object.assign({},materials.color("#57a86a"),{emission:.17,roughness:.42});
        var gold=Object.assign({},materials.color("#d3a32c"),{finish:"gold",metalness:1,roughness:.34,goldGlint:.18});
        var goldRim=Object.assign({},gold,{roughness:.25,tint:[.92,.84,.63]});
        var stack=Object.assign({},materials.color("#45464b"),{roughness:.96,metalness:0,stackMarker:true});
        var dark=materials.color("#0a1118"),rim=Object.assign({},stone,{tint:[.75,.77,.72]});
        function trim(x,z,dx,dz){
            return connectivity.trim(mesh,{cell:get(x,z),get:get,offset:[dx,dz],material:rim,height:.1,width:.055});
        }
        function torch(cell,loc){
            [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(o){
                var neighbor=get(cell.x+o[0],cell.y+o[1]);if(!neighbor||neighbor.solid)return;
                var x=cell.x+.5+o[0]*.64,z=cell.y+.5+o[1]*.64;
                lights.push({position:[x,2.18,z],color:cell.light.color,strength:cell.light.strength,kind:"torch"});
                mesh.box(iron,[Math.min(x,x-o[0]*.18)-.04,1.58,Math.min(z,z-o[1]*.18)-.04],
                    [Math.max(x,x-o[0]*.18)+.04,1.66,Math.max(z,z-o[1]*.18)+.04],loc);
                mesh.box(wood,[x-.025,1.62,z-.025],[x+.025,2.08,z+.025],loc);
                mesh.cylinder(iron,x,2.03,z,.06,.09,loc,8);
                if(cell.flameMaterial){
                    var flame=Object.assign({},cell.flameMaterial,{castShadow:false,emission:1.25,transparent:true});
                    mesh.quad(flame,[[x-.11,2.09,z],[x+.11,2.09,z],[x+.11,2.42,z],[x-.11,2.42,z]]);
                    mesh.quad(flame,[[x,2.09,z-.11],[x,2.09,z+.11],[x,2.42,z+.11],[x,2.42,z-.11]]);
                }
            });
        }
        cells.forEach(function(cell){
            var x=cell.x,z=cell.y,loc={x:x,y:z};
            var floor=cell.floorMaterial||materials.get("floor",cell.floor||stone);
            var ground=!cell.solid||cell.kind==="door"||cell.transparent;
            var openings=cell.fixture?fixtures.openings(cell.fixture):{floor:null,ceiling:null};
            var basin=water.dimensions(floor.fluid);
            if(basin)cell.waterModel=water.build(mesh,{x:x,z:z,surface:floor,bed:cell.waterBed||materials.get("floor",stone),bank:cell.waterBed||materials.get("floor",stone),dark:dark,cell:loc,
                neighbors:[[0,-1],[1,0],[0,1],[-1,0]].map(function(o){return get(x+o[0],z+o[1]);})});
            function pieces(hole){
                return hole?[[0,0,hole.left,1],[hole.right,0,1,1],[hole.left,0,hole.right,hole.front],[hole.left,hole.back,hole.right,1]]:[[0,0,1,1]];
            }
            if(ground&&!basin&&cell.kind!=="stairs_down")pieces(openings.floor).forEach(function(r){
                mesh.quad(floor,[[x+r[0],0,z+r[1]],[x+r[0],0,z+r[3]],[x+r[2],0,z+r[3]],[x+r[2],0,z+r[1]]],
                    [[r[0],r[1]],[r[0],r[3]],[r[2],r[3]],[r[2],r[1]]]);
                mesh.box(dark,[x+r[0],-.06,z+r[1]],[x+r[2],-.025,z+r[3]],loc);
            });
            if(ground)pieces(openings.ceiling).forEach(function(r){
                mesh.quad(ceiling,[[x+r[0],3.35,z+r[1]],[x+r[2],3.35,z+r[1]],[x+r[2],3.35,z+r[3]],[x+r[0],3.35,z+r[3]]],
                    [[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]],.72);
            });
            if(cell.kind==="door"||cell.kind==="open_door"){
                var topology=connectivity.door(cell,get);
                cell.model=architecture.door(mesh,Object.assign({x:x,z:z,open:cell.kind==="open_door",frame:cell.doorFrameMaterial||stone,wall:stone,
                    panel:cell.transparent?Object.assign({},materials.color("#80b5c4"),{opacity:.24,transmission:.84,roughness:.13,castShadow:false}):cell.doorMaterial||wood,
                    metal:doorIron,rune:rune,seal:seal,runed:cell.runed,sealed:cell.sealed,broken:cell.broken,clear:cell.transparent,cell:loc},topology));
            }else if(cell.solid){
                cell.wallModel=connectivity.wall(mesh,{cell:cell,get:get,material:cell.wallMaterial||stone,floor:materials.get("floor",stone),height:3.35});
            }else{
                [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(o){
                    var neighbor=get(x+o[0],z+o[1]);
                    if(neighbor&&neighbor.solid)trim(x,z,o[0],o[1]);
                    if(!neighbor){
                        if(o[0])mesh.box(dark,[x+(o[0]>0?.99:0),0,z],[x+(o[0]>0?1:.01),3.4,z+1]);
                        else mesh.box(dark,[x,0,z+(o[1]>0?.99:0)],[x+1,3.4,z+(o[1]>0?1:.01)]);
                    }
                });
                if(cell.kind==="stairs_up"||cell.kind==="stairs_down"){
                    architecture.stairs(mesh,{x:x,z:z,down:cell.kind==="stairs_down",stone:stone,rim:rim,dark:dark,cell:loc});
                }else if(cell.kind==="fountain"){
                    mesh.cylinder(stone,x+.5,.02,z+.5,.42,.28,loc,16);
                    var fountainName=cell.prop&&cell.prop.source&&cell.prop.source.name||"";
                    if(!/DRY/.test(fountainName))mesh.cylinder(cell.basinMaterial||materials.color("#247a9b"),x+.5,.3,z+.5,.35,.02,loc,16);
                    mesh.cylinder(stone,x+.5,.31,z+.5,.09,.9,loc,10);
                    if(/BLUE|SPARKLING/.test(fountainName))lights.push({position:[x+.5,.8,z+.5],color:[.25,.65,1],strength:.7});
                }
            }
            if(cell.fixture)cell.model=fixtures.build(mesh,{x:x,z:z,profile:cell.fixture,stone:stone,wood:wood,metal:iron,dark:dark,detail:cell.fixtureMaterial,cell:loc});
            else if(cell.connector){
                if(cell.connector.kind==="hatch")cell.model=architecture.hatch(mesh,{x:x,z:z,up:cell.connector.direction==="up",frame:stone,panel:wood,metal:iron,dark:dark,cell:loc});
                else cell.model=architecture.gateway(mesh,{x:x,z:z,kind:cell.connector.kind,frame:cell.doorFrameMaterial||stone,wall:stone,metal:iron,dark:dark,inset:cell.connectorInset,cell:loc});
            }
            if(cell.itemProfile)cell.lootModel=loot.build(mesh,{x:x,z:z,profile:cell.itemProfile,elevation:architecture.surfaceHeight(cell.kind,.5,.5),gold:gold,goldRim:goldRim,stack:stack,cell:loc});
            if(cell.prop)props.build(mesh,{x:x,z:z,profile:cell.prop,materials:{stone:stone,wood:wood},elevation:architecture.surfaceHeight(cell.kind,.5,.5),cell:loc});
            if(cell.connectorMaterial)architecture.overlay(mesh,{x:x,z:z,kind:cell.kind,material:cell.connectorMaterial});
            if(cell.targetMaterial)architecture.overlay(mesh,{x:x,z:z,kind:cell.kind,material:cell.targetMaterial});
            if(cell.light){
                if(cell.solid)torch(cell,loc);
                else lights.push({position:[x+.5,.35,z+.5],color:cell.light.color,strength:cell.light.strength,kind:"lava"});
            }
        });
        sprites.forEach(function(sprite){sprite.material=Object.assign({},sprite.surface||{},{image:sprite.image,actor:true,pixelated:sprite.pixelated!==false,
            preservePalette:true,castShadow:sprite.castsShadow!==false,opacity:sprite.opacity===undefined?1:sprite.opacity});});
        return {mesh:mesh,lights:lights};
    }
    return {build:build,surfaceHeight:architecture.surfaceHeight};
});
