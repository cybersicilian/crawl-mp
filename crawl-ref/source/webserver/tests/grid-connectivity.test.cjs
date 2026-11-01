const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const modules={};
for(const name of ['mesh-camera','mesh-geometry','mesh-intersections','grid-connectivity'])vm.runInNewContext(
    fs.readFileSync(path.join(__dirname,'../static/scripts',name+'.js'),'utf8'),{define(deps,factory){modules[name]=factory(...deps.map(dep=>modules[dep]));}});
const topology=modules['grid-connectivity'],intersections=modules['mesh-intersections'];
function world(cells){const byKey=new Map(cells.map(cell=>[cell.x+':'+cell.y,cell]));return(x,y)=>byKey.get(x+':'+y)||null;}
function door(x,y,open=false,extra={}){return {x,y,door:true,solid:!open,kind:open?'open_door':'door',...extra};}
function plain(value){return JSON.parse(JSON.stringify(value));}
test('neighboring mixed-state ordinary doors form one horizontal opening, without internal jambs',()=>{
    const cells=[door(0,0),door(1,0,true),door(2,0)],get=world(cells);
    const roles=cells.map(cell=>topology.door(cell,get));
    assert.deepEqual(roles.map(role=>role.segment),['left','middle','right']);
    assert.deepEqual(roles.map(role=>[role.left,role.right]),[[.09,1],[0,1],[0,.91]]);
    assert(roles.every(role=>role.horizontal));
    cells[0].kind='open_door';cells[0].solid=false;cells[1].kind='door';cells[1].solid=true;
    assert.deepEqual(plain(cells.map(cell=>topology.door(cell,get))),plain(roles),'Open/closed state cannot rotate or split a doorway');
});
test('vertical doors and explicit native gate planes retain up/middle/down roles',()=>{
    const cells=[door(4,2),door(4,3,true),door(4,4)],get=world(cells);
    assert.deepEqual(cells.map(cell=>topology.door(cell,get).segment),['up','middle','down']);
    assert(cells.every(cell=>!topology.door(cell,get).horizontal));
    const native=door(10,10,false,{doorAxis:'v',doorSegment:'middle'});
    assert.equal(topology.door(native,world([native,door(9,10),door(11,10)])).horizontal,false);
    assert.equal(topology.door(native,()=>null).segment,'middle','Unknown neighbors cannot erase native gate identity');
});
test('isolated orientation uses stable structural walls and incompatible explicit planes never join',()=>{
    const cell=door(1,1),get=world([cell,{x:0,y:1,solid:true},{x:2,y:1,solid:true}]);
    assert(topology.door(cell,get).horizontal);
    const a=door(0,0,false,{doorAxis:'h'}),b=door(1,0,true,{doorAxis:'v'});
    assert.equal(topology.door(a,world([a,b])).joinedAfter,false);
});
const stone={image:{},tileScale:1},floor={image:{}};
function buildWall(cell,get){const mesh=modules['mesh-geometry'].create();const model=topology.wall(mesh,{cell,get,material:stone,floor});return {mesh,model};}
test('two opposite walls leave positive diagonal clearance between visible open cells',()=>{
    const a={x:0,y:0,solid:true},d={x:1,y:1,solid:true},b={x:1,y:0,solid:false,floorMaterial:floor},c={x:0,y:1,solid:false,floorMaterial:floor};
    const get=world([a,b,c,d]),first=buildWall(a,get),second=buildWall(d,get);
    assert.equal(first.model.cuts,1);assert.equal(second.model.cuts,1);
    const ray={origin:[1.5,1,.5],direction:[-Math.SQRT1_2,0,Math.SQRT1_2]};
    const walls=[first.mesh.boxes[0],second.mesh.boxes[0]];
    assert(walls.every(box=>intersections.prismRay(ray,box)===null),'A native legal diagonal must not hit an uncut AABB proxy');
    assert(first.model.outline.every(p=>p[0]+p[1]<=1.74+1e-8));
    assert(second.model.outline.every(p=>p[0]+p[1]>=2.26-1e-8));
    const actionable=first.mesh.boxes.slice(1).map(box=>box.cell);
    assert(actionable.every(cell=>cell.x===b.x&&cell.y===b.y||cell.x===c.x&&cell.y===c.y));
    assert.equal(actionable.length,2);
    const floorGroup=first.mesh.groups().find(group=>group.material===floor);
    assert(floorGroup);assert(Array.from({length:floorGroup.data.length/9},(_,i)=>floorGroup.data[i*9+4]).every(value=>value>.99));
});
test('unknown or solid orthogonal neighbors never create a diagonal clearance or inferred floor',()=>{
    const a={x:0,y:0,solid:true},known={x:1,y:0,solid:false};
    const result=buildWall(a,world([a,known]));assert.equal(result.model.cuts,0);assert.equal(result.mesh.boxes.length,1);
    const ray={origin:[1.5,1,.5],direction:[-Math.SQRT1_2,0,Math.SQRT1_2]};
    assert(intersections.prismRay(ray,result.mesh.boxes[0])!==null);
});
test('clipped walls retain physical height, world-scale UVs and their own native wall action',()=>{
    const a={x:0,y:0,solid:true},result=buildWall(a,world([a,{x:1,y:0,solid:false},{x:0,y:1,solid:false}]));
    const wall=result.mesh.boxes[0];assert.deepEqual(plain(wall.cell),{x:0,y:0});
    assert.equal(intersections.prismRay({origin:[.5,1,-1],direction:[0,0,1]},wall),1);
    assert.equal(intersections.prismRay({origin:[.5,4,-1],direction:[0,0,1]},wall),null);
    const values=result.mesh.groups().find(group=>group.material===stone).data;
    assert(Array.from(values).every(Number.isFinite));
    assert(Array.from({length:values.length/9},(_,i)=>values[i*9+7]).some(value=>Math.abs(value-3.35)<1e-5));
});

test('wall-base trim leaves the same diagonal gap clear even at foot height',()=>{
    const cells=[{x:0,y:0,solid:true},{x:1,y:1,solid:true},{x:1,y:0,solid:false},{x:0,y:1,solid:false}],get=world(cells);
    const mesh=modules['mesh-geometry'].create();
    for(const cell of cells.filter(cell=>!cell.solid))for(const offset of [[1,0],[-1,0],[0,1],[0,-1]])topology.trim(mesh,{cell,get,offset,material:stone});
    assert.equal(mesh.boxes.length,4);
    const ray={origin:[1.5,.04,.5],direction:[-Math.SQRT1_2,0,Math.SQRT1_2]};
    assert(mesh.boxes.every(box=>intersections.prismRay(ray,box)===null),'Decorative lips cannot bridge the native diagonal clearance');
    assert(mesh.boxes.every(box=>get(box.cell.x,box.cell.y).solid===false));
});
test('trim stays full against unknown corners and is omitted at modeled door thresholds',()=>{
    const cell={x:0,y:0,solid:false},wall={x:0,y:-1,solid:true},mesh=modules['mesh-geometry'].create();
    const spec=topology.trim(mesh,{cell,get:world([cell,wall]),offset:[0,-1],material:stone});
    assert.equal(spec.start,0);assert.equal(spec.end,1);
    const entry=door(1,0),count=mesh.boxes.length;
    assert.equal(topology.trim(mesh,{cell,get:world([cell,entry]),offset:[1,0],material:stone}),null);
    assert.equal(mesh.boxes.length,count);
});

test('diagonal floor patches retain non-degenerate tile UVs for relief lighting',()=>{
    const wall={x:0,y:0,solid:true},a={x:1,y:0,solid:false,floorMaterial:floor},b={x:0,y:1,solid:false,floorMaterial:floor};
    const built=buildWall(wall,world([wall,a,b]));const patches=built.mesh.groups().filter(group=>group.material===floor);assert(patches.length);
    for(const group of patches)for(let offset=0;offset<group.data.length;offset+=54){
        const uv=[0,1,2].map(n=>[group.data[offset+n*9+6],group.data[offset+n*9+7]]);
        const area=(uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]);
        assert(Math.abs(area)>1e-5,'A collapsed UV axis makes tangent relief undefined');
    }
});

test('power-of-two native patch textures repeat at one tile without creating a material per triangle',()=>{
    const material={image:{width:64,height:64}},wall={x:0,y:0,solid:true},a={x:1,y:0,solid:false,floorMaterial:material},b={x:0,y:1,solid:false,floorMaterial:material};
    const built=buildWall(wall,world([wall,a,b]));const patches=built.mesh.groups().filter(group=>group.material.image===material.image);
    assert.equal(patches.length,1);assert.equal(patches[0].material.tileScale,1);
});
