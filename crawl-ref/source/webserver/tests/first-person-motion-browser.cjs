/* Prove geometry changes, independent guard hand, and exact return to rest. */
const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function motion(page,output){
    const baseline=await page.evaluate(()=>{
        fixture.motionActions=JSON.parse(JSON.stringify(fixture.hero.actions));
        const pixels=selector=>document.querySelector(selector).toDataURL();
        return {weapon:pixels('.first-person-held-item[data-side=main]'),shield:pixels('.first-person-held-item[data-side=offhand]'),
            hand:pixels('.first-person-hand[data-side=main]'),guard:pixels('.first-person-hand[data-side=offhand]')};
    });
    await page.evaluate(()=>{
        const entry=fixture.hero.actions.find(action=>action.category==='Attack');
        if(entry)entry.total++;else fixture.hero.actions.push({category:'Attack',total:1});
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=198;});
    });
    await page.waitForFunction(()=>Number(document.querySelector('.first-person-held-item[data-side=main]').dataset.wristYaw)>.5);
    const strike=await page.evaluate(()=>({weapon:document.querySelector('.first-person-held-item[data-side=main]').toDataURL(),
        shield:document.querySelector('.first-person-held-item[data-side=offhand]').toDataURL(),
        hand:document.querySelector('.first-person-hand[data-side=main]').toDataURL(),guard:document.querySelector('.first-person-hand[data-side=offhand]').toDataURL()}));
    assert.notEqual(strike.weapon,baseline.weapon,'Actual voxel projection changes; a CSS transform alone is insufficient');
    assert.notEqual(strike.hand,baseline.hand,'Weapon and wrist rotate together');
    assert.equal(strike.shield,baseline.shield,'Shield stays in its guard pose during a main-hand attack');
    assert.equal(strike.guard,baseline.guard);
    await page.screenshot({path:path.join(output,'voxel-wrist-strike.png')});
    await page.evaluate(()=>document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(animation=>animation.finish()));
    await page.waitForFunction(()=>!document.querySelector('.first-person-held').dataset.action);
    assert.equal(await page.locator('.first-person-held-item[data-side=main]').evaluate(canvas=>canvas.toDataURL()),baseline.weapon,'Recovery restores the exact original grip and scale');
    assert.equal(await page.locator('.first-person-hand[data-side=main]').evaluate(canvas=>canvas.toDataURL()),baseline.hand);
    await page.evaluate(()=>{fixture.hero.actions=fixture.motionActions;jQuery(document).trigger('party_state_rendered',[crawl_party.state]);});
};
