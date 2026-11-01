const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
let intersections;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/scripts/mesh-intersections.js'),'utf8'),{define(deps,factory){intersections=factory();}});
const box={min:[0,0,0],max:[1,2,1],outline:[[0,0],[1,0],[1,.7],[.7,1],[0,1]]};
test('convex prism rays support either winding, parallel rays and origins inside',()=>{
    const hit={origin:[.5,1,-2],direction:[0,0,1]};
    assert.equal(intersections.prismRay(hit,box),2);
    assert.equal(intersections.prismRay(hit,{...box,outline:[...box.outline].reverse()}),2);
    assert.equal(intersections.prismRay({origin:[.5,1,.5],direction:[1,0,0]},box),0);
    assert.equal(intersections.prismRay({origin:[2,1,.5],direction:[0,0,1]},box),null);
    assert.equal(intersections.prismRay({origin:[.9,3,.9],direction:[0,-1,0]},box),null);
    assert.equal(intersections.prismRay({origin:[.5,3,.5],direction:[0,-1,0]},box),1);
});
test('AABB fallback and invalid/degenerate inputs stay finite and predictable',()=>{
    const hit={origin:[.5,1,-2],direction:[0,0,1]};
    assert.equal(intersections.prismRay(hit,{min:box.min,max:box.max}),2);
    assert.equal(intersections.prismRay({...hit,direction:[0,0,0]},box),null);
    assert.equal(intersections.prismRay({...hit,origin:[NaN,1,1]},box),null);
    assert.equal(intersections.prismRay(hit,{...box,outline:[[0,0],[.5,.5],[1,1]]}),null);
    assert.equal(intersections.prismRay(hit,{min:[1,0,0],max:[0,1,1]}),null);
});
