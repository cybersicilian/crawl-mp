/* Exposed voxel surfaces and posed attachments, independent of any game or atlas. */
define([], function () {
    "use strict";
    var cache=new WeakMap();
    var directions=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
    var corners=[[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
        [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],
        [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]];
    function surface(volume){
        if(cache.has(volume))return cache.get(volume);
        var size=volume.size,occupied=new Map(),faces=[],step=volume.step;
        for(var i=0;i<volume.cells.length;i+=2)occupied.set(volume.cells[i],volume.cells[i+1]);
        function index(x,y,z){return x+size[0]*(y+size[1]*z);}
        occupied.forEach(function(material,at){
            var x=at%size[0],y=Math.floor(at/size[0])%size[1],z=Math.floor(at/(size[0]*size[1]));
            directions.forEach(function(normal,side){
                var next=[x+normal[0],y+normal[1],z+normal[2]];
                if(next.every(function(v,axis){return v>=0&&v<size[axis];})&&occupied.has(index.apply(null,next)))return;
                faces.push({normal:normal,material:volume.materials[material],points:corners[side].map(function(p){
                    return [volume.origin[0]+(x+p[0])*step,volume.origin[1]+(y+p[1])*step,volume.origin[2]+(z+p[2])*step];
                })});
            });
        });
        cache.set(volume,faces);return faces;
    }
    function pose(model,from,to,amount,palette,mirror){
        var chosen=amount>=.42?to:from,volume=model&&model.voxelPoses[chosen];if(!volume)return null;
        return {faces:surface(volume).map(function(face){
            var points=face.points.map(function(p){return [mirror?-p[0]:p[0],p[1],p[2]];});if(mirror)points.reverse();
            return {points:points,normal:[face.normal[0]*(mirror?-1:1),face.normal[1],face.normal[2]],
                colour:palette[face.material]||palette.surface||[140,140,130,255]};
        })};
    }
    function place(mesh,placement){
        var cosine=Math.cos(placement.pitch||0),sine=Math.sin(placement.pitch||0),mirror=placement.mirror?-1:1;
        function rotate(p){return [p[0]*mirror,p[1]*cosine-p[2]*sine,p[1]*sine+p[2]*cosine];}
        return {faces:mesh.faces.map(function(face){
            var points=face.points.map(function(p){var r=rotate(p.map(function(v){return v*(placement.scale||1);}));
                return [r[0]+placement.x*mirror,r[1]+placement.y,r[2]+placement.z];});
            if(placement.mirror)points.reverse();return {points:points,normal:rotate(face.normal),colour:face.colour};
        })};
    }
    function segment(a,b,width,depth,colour){
        function normalize(v){var length=Math.hypot.apply(null,v);return length>1e-8?v.map(function(n){return n/length;}):null;}
        function cross(u,v){return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];}
        var direction=normalize(b.map(function(v,i){return v-a[i];}));if(!direction)return {faces:[]};
        var right=normalize(cross(direction,Math.abs(direction[2])>.9?[0,1,0]:[0,0,1])),up=cross(right,direction),points=[];
        [a,b].forEach(function(center){[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(sign){
            points.push(center.map(function(v,i){return v+right[i]*width*sign[0]+up[i]*depth*sign[1];}));
        });});
        var middle=a.map(function(v,i){return (v+b[i])/2;});
        return {faces:[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]].map(function(indices){
            var face=indices.map(function(i){return points[i];});
            var normal=normalize(cross(face[1].map(function(v,i){return v-face[0][i];}),face[2].map(function(v,i){return v-face[0][i];})));
            if(normal.reduce(function(sum,v,i){return sum+v*(face[0][i]-middle[i]);},0)<0){face.reverse();normal=normal.map(function(v){return -v;});}
            return {points:face,normal:normal,colour:colour};
        })};
    }
    return {pose:pose,place:place,surface:surface,segment:segment};
});
