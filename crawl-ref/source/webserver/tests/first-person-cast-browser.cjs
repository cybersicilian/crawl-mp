/* The native cast record wins over the quivered spell, even with occupied hands. */
const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function cast(page,output){
    const backup=await page.evaluate(()=>{
        const backup={spells:fixture.hero.spells,actions:fixture.hero.actions,quiver:{}};
        ['quiver_item','quiver_available','quiver_desc'].forEach(key=>{backup.quiver[key]=fixture.player[key];});
        fixture.hero.spells=[{name:'Fireball',schools:'Conjuration/Fire'},{name:'Sandblast',schools:'Earth'}];
        fixture.player.quiver_item=-1;fixture.player.quiver_available=1;fixture.player.quiver_desc='f - Fireball';
        fixture.hero.actions=[{category:'Cast',total:10,subtypes:[{name:'Fireball',count:6},{name:'Sandblast',count:4}]}];
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(animation=>animation.finish());
        return backup;
    });
    assert.equal(await page.locator('.first-person-held-item').count(),2);
    assert.equal(await page.locator('.first-person-ready-magic').count(),0);
    await page.evaluate(()=>{
        fixture.hero.actions[0].total++;fixture.hero.actions[0].subtypes[1].count++;
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=240;});
    });
    await page.waitForFunction(()=>document.querySelector('.first-person-hand').dataset.pose==='cast');
    const glow=page.locator('.first-person-cast-glow');
    assert.equal(await glow.getAttribute('data-spell-name'),'Sandblast');
    assert.equal(await glow.getAttribute('data-effect'),'BOLT_SANDBLAST');
    await page.screenshot({path:path.join(output,'native-cast-occupied-hands.png')});
    await page.evaluate(backup=>{
        document.querySelector('.first-person-held').getAnimations({subtree:true}).forEach(animation=>animation.finish());
        fixture.hero.spells=backup.spells;fixture.hero.actions=backup.actions;
        ['quiver_item','quiver_available','quiver_desc'].forEach(key=>{
            if(backup.quiver[key]===undefined)delete fixture.player[key];else fixture.player[key]=backup.quiver[key];
        });
        jQuery(document).trigger('party_state_rendered',[crawl_party.state]);
    },backup);
};
