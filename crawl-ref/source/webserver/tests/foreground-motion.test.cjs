const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
function load(name,deps={}){let result;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/scripts',name+'.js'),'utf8'),{define(names,factory){result=factory(...names.map(name=>deps[name]));}});return result;}
const volumes=load('sprite-voxels'),motion=load('foreground-motion',{'sprite-voxels':volumes});
test('all wrist trajectories are finite, bounded and return exactly to rest',()=>{
    for(const kind of ['attack','cast','block','fire','throw'])for(const side of ['main','offhand']){
        for(const time of [0,.1,.2,.55,.9,1,Infinity,NaN]){
            const delta=motion.at(kind,time,side);
            assert(Object.values(delta).every(Number.isFinite));assert(Object.values(delta).every(value=>Math.abs(value)<=.8));
            if(time===0||time===1||!Number.isFinite(time))assert.deepEqual(Array.from(Object.values(delta)),[0,0,0]);
        }
    }
});
test('melee winds up before impact and mirrored wrists expose matching depth',()=>{
    const windup=motion.at('attack',.2,'main'),strike=motion.at('attack',.55,'main'),left=motion.at('attack',.55,'offhand');
    assert(windup.yaw<0&&strike.yaw>0);assert.equal(strike.yaw,-left.yaw);assert.equal(strike.pitch,left.pitch);
    assert(motion.at('fire',.5,'main').pitch>0);assert(motion.at('throw',.5,'main').pitch<0);
});
test('grip anchoring keeps the held point fixed throughout 3D rotation without changing model scale',()=>{
    const base={yaw:-.38,pitch:-.16,roll:-.2,x:256,y:210,scale:14},pivot=[0,-14,0];
    function screen(pose){const p=volumes.project(pivot,pose);return [pose.x+p[0]*pose.scale,pose.y-p[1]*pose.scale];}
    const expected=screen(base);
    for(const time of [.1,.2,.4,.55,.8,1]){
        const pose=motion.anchor(base,motion.at('attack',time,'main'),pivot),actual=screen(pose);
        assert(Math.abs(actual[0]-expected[0])<1e-8);assert(Math.abs(actual[1]-expected[1])<1e-8);assert.equal(pose.scale,base.scale);
    }
    assert.deepEqual(Array.from(Object.values(base)),[-.38,-.16,-.2,256,210,14]);
});
test('attachment alignment and local arm endpoints round-trip under mirrored wrist rotations',()=>{
    for(const side of ['main','offhand'])for(const kind of ['attack','block','cast']){
        const base={yaw:side==='main'?-.25:.25,pitch:-.32,roll:-.18,scale:18.125,x:32,y:63},palm=[0,.45,0],target=[31,34];
        const aligned=motion.align(base,palm,target),pose=motion.anchor(aligned,motion.at(kind,.55,side),palm);
        const p=volumes.project(palm,pose);assert(Math.abs(pose.x+p[0]*pose.scale-target[0])<1e-8);assert(Math.abs(pose.y-p[1]*pose.scale-target[1])<1e-8);
        const endpoint=motion.localPoint(pose,[side==='main'?56:8,80],-.18),projected=volumes.project(endpoint,pose);
        assert(Math.abs(pose.x+projected[0]*pose.scale-(side==='main'?56:8))<1e-8);assert(Math.abs(pose.y-projected[1]*pose.scale-80)<1e-8);
    }
});
const geometry=load('foreground-mesh');
test('block arm connectors have finite outward faces and retain actual material colour',()=>{
    const colour=[94,60,38,255],mesh=geometry.segment([.05,-.17,0],[1,-2,0],.25,.2,colour),middle=[.525,-1.085,0];
    assert.equal(mesh.faces.length,6);
    for(const face of mesh.faces){assert.equal(face.colour,colour);assert(face.normal.every(Number.isFinite));assert(face.normal.reduce((sum,v,i)=>sum+v*(face.points[0][i]-middle[i]),0)>0);}
    assert.equal(geometry.segment([0,0,0],[0,0,0],.25,.2,colour).faces.length,0);
});
