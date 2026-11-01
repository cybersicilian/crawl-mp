/* Optional Blender-authored hands; atlas colours come from the controlled hero. */
define(["require","./native-tile-art","foreground-mesh","sprite-voxels","./first-person-equipment-art","./native-appearance","sprite-palette","foreground-motion"],
function (require,art,geometry,painting,equipmentArt,appearance,pixels,motionPose) {
    "use strict";
    function create(onReady) {
        var library, loading=false, failed=false, destroyed=false, canvases=new Map(), palettes=new Map(), ringModels=new Map();
        var sampler=equipmentArt.create();
        function colour(source){
            if(!source)return null;
            var image=document.getElementById(source.texture),key=JSON.stringify([source,image&&(image.currentSrc||image.src)]);
            if(palettes.has(key))return palettes.get(key);
            var canvas=document.createElement("canvas");canvas.width=canvas.height=32;
            if(!art.drawNative(canvas,source))return null;
            var value=pixels.dominant(canvas.getContext("2d").getImageData(0,0,32,32).data);
            if(value){if(palettes.size>32)palettes.clear();palettes.set(key,value);}return value;
        }
        function palette(descriptor) {
            var skin=colour(appearance.bodyArt(descriptor.portrait))||[139,137,128,255];
            var surface=colour(descriptor.art)||skin;
            function shade(c,gain){return c.slice(0,3).map(function(v){return Math.max(0,Math.min(255,Math.round(v*gain)));}).concat(255);}
            return {skin:skin,surface:surface,seam:shade(surface,.48),lining:shade(surface,.7),
                metal:descriptor.art?shade(surface,1.15):[155,171,183,255],nail:shade(skin,1.65)};
        }
        function ringMesh(ring,align){
            var source=sampler.sample({art:ring.art});if(!source)return null;
            var key=source.key+Boolean(align);if(ringModels.has(key))return ringModels.get(key);
            var model=painting.build(source.canvas.getContext("2d").getImageData(0,0,32,32).data,32,32,{depth:2,bevel:true,alignAxis:Boolean(align)});
            if(model){if(ringModels.size>=24)ringModels.clear();ringModels.set(key,model);}return model;
        }
        function draw(canvas,kind,amount,phase) {
            var entry=canvases.get(canvas),model=library&&(library.models[entry.descriptor.model]||library.models.bare);if(!model)return;
            var descriptor=entry.descriptor,rest=descriptor.grip?"grip":"ready";
            var target=kind==="cast"?"cast":kind==="attack"?descriptor.unarmed?"strike":rest:rest;
            canvas.dataset.pose=target;canvas.dataset.amount=String(amount);
            var chosen=amount>=.42?target:rest;
            var delta=motionPose.at(kind,Math.round((phase||0)*20)/20,entry.group.dataset.side);
            var gripTarget=entry.attachment&&(entry.attachment.project?entry.attachment.project():entry.attachment.target);
            var viewKey=[chosen,delta.yaw,delta.pitch,delta.roll,gripTarget&&gripTarget.join(":")].join(":");
            if(entry.lastView===viewKey)return;entry.lastView=viewKey;
            var poseAmount=amount>=.42?1:0;
            var mesh=entry.meshes.get(chosen);
            if(!mesh){
            if(descriptor.art){
                var glove=ringMesh({art:descriptor.art},true);if(!glove)return;
                mesh=geometry.place(glove,{x:0,y:.4,z:0,scale:1.3/Math.max(glove.width,glove.height),mirror:descriptor.side==="offhand"});
            }else mesh=geometry.pose(model,rest,target,amount,entry.palette,descriptor.side==="offhand");
            (descriptor.rings||[]).forEach(function(ring){
                var a=model.anchors&&model.anchors[rest]&&model.anchors[rest][ring.finger];
                var b=model.anchors&&model.anchors[target]&&model.anchors[target][ring.finger];
                if(!a||!b)return;
                var anchor=a[0].map(function(v,i){return v+(b[0][i]-v)*poseAmount;});
                anchor[1]-=.16;
                var source=ringMesh(ring);if(!source)return;
                var jewel=geometry.place(source,{x:anchor[0],y:anchor[1],z:anchor[2]+.115,
                    pitch:a[1]+(b[1]-a[1])*poseAmount,scale:.3/Math.max(source.width,source.height),mirror:descriptor.side==="offhand"});
                mesh.faces=mesh.faces.concat(jewel.faces);
            });
            // The authored block wrist ends at y=-.2. Replace its short study
            // forearm with a connected arm that continues beyond the view.
            if(!descriptor.art)mesh={faces:mesh.faces.filter(function(face){return face.points.reduce(function(sum,p){return sum+p[1];},0)/face.points.length>=-.1999;})};
            entry.meshes.set(chosen,mesh);
            }
            canvas.dataset.rings=String((descriptor.rings||[]).length);canvas.dataset.ringSource="inventory-voxels";
            var pixel=document.createElement("canvas");pixel.width=64;pixel.height=96;
            var ctx=pixel.getContext("2d");
            var base={yaw:descriptor.side==="main"?-.25:.25,pitch:-.32,
                roll:descriptor.side==="main"?-.18:.18,scale:145/8,x:32,y:507/8,materialLighting:"source"};
            var palm=[0,.45,0],pivot=entry.attachment?palm:descriptor.art?[0,-.25,0]:[0,0,0];
            if(gripTarget)base=motionPose.align(base,palm,gripTarget.map(function(v){return v/8;}));
            var pose=motionPose.anchor(base,delta,pivot),drawMesh=mesh;
            var z=descriptor.art?-.18:0,end=motionPose.localPoint(pose,[descriptor.side==="main"?56:8,112],z);
            if(end){
                var arm=geometry.segment([descriptor.side==="main"?.05:-.05,descriptor.art?-.24:-.17,z],end,.25,descriptor.art?.12:.2,entry.palette.skin);
                drawMesh={faces:mesh.faces.concat(arm.faces)};
            }
            if(entry.attachment){
                var grip=painting.project(palm,pose);
                canvas.dataset.gripX=String((pose.x+grip[0]*pose.scale)*8);canvas.dataset.gripY=String((pose.y-grip[1]*pose.scale)*8);
            }
            painting.paint(ctx,drawMesh,pose);
            var outlined=document.createElement("canvas");outlined.width=64;outlined.height=96;
            var ink=outlined.getContext("2d");
            [[-1,0],[1,0],[0,-1],[0,1],[2,1]].forEach(function(offset){ink.drawImage(pixel,offset[0],offset[1]);});
            ink.globalCompositeOperation="source-in";ink.fillStyle="#0b1011";ink.fillRect(0,0,64,96);
            ink.globalCompositeOperation="source-over";ink.drawImage(pixel,0,0);
            var output=canvas.getContext("2d");output.clearRect(0,0,512,768);output.imageSmoothingEnabled=false;
            output.drawImage(outlined,0,0,512,768);
            canvas.dataset.pose=target;canvas.dataset.amount=String(amount);
        }
        function attach(group,descriptor,attachment) {
            if(!library) {
                if(!loading&&!failed) {
                    loading=true;
                    require(["/static/foreground/hands-v1.js"],function(value){
                        if(destroyed)return;library=value;loading=false;onReady();
                    },function(){failed=true;loading=false;});
                }
                return;
            }
            var canvas=document.createElement("canvas");canvas.width=512;canvas.height=768;
            canvas.className="first-person-hand";canvas.dataset.side=descriptor.side;canvas.dataset.model=descriptor.model;
            canvas.dataset.attachment=attachment?attachment.kind:"free";
            canvas.setAttribute("role","img");canvas.setAttribute("aria-label",descriptor.side+" hand: "+descriptor.label);
            canvas.dataset.sourceArt=descriptor.art?"inventory-voxels":"blender-blocks";group.prepend(canvas);
            var colours=palette(descriptor);canvas.dataset.surfaceColour=colours.surface.slice(0,3).join(",");
            canvases.set(canvas,{descriptor:descriptor,palette:colours,group:group,attachment:attachment,meshes:new Map()});draw(canvas,"rest",0,0);
        }
        return {attach:attach,pose:function(kind,amount,phase,groups){canvases.forEach(function(entry,canvas){
                var moving=!groups||groups.has(entry.group);draw(canvas,moving?kind:"rest",moving?amount:0,moving?phase:0);
            });},
            clear:function(){canvases.clear();},invalidate:function(){palettes.clear();ringModels.clear();},
            destroy:function(){destroyed=true;canvases.clear();palettes.clear();ringModels.clear();}};
    }
    return {create:create};
});
