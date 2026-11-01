/* Exact ray clipping against bounded convex vertical prisms. No rendering state. */
define([],function(){
    "use strict";
    var epsilon=1e-9;
    function vector(value,length){return value&&value.length>=length&&Array.prototype.slice.call(value,0,length).every(Number.isFinite);}
    function prismRay(ray,box){
        if(!ray||!box||!vector(ray.origin,3)||!vector(ray.direction,3)||!vector(box.min,3)||!vector(box.max,3))return null;
        if(Math.hypot.apply(null,ray.direction)<epsilon)return null;
        var near=0,far=Infinity;
        function clip(normal,limit){
            var distance=0,slope=0;
            for(var axis=0;axis<3;axis++){distance+=normal[axis]*ray.origin[axis];slope+=normal[axis]*ray.direction[axis];}
            var remaining=limit-distance;
            if(Math.abs(slope)<epsilon)return remaining>=-epsilon;
            var time=remaining/slope;
            if(slope<0)near=Math.max(near,time);else far=Math.min(far,time);
            return near<=far+epsilon;
        }
        for(var axis=0;axis<3;axis++){
            if(box.min[axis]>box.max[axis])return null;
            var positive=[0,0,0],negative=[0,0,0];positive[axis]=1;negative[axis]=-1;
            if(!clip(positive,box.max[axis])||!clip(negative,-box.min[axis]))return null;
        }
        if(box.outline){
            var outline=box.outline;if(!Array.isArray(outline)||outline.length<3||!outline.every(function(p){return vector(p,2);}))return null;
            var area=0;
            for(var n=0;n<outline.length;n++){var a=outline[n],b=outline[(n+1)%outline.length];area+=a[0]*b[1]-b[0]*a[1];}
            if(Math.abs(area)<epsilon)return null;
            var orientation=area>0?1:-1;
            for(var i=0;i<outline.length;i++){
                var a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1];
                if(!clip([dz*orientation,0,-dx*orientation],(dz*a[0]-dx*a[1])*orientation))return null;
            }
        }
        return far>epsilon&&Number.isFinite(near)?Math.max(0,near):null;
    }
    return {prismRay:prismRay};
});
