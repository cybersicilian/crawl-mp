const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.resolve(__dirname,'..'),modules={},colors=new Map();
modules['./first-person-materials']={get:(name,fallback)=>fallback,color(value){if(!colors.has(value))colors.set(value,{image:{},color:value});return colors.get(value);}};
for(const name of ['mesh-camera','mesh-geometry','mesh-solids','grid-door-models','grid-dungeon-fixtures','grid-architecture','grid-props','grid-loot','mesh-fluid','grid-water','grid-connectivity','first-person-mesh']){
    const consumer=name==='first-person-mesh';
    vm.runInNewContext(fs.readFileSync(path.join(root,consumer?'game_data/static':'static/scripts',name+'.js'),'utf8'),{
        define(deps,factory){modules[consumer?'./'+name:name]=factory(...deps.map(dep=>modules[dep]));}
    });
}
test('batched native floor variants remain above every invisible picking backing',()=>{
    const cells=[{x:0,y:0,solid:false,floorMaterial:{image:{}}},{x:1,y:0,solid:false,floorMaterial:{image:{},fluid:{kind:'water'}}}];
    const scene=modules['./first-person-mesh'].build(cells,(x,y)=>cells.find(cell=>cell.x===x&&cell.y===y),[]);
    const backing=scene.mesh.boxes.filter(box=>box.cell);
    assert.equal(backing.length,2);assert(backing.every(box=>box.max[1]<0),'Pick-only foundation caps cannot occlude Y=0 floor surfaces');
    for(const cell of cells){const group=scene.mesh.groups().find(group=>group.material===cell.floorMaterial);assert(group);assert.equal(group.data[1],cell.floorMaterial.fluid?Math.fround(-.035):0);}
});

test('closed door interaction spans the seam between individual modeled planks',()=>{
    const mesh=modules['mesh-geometry'].create(),loc={x:0,y:0},material={image:{}};
    modules['grid-architecture'].door(mesh,{x:0,z:0,horizontal:true,frame:material,panel:material,metal:material,cell:loc});
    const hits=mesh.boxes.filter(box=>modules['mesh-camera'].boxRay({origin:[.5,1.1,3],direction:[0,0,-1]},box.min,box.max)!==null);
    assert(hits.some(box=>box.cell===loc),'A tiny visual seam must not disable native door actions');
});
