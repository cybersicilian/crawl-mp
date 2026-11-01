/* Interactive voxel inspection from exact native inventory layers. Never spends a turn. */
define(["./first-person-equipment-art","./player","./power-art","sprite-voxels"],function(equipment,player,powers,voxels){
    "use strict";
    function create(host){
        var canvas=document.createElement('canvas');canvas.width=canvas.height=512;canvas.className='first-person-stage-art';
        canvas.setAttribute('aria-label','Item preview. Drag to rotate.');canvas.tabIndex=0;canvas.setAttribute('role','img');
        host.append(canvas);var sampler=equipment.create(),model=null,yaw=-.3,pitch=-.12,drag=null,cache=new Map();
        function paint(){
            var ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,512);if(!model)return;
            var pose={yaw:yaw,pitch:pitch,materialLighting:'source'},bounds=voxels.bounds(model,pose);
            pose.scale=Math.min(380/bounds.width,380/bounds.height);pose.x=256-(bounds.left+bounds.right)/2*pose.scale;
            pose.y=256+(bounds.top+bounds.bottom)/2*pose.scale;voxels.paint(ctx,model,pose);
        }
        canvas.addEventListener('pointerdown',function(event){if(event.button!==0)return;drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);event.preventDefault();});
        canvas.addEventListener('pointermove',function(event){if(!drag)return;yaw+=(event.clientX-drag.x)*.012;pitch=Math.max(-1,Math.min(1,pitch+(event.clientY-drag.y)*.008));drag={x:event.clientX,y:event.clientY};paint();});
        function end(){drag=null;}canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
        canvas.addEventListener('keydown',function(event){
            if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
            event.preventDefault();event.stopPropagation();
            if(event.key==='Home'){yaw=-.3;pitch=-.12;}else if(event.key==='ArrowLeft')yaw-=.15;else if(event.key==='ArrowRight')yaw+=.15;
            else pitch=Math.max(-1,Math.min(1,pitch+(event.key==='ArrowUp'?.1:-.1)));paint();
        });
        return {show:function(hero,row){
            model=null;yaw=-.3;pitch=-.12;
            var source,key;
            if(row&&row.kind==='item'){
                var profile=hero&&hero.equipment_profile;
                var slot=Number.isInteger(row.data.slot)?row.data.slot:row.id;
                var item=profile&&Array.isArray(profile.items)&&profile.items.find(function(item){return item.inv_slot===slot;});
                var native=player.inv&&player.inv[slot];
                source=sampler.sample(row.missing&&row.data.art?{art:row.data.art}:item?{art:item.art}:native&&native.name===(row.data.source_name||row.data.name)?{tile:native.tile}:null);
                key=source&&source.key;
            }else if(row&&!row.missing&&powers.ready()&&powers.resolve(row.data,row.kind)!==null){
                var image=powers.create(row.data,row.kind);if(image&&image.width&&image.getContext){source={canvas:image,width:image.width,height:image.height};var atlas=document.getElementById('gui');key=JSON.stringify([row.kind,row.id,row.data.tile,atlas&&(atlas.currentSrc||atlas.src)]);}
            }
            if(source){model=cache.get(key);if(!model){model=voxels.build(source.canvas.getContext('2d').getImageData(0,0,source.width,source.height).data,source.width,source.height,{depth:row.kind==='item'?3:1.5,bevel:true});
                if(model){if(cache.size>=32)cache.clear();cache.set(key,model);}}}
            canvas.dataset.available=String(Boolean(model));canvas.setAttribute('aria-label',row?row.data.name+'. Drag or use arrow keys to rotate.':'No item selected');paint();
        },destroy:function(){cache.clear();canvas.remove();}};
    }
    return {create:create};
});
