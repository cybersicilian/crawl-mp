const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
function fixture() {
    const calls=[],reads=[],images={main:{src:'main?v=one',naturalWidth:1024,naturalHeight:1024},icons:{src:'icons?v=one',naturalWidth:256,naturalHeight:256}};
    const state={ready:true};const tiles={};
    const art={drawNative:(canvas,source)=>{calls.push({kind:'layers',source,canvas});return state.ready;},
        drawIndices:(canvas,source,atlas)=>{calls.push({kind:'indices',source,canvas,atlas});return state.ready;}};
    let module;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/first-person-equipment-art.js'),'utf8'),{
        document:{getElementById:id=>{reads.push(id);return images[id];},createElement:()=>({})},
        define(deps,factory){module=factory(art,tiles);}
    });
    return {source:module.create(),calls,reads,images,state,tiles};
}
test('voxel input uses the exact equipped inventory art, including layered overlays',()=>{
    const f=fixture(),art={texture:'main',layers:[{sx:128,sy:64,w:32,h:32,ox:0,oy:0,ymax:32},
        {texture:'icons',sx:16,sy:16,w:8,h:8,ox:20,oy:2,ymax:32}]};
    const sample=f.source.sample({art,side:'main',weapon:true,label:'a unique artefact'});
    assert.equal(f.calls[0].source,art);assert.equal(f.calls[0].kind,'layers');
    assert.deepEqual(f.reads,['main','icons']);assert.equal(sample.source,'inventory');
    assert.equal(sample.width,32);assert.equal(sample.canvas.width,32);
});
test('same-category artefacts and variants retain different source identities',()=>{
    const f=fixture(),base={texture:'main',layers:[{sx:0,sy:0,w:32,h:32}]};
    const variant={texture:'main',layers:[{sx:32,sy:0,w:32,h:32}]};
    const first=f.source.sample({art:base,label:'sword'}),second=f.source.sample({art:variant,label:'sword'});
    assert.notEqual(first.key,second.key);assert.equal(f.calls[1].source,variant);
    f.images.main.src='main?v=two';assert.notEqual(first.key,f.source.sample({art:base}).key);
});
test('legacy native inventory indices are used verbatim without a hand-sprite substitution',()=>{
    const f=fixture(),tile=[101,205];const sample=f.source.sample({tile});
    assert.equal(f.calls[0].kind,'indices');assert.equal(f.calls[0].source,tile);assert.equal(f.calls[0].atlas,f.tiles);
    assert.equal(sample.source,'inventory');assert.deepEqual(f.reads,['main']);
});
test('missing inventory art stays unavailable rather than guessing an item family',()=>{
    const f=fixture();assert.equal(f.source.sample({label:'long sword',side:'main',weapon:true}),null);
    f.state.ready=false;assert.equal(f.source.sample({tile:[101]}),null);assert.deepEqual(f.reads,[]);
});
