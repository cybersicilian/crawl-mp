const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const modules={};
for(const name of ['mesh-camera','mesh-geometry','mesh-solids','grid-loot'])vm.runInNewContext(
    fs.readFileSync(path.join(__dirname,'../static/scripts',name+'.js'),'utf8'),{define(deps,factory){modules[name]=factory(...deps.map(dep=>modules[dep]));}});
test('gold uses solid coin relief with upward normals, conductor materials and native tile actions',()=>{
    const mesh=modules['mesh-geometry'].create(),gold={finish:'gold'},cell={x:3,y:4};
    const result=modules['grid-loot'].build(mesh,{x:3,z:4,cell,gold,profile:{kind:'gold',quantity:null,coins:[{x:0,z:0,y:.022,radius:.055,height:.018}],layers:[],stack:{present:false}}});
    assert.equal(result.quantity,null);assert.equal(result.coins,1);assert(mesh.boxes.every(box=>box.cell===cell));
    const data=mesh.groups()[0].data;assert(data.length>0);
    assert(Array.from({length:data.length/9},(_,i)=>data[i*9+4]).some(y=>y>.99),'Coin faces must point upward to catch torch highlights');
    assert(mesh.groups().every(group=>group.material.finish==='gold'));
});
test('item pile underlays are solid beveled silhouettes, grounded at the same native action tile',()=>{
    const mesh=modules['mesh-geometry'].create(),stack={},cell={x:0,y:0},profile={kind:'scroll',quantity:null,coins:[],stack:{present:true},
        style:{kind:'layered-pile',topElevation:.08,contactWidth:.5,contactDepth:.4},
        layers:[{x:-.04,z:.025,y:.01,angle:-.22,width:.38,depth:.265,height:.021},
            {x:.034,z:-.012,y:.027,angle:.28,width:.315,depth:.235,height:.025}]};
    const result=modules['grid-loot'].build(mesh,{x:0,z:0,cell,stack,profile});
    assert(result.stack);assert.equal(result.quantity,null);assert.equal(result.coins,0);
    assert.equal(result.style,'layered-pile');assert.equal(result.topElevation,.08);
    assert(mesh.boxes.length>0);assert(mesh.boxes.every(box=>box.cell===cell));
    const solidGroups=mesh.groups().filter(group=>!group.material.transparent);
    assert(solidGroups.every(group=>group.material.metalness===0&&group.material.roughness>.9));
    function area(a,b,p){return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);}
    function contains(a,b,c,p){const signs=[area(a,b,p),area(b,c,p),area(c,a,p)];return signs.every(v=>v>=-1e-6)||signs.every(v=>v<=1e-6);}
    for(const layer of profile.layers){
        const target=[.5+layer.x,.5+layer.z],height=layer.y+layer.height;
        assert(solidGroups.some(group=>{
            const data=group.data;for(let i=0;i<data.length;i+=27){
                const points=[0,9,18].map(offset=>[data[i+offset],data[i+offset+2]]);
                if(data[i+4]>.99&&Math.abs(data[i+1]-height)<1e-5&&contains(...points,target))return true;
            }return false;
        }),'Every pile layer must have a filled top, including its center');
    }
    assert(solidGroups.some(group=>Array.from({length:group.data.length/9},(_,i)=>group.data[i*9+4]).some(y=>y>.1&&y<.99)),
        'Sloped bevels catch light at the edge of the overlapping pile');
    const contact=mesh.groups().find(group=>group.material.transparent);assert(contact);assert.equal(contact.material.castShadow,false);
});
