/* Convex local-space prisms and rings. Callers own semantics and materials. */
define([],function(){
    "use strict";
    function handedness(transform){
        var o=transform(0,0,0),a=transform(1,0,0),b=transform(0,1,0),c=transform(0,0,1);
        a=a.map(function(v,i){return v-o[i];});b=b.map(function(v,i){return v-o[i];});c=c.map(function(v,i){return v-o[i];});
        return a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    }
    function signedArea(polygon){return polygon.reduce(function(sum,p,i){var q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-p[1]*q[0];},0);}
    function emit(mesh,material,points,uv,flip){
        var order=flip?[2,1,0,3]:[0,1,2,3];
        mesh.quad(material,order.map(function(i){return points[i];}),uv&&order.map(function(i){return uv[i];}));
    }
    function prism(mesh,material,polygon,front,back,transform,cell,domain){
        if(!material||polygon.length<3)return;
        if(signedArea(polygon)<0)polygon=polygon.slice().reverse();
        var flip=handedness(transform)<0;
        var near=polygon.map(function(p){return transform(p[0],p[1],front);});
        var far=polygon.map(function(p){return transform(p[0],p[1],back);});
        var xs=polygon.map(function(p){return p[0];}),ys=polygon.map(function(p){return p[1];});
        var minX=Math.min.apply(null,xs),minY=Math.min.apply(null,ys),width=Math.max.apply(null,xs)-minX,height=Math.max.apply(null,ys)-minY;
        function uv(i){
            var point=polygon[i],space=domain||material.uvSpace;
            if(Number.isFinite(material.tileScale)&&material.tileScale>0)return [point[0]/material.tileScale,-point[1]/material.tileScale];
            if(space)return [(point[0]-space.origin[0])/space.size[0],1-(point[1]-space.origin[1])/space.size[1]];
            return [(point[0]-minX)/Math.max(.001,width),1-(point[1]-minY)/Math.max(.001,height)];
        }
        for(var i=1;i<polygon.length-1;i++){
            emit(mesh,material,[near[0],near[i+1],near[i],near[i]],[uv(0),uv(i+1),uv(i),uv(i)],flip);
            emit(mesh,material,[far[0],far[i],far[i+1],far[i+1]],[uv(0),uv(i),uv(i+1),uv(i+1)],flip);
        }
        for(var n=0;n<polygon.length;n++){var next=(n+1)%polygon.length;
            emit(mesh,material,[near[n],near[next],far[next],far[n]],null,flip);
        }
        if(cell&&mesh.bounds){var points=near.concat(far);
            mesh.bounds([0,1,2].map(function(axis){return Math.min.apply(null,points.map(function(p){return p[axis];}));}),
                [0,1,2].map(function(axis){return Math.max.apply(null,points.map(function(p){return p[axis];}));}),cell);}
    }
    function ring(mesh,material,u,y,radius,thickness,front,back,transform,cell,segments){
        segments=segments||12;
        for(var n=0;n<segments;n++){
            var a=n*Math.PI*2/segments,b=(n+1)*Math.PI*2/segments;
            prism(mesh,material,[[u+Math.cos(a)*radius,y+Math.sin(a)*radius],
                [u+Math.cos(b)*radius,y+Math.sin(b)*radius],
                [u+Math.cos(b)*(radius-thickness),y+Math.sin(b)*(radius-thickness)],
                [u+Math.cos(a)*(radius-thickness),y+Math.sin(a)*(radius-thickness)]],front,back,transform,cell);
        }
    }
    function bevel(mesh,material,polygon,front,back,amount,transform,cell){
        amount=Math.min(amount,Math.abs(back-front)*.4);
        if(amount<=0)return prism(mesh,material,polygon,front,back,transform,cell);
        if(signedArea(polygon)<0)polygon=polygon.slice().reverse();
        var sign=1,flip=handedness(transform)<0;
        var inset=polygon.map(function(p,i){
            var a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[(i+1)%polygon.length];
            var d=[p[0]-a[0],p[1]-a[1]],e=[b[0]-p[0],b[1]-p[1]],dl=Math.hypot(d[0],d[1])||1,el=Math.hypot(e[0],e[1])||1;
            var P=[a[0]-sign*d[1]/dl*amount,a[1]+sign*d[0]/dl*amount];
            var Q=[p[0]-sign*e[1]/el*amount,p[1]+sign*e[0]/el*amount],cross=d[0]*e[1]-d[1]*e[0];
            if(Math.abs(cross)<.000001)return Q;
            var t=((Q[0]-P[0])*e[1]-(Q[1]-P[1])*e[0])/cross;
            return [P[0]+t*d[0],P[1]+t*d[1]];
        });
        var direction=back>=front?1:-1;
        prism(mesh,material,polygon,front+direction*amount,back-direction*amount,transform,cell);
        // The inset cap uses the same UV domain as the original polygon.
        var xs=polygon.map(function(p){return p[0];}),ys=polygon.map(function(p){return p[1];});
        var domain=material.uvSpace||{origin:[Math.min.apply(null,xs),Math.min.apply(null,ys)],size:[Math.max.apply(null,xs)-Math.min.apply(null,xs),Math.max.apply(null,ys)-Math.min.apply(null,ys)]};
        prism(mesh,material,inset,front,back,transform,null,domain);
        [front,back].forEach(function(depth,face){for(var n=0;n<polygon.length;n++){
            var next=(n+1)%polygon.length,inner=face?depth-direction*amount:depth+direction*amount;
            emit(mesh,material,[transform(polygon[n][0],polygon[n][1],inner),transform(polygon[next][0],polygon[next][1],inner),
                transform(inset[next][0],inset[next][1],depth),transform(inset[n][0],inset[n][1],depth)],null,face?flip:!flip);
        }});
    }
    function torus(mesh,material,u,y,radius,tube,depth,transform,cell,segments,sides){
        segments=segments||16;sides=sides||6;var points=[],flip=handedness(transform)<0;
        function point(a,b){return transform(u+(radius+tube*Math.cos(b))*Math.cos(a),y+(radius+tube*Math.cos(b))*Math.sin(a),depth+tube*Math.sin(b));}
        for(var i=0;i<segments;i++)for(var j=0;j<sides;j++){
            var a=i*Math.PI*2/segments,A=(i+1)*Math.PI*2/segments,b=j*Math.PI*2/sides,B=(j+1)*Math.PI*2/sides;
            var quad=[point(a,b),point(A,b),point(A,B),point(a,B)];emit(mesh,material,quad,null,flip);points.push.apply(points,quad);
        }
        if(cell&&mesh.bounds)mesh.bounds([0,1,2].map(function(axis){return Math.min.apply(null,points.map(function(p){return p[axis];}));}),
            [0,1,2].map(function(axis){return Math.max.apply(null,points.map(function(p){return p[axis];}));}),cell);
    }
    return {prism:prism,ring:ring,bevel:bevel,torus:torus};
});
