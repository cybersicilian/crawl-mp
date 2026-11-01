const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function partyLoot(page,output){
    const proof=await page.evaluate(()=>new Promise(resolve=>require(['grid-mesh-paint','game/first-person-highlight'],function(paint,highlight){
        fixture.partyLootFg=fixture.map.get(8,6).t.fg||0;
        fixture.map.merge([{x:8,y:6,t:{fg:fixture.main.WPN_DAGGER}}]);
        fixture.scene.heroes([fixture.hero]);
        const floor=fixture.scene.build(fixture.player.pos,fixture.hero).sprites.find(s=>s.x===8&&s.y===6&&s.layer==='actor');
        fixture.scene.heroes(crawl_party.state.members);
        const scene=fixture.scene.build(fixture.player.pos,fixture.hero),at=scene.sprites.filter(s=>s.x===8&&s.y===6&&s.layer==='actor');
        const body=at.find(s=>s.body),loot=at.find(s=>!s.body);
        const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;
        const painter=paint.create(canvas),camera={x:8.5,y:8.5,angle:-Math.PI/2,pitch:0,height:1.1};painter.paint(scene,camera);
        const p=body&&highlight.project(camera,[8.5,body.elevation+body.height*.6,6.5],600,400);
        const result={count:at.length,subject:scene.subject(8,6).label,bodyLabel:body&&body.label,lootLabel:loot&&loot.label,
            lootUnchanged:Boolean(loot&&floor&&loot.image.toDataURL()===floor.image.toDataURL()),
            floorHeight:floor&&floor.height,lootHeight:loot&&loot.height,bodyHeight:body&&body.height,pick:p&&painter.pick(p.x,p.y)};
        const view=document.getElementById('first_person_dungeon');
        fixture.partyHover=body&&highlight.project({...camera,pitch:Number(view.dataset.cameraPitch),height:Number(view.dataset.eyeHeight)},
            [8.5,body.elevation+body.height*.6,6.5],view.width,view.height);
        painter.destroy();resolve(result);
    })));
    assert.equal(proof.count,2,'A companion and the floor item remain separate sprites');
    assert.equal(proof.subject,'Companion');assert.equal(proof.bodyLabel,'Companion');assert.notEqual(proof.lootLabel,'Companion');
    assert(proof.lootUnchanged);assert.equal(proof.lootHeight,proof.floorHeight);assert(proof.bodyHeight>proof.lootHeight);
    assert.equal(proof.pick.x,8);assert.equal(proof.pick.y,6);
    const pointer=await page.evaluate(()=>{
        const view=document.getElementById('first_person_dungeon'),rect=view.getBoundingClientRect(),p=fixture.partyHover;
        return {x:rect.left+p.x/view.width*rect.width,y:rect.top+p.y/view.height*rect.height};
    });
    await page.mouse.move(pointer.x,pointer.y);
    await page.waitForFunction(()=>document.querySelector('.first-person-target strong').textContent==='Companion');
    assert.equal(await page.locator('.first-person-highlight').getAttribute('data-target'),'8:6');
    await page.screenshot({path:path.join(output,'companion-over-floor-loot.png')});
    await page.evaluate(()=>fixture.map.merge([{x:8,y:6,t:{fg:fixture.partyLootFg}}]));
};
