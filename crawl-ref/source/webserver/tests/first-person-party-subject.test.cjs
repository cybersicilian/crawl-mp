const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
function load(file,deps={},globals={}){let result;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{...globals,define(names,factory){result=factory(...names.map(name=>deps[name]));}});return result;}
test('floor loot cannot stand in for a companion portrait or inherit the companion name',()=>{
    let requested=0;
    const party=load('game_data/static/first-person-party.js',{'./native-tile-art':{drawNative(){requested++;return false;}}},{document:{createElement(){return {};}}});
    const loot={x:2,y:2,layer:'actor',body:false,label:'dagger'},sprites=[loot];
    const member={slot:1,name:'Companion',place:'D:1',pos:{x:2,y:2},equipment_profile:{portrait:{texture:'player',layers:[]}}};
    party.append(sprites,[member],{partySlot:0,partyPlace:'D:1'},{x:1,y:1},()=>({solid:false}),()=>0);
    assert.equal(requested,1,'The real portrait must still be requested when floor loot occupies the tile');
    assert.equal(loot.label,'dagger');assert.equal(loot.partySlot,undefined);
});
const subjects=load('static/scripts/sprite-subject.js');
test('inspection picks a body ahead of its floor item while preserving ordinary item inspection',()=>{
    const loot={x:2,y:2,layer:'actor',body:false,label:'dagger'},hero={x:2,y:2,layer:'actor',body:true,label:'Companion'};
    assert.equal(subjects.at([loot,hero],2,2),hero);assert.equal(subjects.at([hero,loot],2,2),hero);
    assert.equal(subjects.at([loot],2,2),loot);assert.equal(subjects.at([hero],3,3),null);
    assert.equal(subjects.at([{...hero,layer:'cloud'}],2,2),null);
});
test('an actual native body is reused without duplicating it',()=>{
    let requested=0;
    const party=load('game_data/static/first-person-party.js',{'./native-tile-art':{drawNative(){requested++;return false;}}});
    const body={x:2,y:2,layer:'actor',body:true,label:'native player'},sprites=[body];
    party.append(sprites,[{slot:1,name:'Companion',place:'D:1',pos:{x:2,y:2}}],{partySlot:0,partyPlace:'D:1'},{x:1,y:1},()=>({solid:false}),()=>0);
    assert.equal(requested,0);assert.equal(sprites.length,1);assert.equal(body.partySlot,1);assert.equal(body.label,'Companion');
});
