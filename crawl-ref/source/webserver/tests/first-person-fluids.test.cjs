const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.resolve(__dirname,'..'),modules={};
let floorTiles;
vm.runInNewContext(fs.readFileSync(path.join(root,'game_data/static/tileinfo-floor.js'),'utf8'),{
    define(deps,factory){floorTiles=factory();}
});
const honeyIndex=floorTiles.DNGN_SHALLOW_HONEY;
const tiles={DNGN_SHALLOW_WATER:10,DNGN_DEEP_WATER:20,DNGN_SHALLOW_WATER_MURKY:30,
    DNGN_DEEP_WATER_MURKY:40,DNGN_LAVA:50,DNGN_LAVA_SEA:60,DNGN_OPEN_SEA:70,
    SHOALS_SHALLOW_WATER:80,DNGN_TOXIC_BOG:90,DNGN_SHALLOW_HONEY:honeyIndex,
    basetile:index=>index>=honeyIndex&&index<=floorTiles.DNGN_SHALLOW_HONEY_1?floorTiles.basetile(index):index===11?10:index};
modules['./tileinfo-dngn']=tiles;
for(const [name,file]of [['mesh-fluid','static/scripts/mesh-fluid.js'],['fluids','game_data/static/first-person-fluids.js']]){
    vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{
        define(deps,factory){modules[name]=factory(...deps.map(dep=>modules[dep]));}
    });
}
const fluid=modules.fluids,generic=modules['mesh-fluid'];
test('native variants distinguish shallow/deep/murky water and lava without replacing art',()=>{
    const shallow=fluid.describe(10),deep=fluid.describe(20),murky=fluid.describe(30),lava=fluid.describe(50);
    assert.equal(shallow.kind,'water');assert.equal(shallow.depth,'shallow');
    assert.equal(deep.depth,'deep');assert(deep.roughness<shallow.roughness);
    assert(murky.murky);assert(murky.roughness>shallow.roughness);assert.equal(lava.kind,'lava');
    assert.equal(fluid.describe(11),shallow);assert.equal(fluid.describe(12345),null);
    const source={image:{native:true},pixelated:true},material=fluid.material(10,source);
    assert.equal(material.image,source.image);assert(material.pixelated);assert(material.opacity>0&&material.opacity<1);
    assert.equal(material.castShadow,false);assert.equal(shallow.opaque,false);
    assert.equal(material.transmission,0);assert.equal(material.emission,0,'Lava uses native bright seams rather than a flat glow');
    assert.equal(fluid.material(12345,source),source);
});
test('shorelines require explicitly known neighbors, never fog or unseen shore guesses',()=>{
    const water=fluid.describe(10),cells=new Map([
        ['0,-1',{fluid:fluid.describe(20)}],['1,0',{solid:true}],['0,1',null],['-1,0',{visible:false,solid:true}]
    ]);
    assert.deepEqual(Array.from(fluid.shoreline((x,y)=>cells.get(x+','+y),0,0,water)),[0,1,0,0]);
    cells.set('-1,0',{fluid:fluid.describe(50)});
    assert.deepEqual(Array.from(fluid.shoreline((x,y)=>cells.get(x+','+y),0,0,water)),[0,1,0,1]);
});
test('fluid motion is driven only by an explicitly permitted native paint cadence',()=>{
    const enabled={realtime:true,waterAnimation:true,animated:true,reducedMotion:false};
    assert(generic.phase(4000,enabled)>0);
    for(const patch of [{reducedMotion:true},{realtime:false},{waterAnimation:false},{animated:false}])
        assert.equal(generic.phase(4000,{...enabled,...patch}),0);
    assert.equal(generic.phase(4000,{}),0);assert.equal(generic.phase(NaN,enabled),0);
    const cycle=100*Math.PI*2*1000;
    assert(Math.abs(generic.phase(cycle,enabled))<1e-9,'All wave speeds wrap at a common full period');
});
test('uniforms stay bounded and fixed-size for reusable material consumers',()=>{
    const lava=generic.uniforms(fluid.describe(50),[1,0,1,0,1],2.5);
    assert.deepEqual(Array.from(lava.fluid),[2,1,0,Math.fround(0.8)]);
    assert.deepEqual(Array.from(lava.shore),[1,0,1,0]);assert.equal(lava.time,2.5);
    const empty=generic.uniforms(null,[],NaN);
    assert.deepEqual(Array.from(empty.shore),[0,0,0,0]);assert.equal(empty.time,0);
    assert(Array.from(empty.fluid).every(Number.isFinite));
});

test('native honey and its animation variant use a separate opaque viscous material',()=>{
    assert(Number.isInteger(honeyIndex),'The generated native floor catalog must provide honey artwork');
    const honey=fluid.describe(honeyIndex),water=fluid.describe(10);
    assert.equal(honey.kind,'honey');assert.equal(honey.depth,'shallow');assert(Object.isFrozen(honey));
    assert.equal(fluid.describe(floorTiles.DNGN_SHALLOW_HONEY_1),honey);
    assert(honey.strength<water.strength,'Thick honey has a smaller normal response');
    const native={image:{amberPixels:true},pixelated:true};
    const material=fluid.material(honeyIndex,native);
    assert.equal(material.image,native.image);assert.equal(material.emission,0);
    assert.equal(material.opacity,1);assert.equal(material.transmission,0);
    assert.deepEqual(Array.from(generic.uniforms(honey,[],0).fluid),[3,0,0,Math.fround(0.7)]);
    const cells=new Map([['0,-1',{fluid:honey}],['1,0',{fluid:water}],['0,1',{known:false}],['-1,0',null]]);
    assert.deepEqual(Array.from(fluid.shoreline((x,y)=>cells.get(x+','+y),0,0,honey)),[0,1,0,0]);
});
test('fluid shader extension keeps native albedo and excludes scene reads and honey emission',()=>{
    const glsl=generic.glsl;
    assert.equal(glsl.normal,'n=meshFluidNormal(n,vWorld);');
    assert.equal(glsl.color,'tex.rgb=meshFluidColor(tex.rgb,vWorld);');
    assert.equal(glsl.emission,'meshFluidEmission(tex.rgb,vWorld)');
    assert.equal(glsl.reflection,'meshFluidReflection(albedo,n,eye,ambient)');
    assert(!/sampler|texture2D|gl_FragColor/.test(glsl.declarations),'Fluid helpers cannot sample or reveal the scene');
    assert(glsl.declarations.includes('if(uFluid.x<1.5||uFluid.x>2.5)return vec3(0.0);'),
        'Only native lava kind 2 may emit; honey kind 3 remains non-emissive');
    assert(glsl.declarations.includes('meshFluidBanks(point)'),'Known shore masks affect fluid normals');
    assert(glsl.declarations.includes('float fresnel='),'Surface sheen responds to view angle');
});
