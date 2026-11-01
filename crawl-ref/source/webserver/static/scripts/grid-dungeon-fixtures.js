/* Low dungeon fixtures and level openings. Native identities/materials are supplied by the caller. */
define(["mesh-solids"],function(solids){
    "use strict";
    var supported=["shaft","hatch","plate","mechanical","alarm","sigil","web"];
    function openings(profile){
        var result={floor:null,ceiling:null};
        if(!profile)return result;
        if(profile.kind==="shaft")result.floor={left:.2,right:.8,front:.2,back:.8,bottom:-1.35};
        else if(profile.kind==="hatch"){
            var bounds={left:.24,right:.76,front:.24,back:.76};
            if(profile.direction==="up")result.ceiling=Object.assign({},bounds,{top:3.85});
            else result.floor=Object.assign({},bounds,{bottom:-.85});
        }
        return result;
    }
    function build(mesh,options){
        var profile=options.profile;if(!profile||supported.indexOf(profile.kind)<0)return null;
        var x=options.x,z=options.z,loc=options.cell,stone=options.stone,metal=options.metal,dark=options.dark;
        var holes=openings(profile),detail=options.detail;
        if(detail&&profile.active===false)detail=Object.assign({},detail,{emission:0});
        function box(material,u,y,v,U,Y,V){if(material)mesh.box(material,[x+u,y,z+v],[x+U,Y,z+V],loc);}
        function face(material,points,uv){
            if(!material)return;
            var world=points.map(function(p){return [x+p[0],p[1],z+p[2]];});mesh.quad(material,world,uv);
            if(loc&&mesh.bounds)mesh.bounds([0,1,2].map(function(axis){return Math.min.apply(null,world.map(function(p){return p[axis];}))-.001;}),
                [0,1,2].map(function(axis){return Math.max.apply(null,world.map(function(p){return p[axis];}))+.001;}),loc);
        }
        function floorDetail(height,size){
            if(!detail)return;var lo=.5-size/2,hi=.5+size/2;
            face(detail,[[lo,height,lo],[lo,height,hi],[hi,height,hi],[hi,height,lo]],[[0,0],[0,1],[1,1],[1,0]]);
        }
        function rim(hole,height){
            var L=hole.left,R=hole.right,F=hole.front,B=hole.back,w=.075;
            box(stone,L-w,-.045,F-w,L,.013,B+w);box(stone,R,-.045,F-w,R+w,.013,B+w);
            box(stone,L,-.045,F-w,R,.013,F);box(stone,L,-.045,B,R,.013,B+w);
            // Four sloped stone shoulders catch light without capping the opening.
            face(stone,[[L-w,height,F-w],[L,.013,F],[R,.013,F],[R+w,height,F-w]]);
            face(stone,[[R+w,height,F-w],[R,.013,F],[R,.013,B],[R+w,height,B+w]]);
            face(stone,[[R+w,height,B+w],[R,.013,B],[L,.013,B],[L-w,height,B+w]]);
            face(stone,[[L-w,height,B+w],[L,.013,B],[L,.013,F],[L-w,height,F-w]]);
        }
        function well(hole){
            var L=hole.left,R=hole.right,F=hole.front,B=hole.back,y=hole.bottom;
            var inset=profile.kind==="shaft"?.065:.025;
            face(stone,[[L,0,F],[L+inset,y,F+inset],[R-inset,y,F+inset],[R,0,F]]);
            face(stone,[[R,0,F],[R-inset,y,F+inset],[R-inset,y,B-inset],[R,0,B]]);
            face(stone,[[R,0,B],[R-inset,y,B-inset],[L+inset,y,B-inset],[L,0,B]]);
            face(stone,[[L,0,B],[L+inset,y,B-inset],[L+inset,y,F+inset],[L,0,F]]);
            box(dark,L+inset,y-.015,F+inset,R-inset,y,B-inset);
        }
        function lid(hole){
            var angle=Math.PI*.58,cs=Math.cos(angle),sn=Math.sin(angle),span=hole.back-hole.front;
            function point(u,v,depth){return [x+u,.045+v*sn+depth*cs,z+hole.back-v*cs+depth*sn];}
            for(var n=0;n<5;n++){
                var u=hole.left+n*(hole.right-hole.left)/5+.002,U=hole.left+(n+1)*(hole.right-hole.left)/5-.002;
                solids.prism(mesh,options.wood,[[u,0],[U,0],[U,span],[u,span]],-.018,.018,point,loc);
            }
            [.12,span-.12].forEach(function(v){
                solids.prism(mesh,metal,[[hole.left+.015,v],[hole.right-.015,v],
                    [hole.right-.015,v+.025],[hole.left+.015,v+.025]],-.026,.026,point,loc);
            });
            [hole.left+.08,hole.right-.08].forEach(function(u){box(metal,u,.008,hole.back-.022,u+.065,.08,hole.back+.024);});
        }
        if(holes.floor){
            rim(holes.floor,profile.kind==="shaft"?.035:.045);well(holes.floor);
            if(profile.kind==="hatch")lid(holes.floor);
            else {
                // A few chipped blocks break the rim silhouette; no stair or next floor is invented.
                [[.16,.3],[.79,.62],[.37,.17]].forEach(function(p){box(stone,p[0],.015,p[1],p[0]+.055,.065,p[1]+.055);});
            }
        }else if(holes.ceiling){
            var h=holes.ceiling,L=h.left,R=h.right,F=h.front,B=h.back;
            box(stone,L-.065,3.27,F-.065,L,3.4,B+.065);box(stone,R,3.27,F-.065,R+.065,3.4,B+.065);
            box(stone,L,3.27,F-.065,R,3.4,F);box(stone,L,3.27,B,R,3.4,B+.065);
            box(stone,L-.025,3.35,F-.025,L,h.top,B+.025);box(stone,R,3.35,F-.025,R+.025,h.top,B+.025);
            box(stone,L,3.35,F-.025,R,h.top,F);box(stone,L,3.35,B,R,h.top,B+.025);
            box(dark,L,h.top,F,R,h.top+.015,B);
            // Rails reach the floor and enter the real ceiling opening.
            [.31,.66].forEach(function(u){box(metal,u,.08,.72,u+.03,3.4,.755);});
            for(var rung=.18;rung<3.35;rung+=.235)box(metal,.31,rung,.707,.69,rung+.025,.765);
        }else {
            var plate=profile.kind==="plate"||profile.kind==="mechanical"||profile.kind==="alarm";
            if(plate){
                box(stone,.16,-.025,.16,.84,.009,.84);
                box(metal,.23,.009,.23,.77,.025,.77);
                [[.24,.24],[.72,.24],[.24,.72],[.72,.72]].forEach(function(p){box(metal,p[0],.025,p[1],p[0]+.035,.039,p[1]+.035);});
                if(profile.kind==="mechanical")for(var bar=0;bar<3;bar++)box(metal,.29+bar*.17,.025,.21,.315+bar*.17,.045,.79);
                if(profile.kind==="alarm")mesh.cylinder(metal,x+.5,.026,z+.5,.052,.055,loc,12);
                floorDetail(.047,.63);
            }else if(profile.kind==="sigil"){
                function point(u,v,depth){return [x+u,depth,z-v];}
                solids.ring(mesh,stone,.5,-.5,.335,.025,-.012,.018,point,loc,20);
                floorDetail(.021,.68);
            }else if(profile.kind==="web"){
                // Fine raised strands support the exact native web inlay, without a billboard.
                for(var thread=0;thread<8;thread++){
                    var a=thread*Math.PI/4,dx=Math.cos(a)*.35,dz=Math.sin(a)*.35;
                    var px=-Math.sin(a)*.002,pz=Math.cos(a)*.002;
                    face(metal,[[.5+px,.013,.5+pz],[.5+dx+px,.019,.5+dz+pz],
                        [.5+dx-px,.019,.5+dz-pz],[.5-px,.013,.5-pz]]);
                }
                floorDetail(.022,.8);
            }
        }
        return {kind:profile.kind==="hatch"?"hatch-"+(profile.direction==="up"?"up":"down"):profile.kind,
            custom:true,walkable:true,active:profile.active!==false,detail:Boolean(detail),openings:holes};
    }
    return {build:build,openings:openings};
});
