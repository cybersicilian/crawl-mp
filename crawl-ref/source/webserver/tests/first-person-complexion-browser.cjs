const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function complexion(page,output){
    const proof=await page.evaluate(()=>new Promise((resolve,reject)=>require(['game/first-person-held','sprite-palette'],function(held,palette){
        const gallery=document.createElement('div');gallery.id='complexion_gallery';
        const style=document.createElement('style');style.textContent='#complexion_gallery{position:fixed;inset:0;z-index:10000;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:20px;background:#101820;box-sizing:border-box}#complexion_gallery figure{position:relative;overflow:hidden;margin:0;border:1px solid #62717d66;background:radial-gradient(ellipse at 50% 70%,#35424e,#131c25 80%)}#complexion_gallery figcaption{padding:12px;text-align:center;font:12px system-ui;background:#0a1016}#complexion_gallery .first-person-hand-group{width:100%!important;height:70%;left:0!important;right:0!important;bottom:0!important;transform:scale(1.4)}#complexion_gallery [data-side=offhand]{display:none}#complexion_gallery .body-reference{position:absolute;left:calc(50% - 48px);top:22%;width:96px;height:96px;image-rendering:pixelated}';
        gallery.append(style);document.body.append(gallery);fixture.complexions=[];
        const cases=[['Human · original','BASE_HUMAN'],['Human · darker variant','HUMAN_4'],['Green scales','BASE_DRACONIAN_GREEN'],['Gargoyle stone','BASE_GARGOYLE']];
        const facts=[];
        cases.forEach(([label,name])=>{
            const info=fixture.playerTiles.get_tile_info(fixture.playerTiles[name]);
            const host=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=label;host.append(caption);gallery.append(host);
            const reference=document.createElement('canvas');reference.width=reference.height=32;reference.className='body-reference';
            reference.getContext('2d').imageSmoothingEnabled=false;reference.getContext('2d').drawImage(document.getElementById('player'),info.sx,info.sy,info.ex-info.sx,info.ey-info.sy,0,0,info.ex-info.sx,info.ey-info.sy);host.append(reference);
            const expected=palette.dominant(reference.getContext('2d').getImageData(0,0,32,32).data).slice(0,3).join(',');
            const profile={version:1,hands:'hands',unarmed_attack:'Fists',slots:[],items:[],portrait:{texture:'player',layers:[{sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy,ox:0,oy:0,ymax:32}]}};
            const hero={...fixture.hero,equipment_profile:profile,spells:[]},player={...fixture.player,quiver_desc:''};
            let instance;instance=held.create(host,{onChange:()=>instance.update(player,hero,true)});instance.update(player,hero,true);fixture.complexions.push(instance);
            facts.push({label,expected});
        });resolve(facts);
    },reject)));
    await page.waitForFunction(()=>document.querySelectorAll('#complexion_gallery .first-person-hand').length===8);
    const actual=await page.locator('#complexion_gallery .first-person-hand[data-side="main"]').evaluateAll(nodes=>nodes.map(node=>({colour:node.dataset.surfaceColour,pixels:node.toDataURL()})));
    for(let i=0;i<actual.length;i++)assert.equal(actual[i].colour,proof[i].expected,proof[i].label+' retains its actual native body colour');
    assert.notEqual(actual[0].colour,actual[1].colour,'Actual darker human variant must not reuse BASE_HUMAN');
    assert.notEqual(actual[1].pixels,actual[2].pixels,'Scales must not be painted as human skin');
    await page.screenshot({path:path.join(output,'native-complexions.png')});
    await page.evaluate(()=>{fixture.complexions.forEach(instance=>instance.destroy());document.getElementById('complexion_gallery').remove();});
};
