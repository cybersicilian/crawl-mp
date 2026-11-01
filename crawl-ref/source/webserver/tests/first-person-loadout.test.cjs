const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
let model;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/first-person-loadout.js'),'utf8'), {
    define(deps, factory) { model = factory(); }
});
test('native equipped slots preserve dual wield, shields and two-handed occupancy without showing melded gear', () => {
    const hero = { equipment_profile: { version: 1,
        slots: [{type:'weapon',state:'equipped',inv_slot:1,name:'sword'},
            {type:'offhand',state:'equipped',inv_slot:2,name:'shield'},
            {type:'weapon_offhand',state:'equipped',inv_slot:3,name:'dagger'},
            {type:'twohander',state:'occupied',inv_slot:1},
            {type:'weapon',state:'melded',inv_slot:4}, {type:'weapon',state:'blocked',inv_slot:5}],
        items: [1,2,3,4,5].map(inv_slot=>({inv_slot,art:{layers:[]},...(inv_slot===2?{}:{hands:1})})) } };
    const items = model.held(hero, {});
    assert.deepEqual(Array.from(items,item=>item.slot), [1,2,3]);
    assert.deepEqual(Array.from(items,item=>item.side), ['main','offhand','offhand']);
    assert.equal(items[1].weapon,false); assert.equal(items[2].weapon,true);
    hero.equipment_profile.slots[0].state='melded'; hero.equipment_profile.slots[1].state='empty';
    assert.deepEqual(Array.from(model.held(hero,{}),item=>item.slot),[3]);
});
test('an empty authoritative profile overrides stale native indices; legacy stream keeps only actual wielded indices', () => {
    const player = { weapon_index:0,offhand_index:1,inv:{0:{name:'axe',tile:[3]},1:{name:'dagger',tile:[4]}} };
    assert.equal(model.held({equipment_profile:{version:1,slots:[],items:[]}},player).length,0);
    assert.equal(model.held(null,player).length,2);
    player.weapon_index=-1; player.offhand_index=-1; assert.equal(model.held(null,player).length,0);
});
test('authoritative action deltas animate once and never replay on control/floor/reset changes', () => {
    const tracker = model.tracker();
    const hero = {slot:0,player_id:'one',name:'Hero',place:'D:1',actions:[{category:'Attack',total:50},{category:'Melee',total:60}]};
    assert.equal(tracker.update(hero),null);
    hero.actions[0].total++;hero.actions[1].total+=2;assert.equal(tracker.update(hero),'attack');
    assert.equal(tracker.update(hero),null);
    hero.actions.push({category:'Cast',total:1});assert.equal(tracker.update(hero),'cast');
    hero.actions.push({category:'Block',total:1});assert.equal(tracker.update(hero),'block');
    hero.player_id='two';hero.actions[0].total=100;assert.equal(tracker.update(hero),null);
    hero.place='D:2';hero.actions[0].total++;assert.equal(tracker.update(hero),null);
    tracker.reset();assert.equal(tracker.update(hero),null);
    hero.actions_known=false;hero.actions[0].total++;assert.equal(tracker.update(hero),null);
});
test('native subtype count deltas identify an actual cast without guessing from a truncated leaderboard',()=>{
    const tracker=model.tracker(),hero={slot:0,player_id:'one',name:'Hero',place:'D:1',actions:[{category:'Cast',total:10,subtypes:[{name:'Fireball',count:6},{name:'Magic Dart',count:4}]}]};
    assert.equal(tracker.update(hero),null);
    hero.actions[0].total++;hero.actions[0].subtypes[1].count++;
    assert.equal(tracker.update(hero),'cast');assert.equal(tracker.detail().name,'Magic Dart');assert.equal(tracker.detail().category,'Cast');
    assert.equal(tracker.update(hero),null);assert.equal(tracker.detail(),null);
    hero.actions[0].total++;hero.actions[0].subtypes.push({name:'Old frequently used spell',count:30});
    assert.equal(tracker.update(hero),'cast');assert.equal(tracker.detail().name,null,'A newly reported old leaderboard row is not a new cast');
    hero.actions[0].total+=2;hero.actions[0].subtypes[0].count++;hero.actions[0].subtypes[1].count++;
    assert.equal(tracker.update(hero),'cast');assert.equal(tracker.detail().name,null,'Several casts in one batch have no provable order');
    hero.actions.push({category:'Invoke',total:1,subtypes:[{name:'Divine power',count:1}]});
    assert.equal(tracker.update(hero),'cast');assert.equal(tracker.detail().category,'Invoke');
    tracker.reset();assert.equal(tracker.detail(),null);
});
