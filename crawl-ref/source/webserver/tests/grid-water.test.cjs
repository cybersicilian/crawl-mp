const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const modules={};
for(const name of ['mesh-camera','mesh-geometry','mesh-fluid','grid-water'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/scripts',name+'.js'),'utf8'),{
    define(deps,factory){modules[name]=factory(...deps.map(dep=>modules[dep]));}
});
const water=modules['grid-water'],geometry=modules['mesh-geometry'],image={};
function build(profile,neighbors){
    const mesh=geometry.create(),surface={image,fluid:profile,opacity:.5};
    const model=water.build(mesh,{x:0,z:0,surface,bed:{image},bank:{image},dark:{image},neighbors,cell:{x:0,y:0}});
    return {mesh,model,surface};
}
test('shallow and deep water contain real recessed beds below their transparent surface',()=>{
    const shallow=build({kind:'water',depth:'shallow'},[]),deep=build({kind:'water',depth:'deep'},[]);
    assert(shallow.model.depth>.2);assert(deep.model.depth>shallow.model.depth*3);
    for(const scene of [shallow,deep]){
        const groups=scene.mesh.groups(),surface=groups.find(group=>group.material===scene.surface);
        const beds=groups.filter(group=>group.material!==scene.surface);
        assert.equal(surface.data[1],Math.fround(scene.model.surface));
        assert(beds.some(group=>group.data[1]<-.2),'A separate actual bottom remains beneath the water');
        assert.equal(scene.mesh.boxes.length,1);assert.equal(scene.mesh.boxes[0].cell.x,0);
    }
});
test('unknown sides are sealed without claiming shorelines, known dry banks alone form shore geometry',()=>{
    const shallow={kind:'water',depth:'shallow'};
    const result=build(shallow,[{solid:true},null,{known:false},{floorMaterial:{fluid:shallow}}]);
    assert.equal(result.model.banks,1);assert.equal(result.model.seals,2);assert.equal(result.model.steps,0);
});
test('deep basin closes the depth step toward known shallows but never adds a wall between equal water',()=>{
    const result=build({kind:'water',depth:'deep'},[{floorMaterial:{fluid:{kind:'water',depth:'shallow'}}},
        {floorMaterial:{fluid:{kind:'water',depth:'deep'}}},null,null]);
    assert.equal(result.model.steps,1);assert.equal(result.model.banks,0);
    assert.equal(water.dimensions({kind:'honey'}),null);assert.equal(water.dimensions({kind:'lava'}),null);
});
