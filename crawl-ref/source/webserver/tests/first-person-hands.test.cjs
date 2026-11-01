const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
function load(file,deps={}){let result;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{define(names,factory){result=factory(...names.map(name=>deps[name]));}});return result;}
const tiles={ARM_GLOVES:1,UNRAND_GOLEM_GLOVES:2,get_tile_info:i=>({sx:i*32,sy:0,ex:i*32+32,ey:32})};
const profile=load('game_data/static/first-person-hands-profile.js',{'./tileinfo-main':tiles});
const art=i=>({texture:'main',layers:[{sx:i*32,sy:0,w:32,h:32}]});
function hero(hands='hands',unarmed_attack='Fists'){return {equipment_profile:{version:1,hands,unarmed_attack,slots:[],items:[]}};}
test('native anatomy controls hands, paws, usable claws, tentacles and transformed bodies',()=>{
    for(const [hands,attack,expected] of [['hands','Fists','bare'],['claws','Claws','claws'],['paws','Teeth and claws','paw'],['tentacles','Tentacles','tentacle'],['hands','Pseudopods','pseudopod'],['blade hands','Slice','blade'],['pincers','Claws','crab']]){
        assert.equal(profile.describe(hero(hands,attack),{},[])[0].model,expected);
    }
    assert.equal(profile.describe(hero('jaws','Bite'),{},[]).length,0);
    assert.equal(profile.describe({species:'Troll'}, {},[]).length,0,'Species alone must not revive suppressed claws');
    assert.equal(profile.describe(hero('hand'),{},[]).length,1,'Native singular missing hand stays singular');
});
test('equipped gloves use their actual artwork; melded gloves and two-handed occupancy remain authoritative',()=>{
    const h=hero();h.equipment_profile.slots=[{type:'hands',state:'equipped',inv_slot:4,name:'golem gloves'}];
    h.equipment_profile.items=[{inv_slot:4,art:art(2)}];
    assert.equal(profile.describe(h,{},[])[0].model,'golem');
    assert.equal(profile.describe(h,{},[])[0].art,h.equipment_profile.items[0].art);
    h.equipment_profile.slots[0].state='melded';assert.equal(profile.describe(h,{},[])[0].model,'bare');
    const hands=profile.describe(h,{},[{side:'main',hands:2}]);
    assert(hands.every(hand=>hand.grip&&!hand.unarmed&&!hand.magic));
});
test('readied magic requires the actual known quivered spell and preserves native blocked state',()=>{
    const h=hero();h.spells=[{name:'Fireball',schools:'Conjuration/Fire',tile:33,casting_cost:{payable:false}}];
    const p={quiver_item:-1,quiver_available:1,quiver_desc:'<red>f - Fireball</red>'};
    const ready=profile.describe(h,p,[])[1].magic;
    assert.equal(ready.name,'Fireball');assert.equal(ready.kind,'flame');assert(ready.blocked);
    assert.equal(profile.readied(h,{...p,quiver_item:1}),null);
    assert.equal(profile.readied(h,{...p,quiver_desc:'Flame Wave'}),null);
});
const geometry=load('static/scripts/foreground-mesh.js');
const library=load('static/foreground/hands-v1.js');
test('Blender hand library contains bounded solid voxel poses with exposed faces and mirrored articulation',()=>{
    assert.equal(library.version,2);assert.equal(Object.keys(library.models).length,7);
    for(const [name,model] of Object.entries(library.models)){
        for(const volume of Object.values(model.voxelPoses)){
            assert(volume.step>0&&volume.step<=.1,name);assert.equal(volume.cells.length%2,0);
            assert(volume.cells.length>0&&volume.cells.length<50000,name);
            const capacity=volume.size.reduce((a,b)=>a*b,1);
            for(let i=0;i<volume.cells.length;i+=2){assert(volume.cells[i]>=0&&volume.cells[i]<capacity,name);assert(volume.materials[volume.cells[i+1]],name);}
        }
        const mesh=geometry.pose(model,'grip','cast',.5,{surface:[100,110,120,255]},false);
        const mirror=geometry.pose(model,'grip','cast',.5,{surface:[100,110,120,255]},true);
        assert(mesh.faces.every(face=>face.normal.every(Number.isFinite)&&face.points.length===4),name);
        assert.equal(mesh.faces[0].points[0][0],-mirror.faces[0].points.at(-1)[0]);
        if(name==="claws")assert.notDeepEqual(model.voxelPoses.ready.cells,model.voxelPoses.strike.cells,name);
    }
});
test('party sprites require current visible same-floor cells and never duplicate the controlled body',()=>{
    const party=load('game_data/static/first-person-party.js');
    const member={pos:{x:2,y:2},place:'D:1',on_same_level:true,alive:true};
    assert(party.eligible(member,{place:'D:1'},{x:1,y:1},{solid:false}));
    for(const variation of [{place:'D:2'},{on_same_level:false},{alive:false},{ghost_haunting:true},{pos:{x:1,y:1}}])assert(!party.eligible({...member,...variation},{place:'D:1'},{x:1,y:1},{solid:false}));
    assert(!party.eligible({...member,slot:0},{place:'D:1',partySlot:0},{x:1,y:1},{solid:false}),'Stale party position must not create a second controlled body');
    assert(!party.eligible(member,{place:'D:1'},{x:1,y:1},null));
    assert(!party.eligible(member,{place:'D:1'},{x:1,y:1},{solid:true}));
});

test('equipped jewelry keeps exact item identities and follows visible hands; melded rings disappear',()=>{
    const h=hero();h.equipment_profile.slots=[{type:'ring',state:'equipped',inv_slot:4,name:'ruby ring'},{type:'ring',state:'equipped',inv_slot:5,name:'opal ring'},{type:'ring',state:'melded',inv_slot:6,name:'hidden ring'}];
    h.equipment_profile.items=[4,5,6].map(i=>({inv_slot:i,art:art(i)}));
    const hands=profile.describe(h,{},[]);assert.equal(hands[0].rings.length,1);assert.equal(hands[1].rings.length,1);
    assert.equal(hands[0].rings[0].art,h.equipment_profile.items[0].art);assert.equal(hands[1].rings[0].label,'opal ring');
    assert(hands.flatMap(hand=>hand.rings).every(ring=>ring.slot!==6));
});
test('cast visuals follow the actual native spell record even while hands are occupied',()=>{
    const h=hero();h.spells=[{name:'Fireball',schools:'Conjuration/Fire'},{name:'Sandblast',schools:'Earth'}];
    const player={quiver_item:-1,quiver_desc:'f - Fireball'};
    assert.equal(profile.readied(h,player).kind,'flame');
    assert.equal(profile.cast(h,{category:'Cast',name:'Sandblast'}).kind,'earth');
    assert.equal(profile.cast(h,{category:'Invoke',name:'Fireball'}),null);
    assert.equal(profile.cast(h,{category:'Cast',name:'Unreported spell'}),null);
    assert.equal(profile.cast(h,{category:'Cast',name:null}),null);
});
