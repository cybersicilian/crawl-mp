/* Bounded wrist trajectories and grip anchoring for any foreground volume. */
define(["sprite-voxels"],function(volumes){
    "use strict";
    function progress(value){return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;}
    function curve(time,points){
        for(var i=1;i<points.length;i++)if(time<=points[i][0]){
            var a=points[i-1],b=points[i],t=(time-a[0])/(b[0]-a[0]);t=t*t*(3-2*t);
            return a[1]+(b[1]-a[1])*t;
        }
        return points[points.length-1][1];
    }
    function at(kind,value,side){
        var t=progress(value),hand=side==="offhand"?-1:1,amount=Math.pow(Math.sin(Math.PI*t),2);
        var result={yaw:0,pitch:0,roll:0};
        if(t===0||t===1)return result;
        if(kind==="attack"){
            var strike=curve(t,[[0,0],[.2,-.22],[.55,1],[1,0]]);
            result.yaw=hand*.75*strike;result.pitch=-.5*strike;result.roll=hand*.08*strike;
        }else if(kind==="cast"){
            result.yaw=hand*.22*amount;result.pitch=-.34*amount;
        }else if(kind==="block"){
            result.yaw=-hand*.5*amount;result.pitch=-.12*amount;
        }else if(kind==="fire"){
            result.yaw=-hand*.13*amount;result.pitch=.24*amount;
        }else if(kind==="throw"){
            result.yaw=-hand*.35*amount;result.pitch=-.65*amount;
        }
        return result;
    }
    function anchor(base,delta,pivot){
        var next=Object.assign({},base,{yaw:(base.yaw||0)+delta.yaw,pitch:(base.pitch||0)+delta.pitch,roll:(base.roll||0)+delta.roll});
        var before=volumes.project(pivot,base),after=volumes.project(pivot,next),scale=base.scale||1;
        next.x=(base.x||0)+(before[0]-after[0])*scale;
        next.y=(base.y||0)+(after[1]-before[1])*scale;
        return next;
    }
    function align(base,pivot,target){
        var projected=volumes.project(pivot,base),scale=base.scale||1;
        return Object.assign({},base,{x:target[0]-projected[0]*scale,y:target[1]+projected[1]*scale});
    }
    function localPoint(pose,screen,z){
        z=z||0;
        var origin=volumes.project([0,0,z],pose),x=volumes.project([1,0,0],pose),y=volumes.project([0,1,0],pose);
        var determinant=x[0]*y[1]-x[1]*y[0];if(Math.abs(determinant)<1e-6)return null;
        var u=(screen[0]-(pose.x||0))/(pose.scale||1)-origin[0];
        var v=((pose.y||0)-screen[1])/(pose.scale||1)-origin[1];
        return [(u*y[1]-v*y[0])/determinant,(x[0]*v-x[1]*u)/determinant,z];
    }
    return {at:at,anchor:anchor,align:align,localPoint:localPoint};
});
