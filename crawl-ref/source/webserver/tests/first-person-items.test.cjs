const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const modules={};
for(const name of ['tileinfo-floor','tileinfo-wall','tileinfo-feat','tileinfo-main','enums','first-person-items']){
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static',name+'.js'),'utf8'),{
        define(deps,factory){if(typeof deps==='function'){factory=deps;deps=[];}modules['./'+name]=factory(...deps.map(dep=>modules[dep]));}
    });
}
const model=modules['./first-person-items'],main=modules['./tileinfo-main'];
const plain=value=>JSON.parse(JSON.stringify(value));
function cell(index,flags=0,bg=2){return {x:3,y:7,item_name:'stale hidden item name',mon:{name:'Hidden monster'},t:{fg:[index|flags,0],bg}};}
test('all native gold tiles select gold material and pile classes without invented quantities',()=>{
    const suffixes=['01','02','03','04','05','06','07','08','09','10','16','19','23','25'];
    for(const [rank,suffix] of suffixes.entries()){
        const profile=model.describe(cell(main['GOLD'+suffix]));
        assert.equal(profile.kind,'gold');assert.equal(profile.pileClass,rank+1);assert.equal(profile.quantity,null);
        assert(profile.coins.length>=1);assert.equal(profile.stack.itemCount,null);
        assert(!JSON.stringify(profile).includes('stale hidden'));assert(!JSON.stringify(profile).includes('Hidden monster'));
    }
    assert(model.describe(cell(main.GOLD25)).coins.length>model.describe(cell(main.GOLD01)).coins.length);
    assert.equal(model.family(main.ARM_GOLDEN_DRAGON_ARMOUR),'armour');
});
test('native UNDER markers distinguish item stacks and preserve quality without a numeric count',()=>{
    const normal=model.describe(cell(main.POT_CURING,0x40000));
    assert.equal(normal.kind,'potion');assert(normal.stack.present);assert(normal.stack.multiple);
    assert.equal(normal.stack.quality,'ordinary');assert.equal(normal.stack.itemCount,null);assert.equal(normal.quantity,null);
    assert.equal(normal.layers.length,3);
    for(const [bit,quality] of [[0x1000000,'good'],[0x2000000,'artefact']]){
        const entry=cell(main.POT_CURING);entry.t.fg[1]=bit;
        assert.equal(model.describe(entry).stack.quality,quality);
    }
    assert.equal(model.describe(cell(main.POT_CURING)).layers.length,0);
});
test('one item under a monster is only a generic underneath marker',()=>{
    const profile=model.describe(cell(main.MONS_ORC,0x40000));
    assert.equal(profile.kind,'under-items');assert.equal(profile.tile,null);assert(profile.stack.underActor);
    assert(!profile.stack.multiple);assert.equal(profile.stack.itemCount,null);assert.equal(profile.stack.label,'Items underneath');
    assert.deepEqual(plain(profile.coins),[]);
    assert.equal(profile.layers.length,1);assert.equal(profile.style.kind,'underlay');
    assert(Math.abs(profile.style.topElevation-.028)<1e-8);
    assert.equal(model.describe(cell(main.MONS_ORC)),null);
});
test('only exact tile-bound native lists provide counts and item quantities',()=>{
    const entry=cell(main.GOLD25),known={known:true,x:3,y:7,items:[{qty:147,tile:[main.GOLD25]},{qty:2,tile:[main.POT_CURING]}]};
    const result=model.describe(entry,null,known);
    assert.equal(result.quantity,147);assert.equal(result.stack.itemCount,2);assert(result.stack.multiple);
    assert.equal(result.knownItems[1].quantity,2);
    assert.equal(model.describe(entry,null,{...known,x:4}).quantity,null);
    assert.equal(model.describe(entry,null,{...known,known:false}).quantity,null);
    assert.equal(model.describe(entry,null,{...known,items:[{qty:1,tile:['not a native index']}]}).knownItems.length,0);
});
test('mapped, remembered and detected item cells never disclose models or stack details',()=>{
    for(const bg of [0x40000,0x20000])assert.equal(model.describe(cell(main.GOLD25,0x40000,bg)),null);
    assert.equal(model.describe(cell(main.UNSEEN_ITEM,0x40000)),null);
    assert.equal(model.describe(null),null);
    assert.equal(model.describe({x:3,y:7}),null);
});
test('visual model positions are deterministic, bounded and do not encode a claimed count',()=>{
    for(let rank=1;rank<=14;rank++){
        const poses=plain(model.coinLayout(rank));assert.deepEqual(poses,plain(model.coinLayout(rank)));
        for(const pose of poses){assert(Math.abs(pose.x)<.25&&Math.abs(pose.z)<.25);assert(pose.y>=0&&pose.y<.2);}
    }
    assert.deepEqual(plain(model.stackLayout(false)),[]);
    assert.deepEqual(plain(model.stackLayout(true)),plain(model.stackLayout(true)));
    const native=cell(main.POT_CURING),facts={known:true,x:3,y:7,items:[{qty:5,tile:[main.POT_CURING]}]};
    assert(model.describe(native,null,facts).stack.multiple,'Known same-item quantity is distinct from a singleton');
    assert.equal(model.describe(native,null,facts).stack.itemCount,1);
});

test('visible item piles have irregular low footprints and expose a top-item anchor without claiming quantities',()=>{
    const pile=model.describe(cell(main.POT_CURING,0x40000));
    assert.equal(pile.style.kind,'layered-pile');assert.equal(pile.quantity,null);assert.equal(pile.stack.itemCount,null);
    assert(new Set(pile.layers.map(layer=>layer.width)).size>1);
    assert(new Set(pile.layers.map(layer=>layer.angle)).size>1);
    assert(pile.style.topElevation<.1);assert(pile.layers.every(layer=>layer.height<.03));
    assert(pile.layers.every(layer=>layer.y+layer.height<pile.style.topElevation));
    const coins=model.describe(cell(main.GOLD25,0x40000));
    assert.equal(coins.style.kind,'coin-pile');assert(coins.layers.every(layer=>layer.y+layer.height<.022));
});
