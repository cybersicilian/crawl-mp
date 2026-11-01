const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
function fixture(){
    const names=['BOLT_FLAME','BOLT_FROST','BOLT_WEAK_ELEC','BOLT_DRAIN','BOLT_SANDBLAST','BOLT_POISON_ARROW','BOLT_DEFAULT_MAGENTA','BOLT_DEFAULT_BLUE'];
    const tiles=Object.fromEntries(names.map((name,i)=>[name,i+1])),drawn=[];
    const canvas=()=>({dataset:{},getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(32*32*4)})})});
    const deps={'./native-tile-art':{drawIndices(source,indices){drawn.push(indices[0]);return true;}},'./tileinfo-main':tiles,
        'sprite-voxels':{build:()=>({}),bounds:()=>({left:-8,right:8,top:8,bottom:-8,width:16,height:16}),paint(){}}};
    let api;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game_data/static/first-person-magic.js'),'utf8'),{document:{createElement:canvas},define(names,factory){api=factory(...names.map(name=>deps[name]));}});
    return {api,tiles,drawn,canvas:canvas()};
}
test('spell school visuals use corresponding native effect assets, including earth rather than magma',()=>{
    const f=fixture();
    for(const [kind,name] of Object.entries({flame:'BOLT_FLAME',frost:'BOLT_FROST',lightning:'BOLT_WEAK_ELEC',soul:'BOLT_DRAIN',earth:'BOLT_SANDBLAST',venom:'BOLT_POISON_ARROW',summoning:'BOLT_DEFAULT_MAGENTA',arcane:'BOLT_DEFAULT_BLUE'})){
        assert(f.api.paint(f.canvas,kind));assert.equal(f.drawn.at(-1),f.tiles[name]);assert.equal(f.canvas.dataset.effect,name);assert.equal(f.canvas.dataset.sourceArt,'native-effect');
    }
});
test('unavailable native effects cannot leave a previous spell image marked ready',()=>{
    const f=fixture();assert(f.api.paint(f.canvas,'flame'));delete f.tiles.BOLT_SANDBLAST;
    assert.equal(f.api.paint(f.canvas,'earth'),false);assert.equal(f.canvas.dataset.effect,undefined);assert.equal(f.canvas.dataset.sourceArt,undefined);
});
