const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let bindings;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/quickbar-model.js'),'utf8'),{define(deps,factory){bindings=factory();}});
let model;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/first-person-menu-model.js'),'utf8'),{define(deps,factory){model=factory(bindings);}});
const hero={inventory:[{slot:1,name:'sword',kind_name:'weapon'},{slot:2,name:'ruby ring',kind_name:'jewellery'},{slot:3,name:'curing',kind_name:'potion'}],spells:[{id:5,name:'Fireball',schools:'Conjuration/Fire'}]};
test('category and search project native item/power identities without changing their data',()=>{
    const rings=model.entries(hero,'inventory','jewelry','ruby',[]);assert.equal(rings.length,1);assert.equal(rings[0].data,hero.inventory[1]);assert.equal(rings[0].id,2);
    assert.equal(model.entries(hero,'inventory','weapons','ruby',[]).length,0);
    assert.equal(model.entries(hero,'magic','all','fire',[])[0].data,hero.spells[0]);
});
test('favorites preserve shared binding order, availability and per-entry hotkey index',()=>{
    const favorites=[{binding:{kind:'spell',id:5},entry:hero.spells[0],index:4},{binding:{kind:'item',id:9,last_item:{name:'Missing wand'}},entry:null,index:7}];
    const rows=model.entries(hero,'favorites','all','',favorites);assert.equal(rows.length,2);assert.equal(rows[0].index,4);assert.equal(rows[1].missing,true);assert.equal(rows[1].data.name,'Missing wand');
    assert.equal(model.favoriteIndex(rows[0],favorites),4);assert.equal(model.favoriteIndex({kind:'item',id:2},favorites),-1);
});

test('favorite identities preserve independent device actions on the same inventory item',()=>{
    const ordinary={kind:'item',id:2},overclock={kind:'item',id:2,action:'overclock',uid:23},finite={kind:'item',id:2,action:'overclock_finite',uid:23};
    const favorites=[{binding:ordinary,index:1},{binding:overclock,index:3},{binding:finite,index:4}];
    assert.equal(model.favoriteIndex({binding:overclock},favorites),3);assert.equal(model.favoriteIndex({binding:finite},favorites),4);
    assert.notEqual(model.identity({binding:ordinary}),model.identity({binding:overclock}));
    assert(bindings.same(overclock,{...overclock,id:6}),'UID-bound device action follows its item across slot movement');
    assert(!bindings.same(overclock,{...overclock,uid:24}));
});

test('menu chords support macOS Option dead/symbol keys and preserve other modifier combinations',()=>{
    assert.equal(model.shortcut({key:'Dead',code:'KeyI',altKey:true}),'inventory');
    assert.equal(model.shortcut({key:'µ',code:'KeyM',altKey:true}),'magic');
    assert.equal(model.shortcut({key:'œ',code:'KeyQ',altKey:true}),'favorites');
    assert.equal(model.shortcut({key:'q',altKey:true}),'favorites');
    for(const extra of [{altKey:false},{ctrlKey:true},{metaKey:true},{isComposing:true}])assert.equal(model.shortcut({key:'i',code:'KeyI',altKey:true,...extra}),null);
});
