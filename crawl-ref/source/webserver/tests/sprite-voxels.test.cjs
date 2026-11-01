const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
let voxels;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/scripts/sprite-voxels.js'),'utf8'), {
    define(deps, factory) { voxels = factory(); }
});
test('transparent sprite holes stay empty and adjacent voxels omit internal side faces', () => {
    const pixels = new Uint8ClampedArray([200,100,50,255, 10,20,30,255, 255,0,0,0]);
    const before = pixels.slice(), model = voxels.build(pixels,3,1);
    assert.equal(model.voxels,2);assert.equal(model.faces.length,10);
    assert.equal(model.width,2);assert.equal(model.height,1);
    assert.equal(model.faces.filter(face=>face.colour[0]===200).length,5);
    assert.deepEqual(pixels,before);
    assert(!model.faces.some(face=>face.colour[0]===255));
});
test('empty, malformed and oversized sources cannot allocate voxel models', () => {
    assert.equal(voxels.build(new Uint8Array(16),2,2),null);
    assert.equal(voxels.build(new Uint8Array(4),2,2),null);
    assert.equal(voxels.build(new Uint8Array(129*4),129,1),null);
    const model=voxels.build(new Uint8Array([1,2,3,255]),1,1,{depth:100});
    assert.equal(model.depth,12);
});
test('rotation exposes real depth while preserving finite projection', () => {
    const front=voxels.project([1,2,3],{}),side=voxels.project([1,2,3],{yaw:Math.PI/2});
    assert.deepEqual(Array.from(front),[1,2,3]);
    assert(Math.abs(side[0]-3)<1e-6);assert(Math.abs(side[2]+1)<1e-6);
});
test('optional icon-ink removal preserves enclosed engraving and predominantly dark materials', () => {
    const pixels=new Uint8ClampedArray(7*7*4);
    for(let y=1;y<6;y++)for(let x=1;x<6;x++) {
        const at=(y*7+x)*4,ink=x===1||x===5||y===1||y===5||x===3&&y===3;
        pixels.set(ink?[0,0,0,255]:[160,180,195,255],at);
    }
    const before=pixels.slice(),source=voxels.build(pixels,7,7),volume=voxels.build(pixels,7,7,{trimOutline:true,bevel:true,dome:2});
    assert.equal(source.voxels,25);assert.equal(volume.voxels,9);assert.equal(volume.trimmed,16);
    assert(volume.faces.some(face=>face.colour[0]===0),'Enclosed dark engraving remains');
    assert(volume.faces.some(face=>Math.abs(face.normal[2])>.01&&Math.abs(face.normal[2])<.99),'Bevels create sloped normals');
    assert(volume.faces.every(face=>face.points.every(point=>point.every(Number.isFinite))));
    assert.deepEqual(pixels,before);
    const dark=new Uint8ClampedArray(3*3*4);for(let i=0;i<9;i++)dark.set([12,14,17,255],i*4);
    assert.equal(voxels.build(dark,3,3,{trimOutline:true}).voxels,9);
});
test('posed bounds fit the sculpted model, including dome depth and rotated silhouettes', () => {
    const pixels=new Uint8ClampedArray(5*5*4);for(let i=0;i<25;i++)pixels.set([170,180,190,255],i*4);
    const model=voxels.build(pixels,5,5,{bevel:true,dome:2}),pose={yaw:.8,pitch:-.2,roll:.5};
    const box=voxels.bounds(model,pose);
    assert(box.width>0&&box.height>0);
    for(const face of model.faces)for(const point of face.points) {
        const p=voxels.project(point,pose);assert(p[0]>=box.left&&p[0]<=box.right&&p[1]>=box.bottom&&p[1]<=box.top);
    }
});
test('axis-aligned sampling keeps the upper end upright and preserves physical depth', () => {
    const pixels=new Uint8ClampedArray(7*7*4);
    for(let i=0;i<7;i++)pixels.set(i<3?[220,80,70,255]:[60,100,220,255],(i*7+i)*4);
    const model=voxels.build(pixels,7,7,{alignAxis:true,bevel:true,depth:12});
    assert.equal(model.axis,Math.PI/2);assert.equal(model.depth,12);assert(model.height>=model.width*3);
    const red=model.faces.filter(face=>face.colour[0]>face.colour[2]);
    const blue=model.faces.filter(face=>face.colour[2]>face.colour[0]);
    const mean=faces=>faces.reduce((sum,face)=>sum+face.points.reduce((s,p)=>s+p[1],0)/4,0)/faces.length;
    assert(mean(red)>mean(blue),'Aligning a negative diagonal must not invert the grip and tip');
});
test('shared contour vertices are rescaled once so narrow sprites cannot grow spikes', () => {
    const pixels=new Uint8ClampedArray(9*9*4);
    for(let i=0;i<9;i++)pixels.set([150,160,170,255],(i*9+i)*4);
    const model=voxels.build(pixels,9,9,{alignAxis:true,bevel:true,depth:1.4});
    const cell=1/model.resolution;
    for(const face of model.faces)for(const axis of [0,1]) {
        const values=face.points.map(point=>point[axis]);
        assert(Math.max(...values)-Math.min(...values)<=cell+1e-6,'Every face stays inside one resampled voxel');
    }
});
