/* Called from the real 3D fixture: native atlases, Blender data, ray picker and events. */
const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function verifyHands(page,output){
    await page.evaluate(()=>{
        fixture.handBackup={profile:JSON.parse(JSON.stringify(fixture.hero.equipment_profile)),spells:fixture.hero.spells,
            actions:JSON.parse(JSON.stringify(fixture.hero.actions)),members:crawl_party.state.members};
        const info=fixture.playerTiles.get_tile_info(fixture.playerTiles.BASE_HUMAN);
        fixture.hero.equipment_profile.hands='hands';fixture.hero.equipment_profile.unarmed_attack='Fists';
        fixture.hero.equipment_profile.portrait.layers.unshift({sx:info.sx,sy:info.sy,w:info.ex-info.sx,h:info.ey-info.sy,ox:0,oy:0,ymax:32});
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
    });
    await page.waitForFunction(()=>document.querySelectorAll('.first-person-hand').length===2);
    assert.equal(await page.locator('.first-person-hand[data-model="bare"]').count(),2);
    await require("./first-person-grip-browser.cjs")(page,output);
    await require("./first-person-motion-browser.cjs")(page,output);
    await require("./first-person-cast-browser.cjs")(page,output);
    await page.evaluate(()=>{
        const p=fixture.hero.equipment_profile,main=fixture.main;
        function art(index){const i=main.get_tile_info(index);return {texture:'main',layers:[{sx:i.sx,sy:i.sy,w:i.ex-i.sx,h:i.ey-i.sy,ox:0,oy:0,ymax:32}]};}
        const rings=Object.keys(main).filter(name=>/^RING_/.test(name)&&Number.isInteger(main[name]));
        fixture.ringArt=[art(main[rings[0]]),art(main[rings[1]])];
        p.hands='claws';p.unarmed_attack='Claws';p.slots=[0,1].map(i=>({type:'ring',state:'equipped',inv_slot:10+i,name:i?'opal ring':'ruby ring'}));
        p.items=fixture.ringArt.map((art,i)=>({inv_slot:10+i,art}));
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
    });
    await page.waitForFunction(()=>document.querySelectorAll('.first-person-hand[data-model="claws"]').length===2);
    assert.equal(await page.locator('.first-person-held-item').count(),0);
    assert.equal(await page.locator('.first-person-hand[data-rings="1"][data-ring-source="inventory-voxels"]').count(),2);
    await page.screenshot({path:path.join(output,'claws-and-rings.png')});
    await page.evaluate(()=>{
        fixture.hero.actions.push({category:'Attack',total:1});jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=180;});
    });
    await page.waitForFunction(()=>Number(document.querySelector('.first-person-hand').dataset.amount)>.9);
    await page.screenshot({path:path.join(output,'claw-strike.png')});
    await page.evaluate(()=>{
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>a.finish());
        fixture.hero.equipment_profile.hands='hands';fixture.hero.equipment_profile.unarmed_attack='Fists';
        fixture.hero.spells=[{name:'Fireball',schools:'Conjuration/Fire',tile:fixture.main.SPELL_FIREBALL,casting_cost:{payable:true}}];
        fixture.player.quiver_item=-1;fixture.player.quiver_available=1;fixture.player.quiver_desc='f - Fireball';
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
    });
    assert.equal(await page.locator('.first-person-ready-magic[data-school="flame"]').count(),1);
    await page.screenshot({path:path.join(output,'readied-magic.png')});
    await page.evaluate(()=>{
        fixture.hero.actions.push({category:'Cast',total:1,subtypes:[{name:'Fireball',count:1}]});jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=240;});
    });
    await page.waitForFunction(()=>document.querySelector('.first-person-hand').dataset.pose==='cast');
    await page.screenshot({path:path.join(output,'articulated-cast.png')});
    await page.evaluate(()=>document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>a.finish()));
    await page.evaluate(()=>{
        const friend={...fixture.hero,slot:1,name:'Companion',pos:{x:8,y:6},on_same_level:true};
        crawl_party.state.members=[fixture.hero,friend,{...friend,slot:2,name:'Other floor',place:'D:2',pos:{x:7,y:6}},{...friend,slot:3,name:'Fogged',pos:{x:8,y:2}}];
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
    });
    const party=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint','game/first-person-highlight'],function(paint,highlight){
        const scene=fixture.scene.build(fixture.player.pos,fixture.hero),canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;
        const painter=paint.create(canvas),camera={x:8.5,y:8.5,angle:-Math.PI/2,pitch:0,height:1.1};painter.paint(scene,camera);
        const friend=scene.sprites.find(s=>s.label==='Companion');
        const p=friend&&highlight.project(camera,[8.5,friend.elevation+friend.height*.55,6.5],600,400);
        const result={labels:scene.sprites.map(s=>s.label),party:friend&&friend.partySlot,pick:p&&painter.pick(p.x,p.y)};
        painter.destroy();resolve(result);
    })));
    assert.equal(party.party,1);assert(!party.labels.includes('Other floor'));assert(!party.labels.includes('Fogged'));
    assert.equal(party.pick.x,8);assert.equal(party.pick.y,6,'Actual ray picker hits the layered party sprite');
    await page.screenshot({path:path.join(output,'visible-companion.png')});
    await require('./first-person-party-loot-browser.cjs')(page,output);
    await require("./first-person-hand-gallery.cjs")(page,output);
    await require("./first-person-complexion-browser.cjs")(page,output);
    await page.evaluate(()=>{
        fixture.hero.equipment_profile=fixture.handBackup.profile;fixture.hero.spells=fixture.handBackup.spells;
        fixture.hero.actions=fixture.handBackup.actions;crawl_party.state.members=fixture.handBackup.members;
        delete fixture.player.quiver_desc;delete fixture.player.quiver_available;delete fixture.player.quiver_item;
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
    });
    assert.equal(await page.locator('.first-person-held-item').count(),2);
};
