/* World-space loot silhouettes. No inference of item identities or exact pile counts. */
define(["mesh-solids"],function(solids){
    "use strict";
    function build(mesh,options){
        var profile=options.profile,base=options.elevation||0,loc=options.cell;
        if(!profile)return;
        if(profile.kind==="gold")profile.coins.forEach(function(coin){
            var x=options.x+.5+coin.x,z=options.z+.5+coin.z,y=base+coin.y;
            var ca=Math.cos(coin.angle||0),sa=Math.sin(coin.angle||0),ct=Math.cos(coin.tilt||0),st=Math.sin(coin.tilt||0);
            function point(u,v,depth){var zLocal=depth*st-v*ct;return [x+u*ca-zLocal*sa,y+depth*ct+v*st,z+u*sa+zLocal*ca];}
            var circle=Array.from({length:12},function(_,n){var a=n*Math.PI/6;return [Math.cos(a)*coin.radius,Math.sin(a)*coin.radius];});
            solids.prism(mesh,options.gold,circle,0,coin.height-.004,point,loc);
            for(var facet=0;facet<12;facet++){
                var a=facet*Math.PI/6,b=(facet+1)*Math.PI/6,r=coin.radius,inner=r-.009;
                mesh.quad(options.goldRim||options.gold,[point(Math.cos(a)*r,Math.sin(a)*r,coin.height-.004),
                    point(Math.cos(b)*r,Math.sin(b)*r,coin.height-.004),point(Math.cos(b)*inner,Math.sin(b)*inner,coin.height),
                    point(Math.cos(a)*inner,Math.sin(a)*inner,coin.height)]);
            }
            var cap=circle.map(function(p){return [p[0]*.84,p[1]*.84];});
            solids.prism(mesh,options.gold,cap,coin.height-.001,coin.height,point,loc);
            // Stamped center is relief, and occasional tilted coins catch different light directions.
            solids.prism(mesh,options.goldRim||options.gold,[[-.014,-.008],[.014,-.008],[.014,.008],[-.014,.008]],
                coin.height+.002,coin.height+.006,point,loc);
        });
        var layers=profile.layers||[],style=profile.style||{};
        var surface=options.stack&&Object.assign({},options.stack,{roughness:.96,metalness:0,tint:[.52,.56,.62]});
        var edge=options.stackEdge||surface;
        if(layers.length&&surface){
            var contact=options.contact||Object.assign({},surface,{tint:[.15,.16,.19],opacity:.48,transparent:true,castShadow:false});
            var contactW=(style.contactWidth||.51)/2,contactD=(style.contactDepth||.39)/2;
            var footprint=Array.from({length:12},function(_,n){var a=n*Math.PI/6,r=n%3===0?.95:1;
                return [options.x+.5+Math.cos(a)*contactW*r,base+.004,options.z+.5-Math.sin(a)*contactD*r];});
            for(var foot=1;foot<footprint.length-1;foot++)mesh.quad(contact,[footprint[0],footprint[foot],footprint[foot+1],footprint[foot+1]]);
            layers.forEach(function(layer){
                var c=Math.cos(layer.angle),s=Math.sin(layer.angle),w=layer.width/2,d=layer.depth/2;
                var cut=Math.min(w*.5,d*.5,layer.corner||.035),bevel=Math.min(layer.height*.55,layer.bevel||.008);
                function point(u,v,height){return [options.x+.5+layer.x+u*c+v*s,base+layer.y+height,options.z+.5+layer.z+u*s-v*c];}
                var polygon=[[-w+cut,-d],[w-cut,-d],[w,-d+cut],[w,d-cut],
                    [w-cut,d],[-w+cut,d],[-w,d-cut],[-w,-d+cut]];
                var inset=Math.min(.012,w*.12,d*.12),cap=polygon.map(function(p){return [p[0]*(1-inset/w),p[1]*(1-inset/d)];});
                solids.prism(mesh,surface,polygon,0,layer.height-bevel,point,loc);
                for(var n=0;n<polygon.length;n++){
                    var next=(n+1)%polygon.length;
                    mesh.quad(edge,[point(polygon[n][0],polygon[n][1],layer.height-bevel),
                        point(polygon[next][0],polygon[next][1],layer.height-bevel),
                        point(cap[next][0],cap[next][1],layer.height),point(cap[n][0],cap[n][1],layer.height)]);
                }
                solids.prism(mesh,surface,cap,layer.height-.001,layer.height,point,loc);
            });
        }
        return {kind:profile.kind,coins:profile.coins.length,stack:profile.stack.present,quantity:profile.quantity,
            style:style.kind||"layered-pile",topElevation:style.topElevation||0};
    }
    return {build:build};
});
