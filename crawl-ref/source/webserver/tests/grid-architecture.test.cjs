const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const modules={};
for(const name of ['mesh-solids','grid-door-models','grid-dungeon-fixtures','grid-connectivity','grid-architecture'])vm.runInNewContext(
    fs.readFileSync(path.join(__dirname,'../static/scripts',name+'.js'),'utf8'),{define(deps,factory){modules[name]=factory(...deps.map(dep=>modules[dep]));}});
const architecture=modules['grid-architecture'];
function fixture(){const boxes=[],quads=[];return {boxes,quads,
    quad(material,points){quads.push({material,points});},
    box(material,min,max,cell){boxes.push({material,min,max,cell});},
    bounds(min,max,cell){boxes.push({min,max,cell});}};}
const stone={},rim={},dark={},panel={},metal={},rune={},seal={};
const options={x:0,z:0,horizontal:true,frame:stone,panel,metal,rune,seal,cell:{x:0,y:0}};
test('descending stairs have a real hole and treads below floor level',()=>{
    const mesh=fixture();architecture.stairs(mesh,{x:0,z:0,down:true,stone,rim,dark,cell:options.cell});
    const treads=mesh.boxes.filter(box=>box.material===stone&&box.min[0]===.14&&box.max[0]===.86&&box.max[1]<0);
    assert.equal(treads.length,6);assert(treads.every((box,i)=>i===0||box.max[1]<treads[i-1].max[1]));
    assert(!mesh.boxes.some(box=>box.min[0]<.5&&box.max[0]>.5&&box.min[2]<.5&&box.max[2]>.5&&box.max[1]>=0));
});
test('custom arched doors have separate planks, curved stonework and moving three-dimensional hardware',()=>{
    const closed=fixture(),open=fixture(),a=architecture.door(closed,options),b=architecture.door(open,{...options,open:true});
    assert.equal(a.planks,6);assert(Math.abs(a.width-.82)<1e-9);assert.equal(a.height,1.88);assert(a.custom&&b.open);
    const leaf=mesh=>mesh.quads.filter(q=>q.material.modelRole==='leaf').flatMap(q=>q.points);
    const span=(points,axis)=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
    assert(span(leaf(closed),0)>.8&&span(leaf(closed),2)<.08);
    assert(span(leaf(open),2)>.8&&span(leaf(open),0)<.08);
    assert(closed.quads.filter(q=>q.material===metal).length>100,'Straps, rivets, hinges and ring are geometry');
    assert(closed.quads.some(q=>q.material.modelRole==='frame'&&q.points.some(p=>p[0]!==q.points[0][0]&&p[1]!==q.points[0][1])));
    assert(closed.boxes.every(box=>box.cell===options.cell));
});
test('runed, sealed, clear, broken and middle-gate states have their own model parts',()=>{
    const runed=fixture(),sealed=fixture(),broken=fixture(),clear=fixture(),middle=fixture();
    architecture.door(runed,{...options,runed:true});architecture.door(sealed,{...options,sealed:true});
    assert(runed.quads.some(q=>q.material===rune));assert(sealed.quads.some(q=>q.material===seal));
    assert.equal(architecture.door(broken,{...options,broken:true,open:true}).planks,4);
    assert.equal(architecture.door(clear,{...options,clear:true}).kind,'clear-door');
    const pane=clear.quads.filter(q=>q.material.modelRole==='leaf').flatMap(q=>q.points);
    assert(Math.max(...pane.map(p=>p[2]))-Math.min(...pane.map(p=>p[2]))<.04,'Clear panes are thin, with no opaque wood behind');
    architecture.door(middle,{...options,segment:'middle',open:true});
    assert(!middle.quads.some(q=>q.material.modelRole==='leaf'||q.material===metal&&q.points.some(p=>p[1]>.1)),'Open middle gate segments do not invent a leaf or hinge');
});
test('level entrances use modeled arches and fitted native crests with native action locations',()=>{
    const mesh=fixture(),inset={};const model=architecture.gateway(mesh,{...options,kind:'branch',dark,inset});
    assert(model.custom&&model.walkable&&model.nativeInset);
    const crest=mesh.quads.find(q=>q.material===inset);assert(crest);
    assert(Math.max(...crest.points.map(p=>p[0]))-Math.min(...crest.points.map(p=>p[0]))<.5);
    assert(mesh.boxes.every(box=>box.cell===options.cell));
});
test('stair surface height matches body feet and zero-height camera anchors',()=>{
    assert(Math.abs(architecture.surfaceHeight('stairs_up',.5,.5)-.42)<.00001);
    assert(Math.abs(architecture.surfaceHeight('stairs_down',.5,.5)+.42)<.00001);
    assert.equal(architecture.surfaceHeight('floor',.5,.5),0);
});

test('adjacent modeled leaves meet at the shared tile edge with only exterior jambs in both planes',()=>{
    for(const horizontal of [true,false]){
        const cells=[{x:0,y:0,door:true,kind:'door',solid:true},{x:horizontal?1:0,y:horizontal?0:1,door:true,kind:'door',solid:true}];
        const get=(x,y)=>cells.find(cell=>cell.x===x&&cell.y===y)||null;
        const meshes=cells.map(cell=>{const mesh=fixture();architecture.door(mesh,{...options,x:cell.x,z:cell.y,cell,...modules['grid-connectivity'].door(cell,get)});return mesh;});
        const axis=horizontal?0:2;
        const leaf=mesh=>mesh.quads.filter(q=>q.material.modelRole==='leaf').flatMap(q=>q.points);
        const end=Math.max(...leaf(meshes[0]).map(p=>p[axis])),start=Math.min(...leaf(meshes[1]).map(p=>p[axis]));
        assert(start-end<.004,'The shared leaf seam is a narrow joint, not an empty tile margin');
        for(const mesh of meshes){const jambs=mesh.quads.filter(q=>q.material.modelRole==='frame').flatMap(q=>q.points).filter(p=>p[1]>.1&&p[1]<1.4);
            assert(jambs.every(p=>p[axis]<.1||p[axis]>1.9),'No internal jamb duplicates the adjoining door boundary');}
    }
});
