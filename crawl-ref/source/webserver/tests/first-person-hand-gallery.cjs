const path=require('node:path');
module.exports=async function handGallery(page,output){
    await page.evaluate(()=>new Promise((resolve,reject)=>require(['game/first-person-held'],function(held){
        const gallery=document.createElement('div');gallery.id='hand_style_gallery';
        const style=document.createElement('style');style.textContent='#hand_style_gallery{position:fixed;inset:0;z-index:10000;background:#101820;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:20px;box-sizing:border-box}#hand_style_gallery figure{position:relative;overflow:hidden;margin:0;background:radial-gradient(ellipse at 50% 80%,#35424e,#131c25 80%);border:1px solid #62717d66}#hand_style_gallery figcaption{position:relative;z-index:5;padding:12px;text-align:center;font:12px system-ui;background:#0a1016}#hand_style_gallery .first-person-hand-group{width:100%!important;height:100%;left:0!important;right:0!important;bottom:-5%!important;transform:scale(1.25)}#hand_style_gallery [data-side=offhand]{display:none}';
        gallery.append(style);document.body.append(gallery);fixture.handGalleries=[];
        const main=fixture.main;
        const cases=[['Bare hands','hands',null],['Claws','claws',null],['Paws','paws',null],['Tentacles','tentacles',null],
            ['Leather gloves','hands','ARM_GLOVES'],['Runed wraps','hands','ARM_GLOVES_RUNED'],['Plate gloves','hands','ARM_GLOVES_SHINY'],['Golem gloves','hands','UNRAND_GOLEM_GLOVES']];
        cases.forEach(([label,hands,glove])=>{
            const host=document.createElement('figure');const caption=document.createElement('figcaption');caption.textContent=label+' · native ring assets';host.append(caption);gallery.append(host);
            const profile=JSON.parse(JSON.stringify(fixture.hero.equipment_profile));profile.hands=hands;profile.unarmed_attack=hands==='claws'?'Claws':'Fists';
            profile.slots=profile.slots.filter(slot=>slot.type==='ring');profile.items=profile.items.filter(item=>item.inv_slot>=10);
            if(glove){const info=main.get_tile_info(main[glove]);profile.slots.push({type:'hands',state:'equipped',inv_slot:20,name:label});profile.items.push({inv_slot:20,art:{texture:'main',layers:[{sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy,ox:0,oy:0,ymax:32}]}});}
            const hero={...fixture.hero,equipment_profile:profile,spells:[]},player={...fixture.player,quiver_desc:''};
            let instance;instance=held.create(host,{onChange:()=>instance.update(player,hero,true)});instance.update(player,hero,true);fixture.handGalleries.push(instance);
        });
        resolve();
    },reject)));
    await page.waitForFunction(()=>document.querySelectorAll('#hand_style_gallery .first-person-hand').length===16);
    await page.screenshot({path:path.join(output,'voxel-hands-gloves-rings.png')});
    await page.evaluate(()=>{fixture.handGalleries.forEach(instance=>instance.destroy());document.getElementById('hand_style_gallery').remove();});
};
