const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const modules={};
for(const name of ['mesh-camera','mesh-geometry','mesh-solids'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/scripts',name+'.js'),'utf8'),{
    define(deps,factory){modules[name]=factory(...deps.map(dep=>modules[dep]));}
});
const geometry=modules['mesh-geometry'],solids=modules['mesh-solids'];
function vertices(mesh){return mesh.groups().flatMap(group=>Array.from({length:group.data.length/9},(_,i)=>Array.from(group.data.slice(i*9,i*9+9))));}
test('shared leaf UV coordinates remain continuous across separately modeled planks',()=>{
    const material={uvSpace:{origin:[0,0],size:[1,2]}};
    const left=geometry.create(),right=geometry.create(),transform=(u,y,v)=>[u,y,v];
    solids.prism(left,material,[[0,0],[.5,0],[.5,2],[0,2]],-.04,.04,transform,{x:0,y:0});
    solids.prism(right,material,[[.5,0],[1,0],[1,2],[.5,2]],-.04,.04,transform,{x:0,y:0});
    const edge=mesh=>vertices(mesh).filter(v=>v[0]===.5&&v[1]===2&&Math.abs(v[2]+.04)<1e-7).map(v=>v.slice(6,8));
    assert(edge(left).some(uv=>uv[0]===.5&&uv[1]===0));assert(edge(right).some(uv=>uv[0]===.5&&uv[1]===0));
});
test('beveled solids expose sloped normals without multiplying material groups',()=>{
    const mesh=geometry.create(),material={uvSpace:{origin:[0,0],size:[1,2]}};
    solids.bevel(mesh,material,[[0,0],[1,0],[1,2],[0,2]],-.04,.04,.006,(u,y,v)=>[u,y,v],{x:0,y:0});
    const data=vertices(mesh);assert(data.every(v=>v.every(Number.isFinite)));
    assert(data.some(v=>Math.abs(v[3])>.2&&Math.abs(v[5])>.2));assert.equal(mesh.groups().length,1);
});
test('mirrored vertical models retain outward front normals and rounded handles have tube depth',()=>{
    for(const transform of [(u,y,v)=>[u,y,v],(u,y,v)=>[v,y,u]]){
        const mesh=geometry.create();solids.prism(mesh,{},[[0,0],[1,0],[1,2],[0,2]],-.04,.04,transform,{x:0,y:0});
        const origin=transform(.5,1,-.04),axis=transform(.5,1,-1);
        const normal=axis.map((v,i)=>v-transform(.5,1,0)[i]);
        assert(vertices(mesh).some(v=>v.slice(0,3).every((value,i)=>Math.abs(value-origin[i])<1.1)&&v[3]*normal[0]+v[4]*normal[1]+v[5]*normal[2]>.9));
    }
    const ring=geometry.create();solids.torus(ring,{},0,0,.05,.01,0,(u,y,v)=>[u,y,v],{x:0,y:0});
    const values=vertices(ring);assert(Math.max(...values.map(v=>v[2]))-Math.min(...values.map(v=>v[2]))>.015);
    assert(values.some(v=>Math.abs(v[5])>.5));
});
