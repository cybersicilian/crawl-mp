const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const modules={};
for(const name of ['mesh-camera','mesh-geometry','mesh-solids','grid-dungeon-fixtures'])vm.runInNewContext(
    fs.readFileSync(path.join(__dirname,'../static/scripts',name+'.js'),'utf8'),{define(deps,factory){modules[name]=factory(...deps.map(dep=>modules[dep]));}});
const fixtures=modules['grid-dungeon-fixtures'],math=modules['mesh-camera'];
const stone={name:'stone'},wood={name:'wood'},metal={name:'metal'},dark={name:'dark'};
function scene(profile,extra={}){
    const mesh=modules['mesh-geometry'].create(),cell={x:3,y:4};
    const model=fixtures.build(mesh,{x:3,z:4,profile,stone,wood,metal,dark,cell,...extra});
    return {mesh,cell,model};
}
function closest(mesh,origin,direction){
    const hits=mesh.boxes.map(box=>({box,distance:math.boxRay({origin,direction},box.min,box.max)})).filter(hit=>hit.distance!==null);
    hits.sort((a,b)=>a.distance-b.distance);return hits[0];
}
test('floor and ceiling openings are explicit fresh descriptors for actual supported transitions',()=>{
    const shaft=fixtures.openings({kind:'shaft'}),down=fixtures.openings({kind:'hatch',direction:'down'}),up=fixtures.openings({kind:'hatch',direction:'up'});
    assert.equal(shaft.floor.bottom,-1.35);assert.equal(shaft.floor.left,.2);assert.equal(shaft.ceiling,null);
    assert.equal(down.floor.bottom,-.85);assert.equal(down.floor.right,.76);assert.equal(down.ceiling,null);
    assert.equal(up.ceiling.top,3.85);assert.equal(up.floor,null);
    shaft.floor.left=0;assert.equal(fixtures.openings({kind:'shaft'}).floor.left,.2);
    assert.equal(fixtures.openings({kind:'sigil'}).floor,null);
    assert.equal(fixtures.openings(null).ceiling,null);
});
test('shaft and descending hatch keep the center open to the dark bottom instead of a hidden floor cap',()=>{
    for(const profile of [{kind:'shaft'},{kind:'hatch',direction:'down'}]){
        const {mesh,cell,model}=scene(profile),bottom=fixtures.openings(profile).floor.bottom;
        const hit=closest(mesh,[3.5,1.1,4.5],[0,-1,0]);assert(hit);
        assert(hit.box.max[1]<=bottom+.002,'Native interaction remains at the well bottom, with no cap near Y=0');
        assert(mesh.boxes.every(box=>box.cell===cell));assert(model.custom&&model.walkable);
        assert(mesh.groups().every(group=>Array.from(group.data).every(Number.isFinite)));
    }
});
test('upward hatch has a genuine ceiling aperture and a ladder reaching from the floor into the opening',()=>{
    const {mesh,cell,model}=scene({kind:'hatch',direction:'up'});
    const hit=closest(mesh,[3.5,2,4.5],[0,1,0]);assert(hit);
    assert(hit.box.min[1]>=3.849,'Nothing fills the aperture at normal ceiling height');
    assert(mesh.boxes.some(box=>box.min[1]===.08&&box.max[1]===3.4),'Rails must not float above the player');
    assert(mesh.boxes.every(box=>box.cell===cell));assert.equal(model.kind,'hatch-up');
});
test('known traps remain fitted low mechanisms or native inlays, never upright glyph billboards',()=>{
    const detail={name:'native trap',transparent:true,castShadow:false};
    for(const kind of ['plate','mechanical','alarm','sigil','web']){
        const {mesh,cell,model}=scene({kind,active:true},{detail});
        assert(model.custom&&model.detail);assert(mesh.groups().some(group=>group.material===detail));
        assert(mesh.boxes.every(box=>box.cell===cell));assert(mesh.boxes.every(box=>box.max[1]<.1));
        const data=mesh.groups().find(group=>group.material===detail).data;
        const ys=Array.from({length:data.length/9},(_,i)=>data[i*9+1]);
        assert(Math.max(...ys)-Math.min(...ys)<.0001,'Native art lies on the floor rather than facing the camera');
    }
});
test('inactive native sigils suppress supplied emission without mutating the source material',()=>{
    const detail={image:{},emission:.7};const {mesh,model}=scene({kind:'sigil',active:false},{detail});
    const inlay=mesh.groups().find(group=>group.material.image===detail.image);
    assert(inlay);assert.equal(inlay.material.emission,0);assert.equal(detail.emission,.7);assert.equal(model.active,false);
});
test('unknown fixture profiles add no models or inferred interaction geometry',()=>{
    for(const profile of [null,{kind:'undisclosed-trap'}]){
        const {mesh,model}=scene(profile);assert.equal(model,null);assert.equal(mesh.boxes.length,0);assert.equal(mesh.groups().length,0);
    }
});
