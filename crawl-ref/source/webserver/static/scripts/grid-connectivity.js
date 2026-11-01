/* Visible grid topology only. The caller supplies already-visible semantic cells.
 * Diagonal movement is represented by positive corner clearance, not new rules. */
define([],function(){
    "use strict";
    var cutSize=.26,patchMaterials=new WeakMap();
    function isDoor(cell){return Boolean(cell&&(cell.door||cell.kind==="door"||cell.kind==="open_door"));}
    function explicitAxis(cell){
        if(!cell)return null;
        if(cell.doorAxis==="h"||cell.doorAxis==="horizontal")return true;
        if(cell.doorAxis==="v"||cell.doorAxis==="vertical")return false;
        if(/^(left|right)$/.test(cell.doorSegment||""))return true;
        if(/^(up|down)$/.test(cell.doorSegment||""))return false;
        return null;
    }
    function door(cell,get){
        var x=cell.x,z=cell.y;
        function compatible(other,axis){var explicit=explicitAxis(other);return isDoor(other)&&(explicit===null||explicit===axis);}
        function infer(at){
            var explicit=explicitAxis(at);if(explicit!==null)return explicit;
            function run(axis){var count=0;
                [-1,1].forEach(function(sign){for(var n=1;n<=32;n++){
                    if(!compatible(get(at.x+(axis?n*sign:0),at.y+(axis?0:n*sign)),axis))break;count++;
                }});return count;
            }
            var h=run(true),v=run(false);if(h!==v)return h>v;
            function structural(a,b){var other=get(a,b);return Boolean(other&&other.solid&&!isDoor(other));}
            return Number(structural(at.x-1,at.y))+Number(structural(at.x+1,at.y))>=Number(structural(at.x,at.y-1))+Number(structural(at.x,at.y+1));
        }
        var horizontal=infer(cell);
        function joined(other){return isDoor(other)&&infer(other)===horizontal;}
        var before=joined(get(x-(horizontal?1:0),z-(horizontal?0:1)));
        var after=joined(get(x+(horizontal?1:0),z+(horizontal?0:1)));
        var segment=before&&after?"middle":before?(horizontal?"right":"down"):after?(horizontal?"left":"up"):cell.doorSegment||null;
        return {horizontal:horizontal,segment:segment,joinedBefore:before,joinedAfter:after,left:before?0:.09,right:after?1:.91};
    }
    function open(cell){return Boolean(cell&&cell.solid===false);}
    function floorMaterial(cell,fallback){
        var source=cell&&(cell.floorMaterial||cell.floor);source=source&&typeof source==="object"?source:fallback;
        if(!source||!source.image)return source;
        var w=source.image.width,h=source.image.height;
        if(!(w>0&&h>0&&(w&(w-1))===0&&(h&(h-1))===0))return source;
        var value=patchMaterials.get(source);
        if(!value){value=Object.assign({},source,{tileScale:1});patchMaterials.set(source,value);}
        return value;
    }
    function wall(mesh,options){
        var cell=options.cell,x=cell.x,z=cell.y,get=options.get,height=Number.isFinite(options.height)?options.height:3.35;
        var corners=[[0,0],[1,0],[1,1],[0,1]],outline=[],cuts=[];
        corners.forEach(function(corner,index){
            var dx=corner[0]===0?-1:1,dz=corner[1]===0?-1:1;
            var alongX=get(x+dx,z),alongZ=get(x,z+dz);
            if(!open(alongX)||!open(alongZ)){outline.push(corner);return;}
            var previous=corners[(index+3)%4],next=corners[(index+1)%4];
            var a=corner.map(function(v,axis){return v+(previous[axis]-v)*cutSize;});
            var b=corner.map(function(v,axis){return v+(next[axis]-v)*cutSize;});
            outline.push(a,b);cuts.push({corner:corner,a:a,b:b,
                neighbors:[{cell:alongX,x:x+dx,y:z},{cell:alongZ,x:x,y:z+dz}]});
        });
        var material=options.material,tile=material&&Number.isFinite(material.tileScale)&&material.tileScale>0?material.tileScale:1;
        var world=outline.map(function(p){return [x+p[0],z+p[1]];});
        var length=0;
        for(var n=0;n<world.length;n++){
            var a=world[n],b=world[(n+1)%world.length],edge=Math.hypot(b[0]-a[0],b[1]-a[1]);
            mesh.quad(material,[[a[0],0,a[1]],[a[0],height,a[1]],[b[0],height,b[1]],[b[0],0,b[1]]],
                [[length/tile,height/tile],[length/tile,0],[(length+edge)/tile,0],[(length+edge)/tile,height/tile]]);length+=edge;
        }
        var center=world.reduce(function(sum,p){return [sum[0]+p[0]/world.length,sum[1]+p[1]/world.length];},[0,0]);
        for(var i=0;i<world.length;i++){
            var a=world[i],b=world[(i+1)%world.length];
            mesh.quad(material,[[center[0],height,center[1]],[b[0],height,b[1]],[a[0],height,a[1]],[a[0],height,a[1]]],
                [[center[0]/tile,center[1]/tile],[b[0]/tile,b[1]/tile],[a[0]/tile,a[1]/tile],[a[0]/tile,a[1]/tile]]);
        }
        mesh.boxes.push({min:[x,0,z],max:[x+1,height,z+1],cell:{x:x,y:z},outline:world});
        function triangle(points,neighbors){
            var center=points.reduce(function(sum,p){return [sum[0]+p[0]/3,sum[1]+p[1]/3];},[0,0]);
            var neighbor=neighbors.slice().sort(function(a,b){
                return Math.hypot(x+center[0]-a.x-.5,z+center[1]-a.y-.5)-Math.hypot(x+center[0]-b.x-.5,z+center[1]-b.y-.5);
            })[0];
            var material=floorMaterial(neighbor.cell,options.floor);
            var points3=points.map(function(p){return [x+p[0],0,z+p[1]];});
            // Keep the integer-grid tile phase; clamping an outside-neighbor coordinate collapses the UV triangle.
            var uv=points.map(function(p){return [p[0],p[1]];});
            // Normalize winding for an upward floor normal.
            var signed=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);
            if(signed>0){points3.reverse();uv.reverse();}
            mesh.quad(material,[points3[0],points3[1],points3[2],points3[2]],[uv[0],uv[1],uv[2],uv[2]]);
            var coordinates=points.map(function(p){return [x+p[0],z+p[1]];});
            mesh.boxes.push({min:[Math.min.apply(null,coordinates.map(function(p){return p[0];})),-.04,Math.min.apply(null,coordinates.map(function(p){return p[1];}))],
                max:[Math.max.apply(null,coordinates.map(function(p){return p[0];})),0,Math.max.apply(null,coordinates.map(function(p){return p[1];}))],
                cell:{x:neighbor.x,y:neighbor.y},outline:coordinates});
        }
        cuts.forEach(function(cut){var mid=[(cut.a[0]+cut.b[0])/2,(cut.a[1]+cut.b[1])/2];
            triangle([cut.corner,cut.a,mid],cut.neighbors);triangle([cut.corner,mid,cut.b],cut.neighbors);
        });
        return {kind:"corner-clearance-wall",cuts:cuts.length,clearance:cutSize,outline:world};
    }
    function trim(mesh,options){
        var cell=options.cell,offset=options.offset;if(!cell||!offset)return null;
        var dx=offset[0],dz=offset[1],get=options.get,neighbor=get(cell.x+dx,cell.y+dz);
        if(!neighbor||!neighbor.solid||isDoor(neighbor))return null;
        var along=[dz?1:0,dx?1:0];
        var start=open(get(neighbor.x-along[0],neighbor.y-along[1]))?cutSize:0;
        var end=open(get(neighbor.x+along[0],neighbor.y+along[1]))?1-cutSize:1;
        var width=Number.isFinite(options.width)?options.width:.055,height=Number.isFinite(options.height)?options.height:.1;
        var min=dx?[cell.x+(dx>0?1-width:0),0,cell.y+start]:[cell.x+start,0,cell.y+(dz>0?1-width:0)];
        var max=dx?[cell.x+(dx>0?1:width),height,cell.y+end]:[cell.x+end,height,cell.y+(dz>0?1:width)];
        mesh.box(options.material,min,max,{x:cell.x,y:cell.y});
        return {start:start,end:end,cell:{x:cell.x,y:cell.y}};
    }
    return {door:door,wall:wall,trim:trim,isDoor:isDoor,cutSize:cutSize};
});
