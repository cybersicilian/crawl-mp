const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function grips(page,output){
    const backup=await page.evaluate(()=>({profile:JSON.parse(JSON.stringify(fixture.hero.equipment_profile)),actions:JSON.parse(JSON.stringify(fixture.hero.actions))}));
    async function alignment(side,support=false){
        const points=await page.evaluate(({side,support})=>{
            const hand=document.querySelector('.first-person-hand[data-side="'+side+'"]');
            const item=hand.parentElement.querySelector('.first-person-held-item'),key=support?'supportGrip':'grip';
            return {mode:hand.dataset.attachment,x:Number(hand.dataset.gripX),y:Number(hand.dataset.gripY),
                itemX:Number(item.dataset[key+'X']),itemY:Number(item.dataset[key+'Y']),height:hand.height,width:hand.width};
        },{side,support});
        assert(Math.abs(points.x-points.itemX)<.001);assert(Math.abs(points.y-points.itemY)<.001);
        assert.equal(points.height/points.width,1.5,'Forearm continues past the moving hand frame');return points;
    }
    assert.equal((await alignment('offhand')).mode,'center');
    await page.screenshot({path:path.join(output,'shield-center-grip.png')});
    await page.evaluate(()=>{
        fixture.hero.actions.push({category:'Block',total:1});jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=140;});
    });
    await page.waitForFunction(()=>Number(document.querySelector('.first-person-held-item[data-side=offhand]').dataset.wristYaw)>.1);
    await alignment('offhand');await page.screenshot({path:path.join(output,'shield-block-grip.png')});
    await page.evaluate(()=>document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>a.finish()));
    await page.waitForFunction(()=>!document.querySelector('.first-person-held').dataset.action);
    await page.evaluate(()=>{
        const p=fixture.hero.equipment_profile,index=fixture.main.WPN_GREAT_SWORD,i=fixture.main.get_tile_info(index);
        p.items[0].hands=2;p.items[0].art={texture:'main',layers:[{sx:i.sx,sy:i.sy,w:i.ex-i.sx,h:i.ey-i.sy,ox:i.ox+16-i.w/2,oy:i.oy+32-i.h,ymax:32}]};
        p.slots[0].name='great sword';p.slots[1].state='occupied';jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
    });
    assert.equal(await page.locator('.first-person-held-item').count(),1);
    assert.equal(await page.locator('.first-person-hand-group').count(),1,'Both hands belong to the same weapon rig');
    assert.equal((await alignment('main')).mode,'handle');assert.equal((await alignment('offhand',true)).mode,'support');
    await page.screenshot({path:path.join(output,'two-handed-grip.png')});
    await page.evaluate(()=>{
        fixture.hero.actions.push({category:'Attack',total:1});jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=198;});
    });
    await page.waitForFunction(()=>Number(document.querySelector('.first-person-held-item').dataset.wristYaw)>.5);
    await alignment('main');await alignment('offhand',true);
    await page.screenshot({path:path.join(output,'two-handed-strike-grip.png')});
    await page.evaluate(()=>document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(a=>a.finish()));
    await page.waitForFunction(()=>!document.querySelector('.first-person-held').dataset.action);
    await page.evaluate(backup=>{fixture.hero.equipment_profile=backup.profile;fixture.hero.actions=backup.actions;jQuery(document).trigger('party_state_rendered',[crawl_party.state]);},backup);
};
