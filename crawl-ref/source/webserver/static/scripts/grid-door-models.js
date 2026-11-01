/* Continuous door runs with shared local transforms, material domains and beveled joinery. */
define(["mesh-solids"],function(solids){
    "use strict";
    var dimensions={width:.82,spring:1.46,radius:.42,top:1.88,thickness:.075};
    function builder(mesh,options,moving){
        var hinge=options.reverse?options.right:options.left;
        function point(u,y,v){
            if(moving&&options.open){var distance=u-hinge;u=hinge+(options.reverse?v:-v);v=.5+(options.reverse?-distance:distance);}
            else if(moving)v+=.5;
            return options.horizontal?[options.x+u,y,options.z+v]:[options.x+v,y,options.z+u];
        }
        function polygon(material,points,front,back,bevel){
            if(bevel)solids.bevel(mesh,material,points,front,back,bevel,point,options.cell);
            else solids.prism(mesh,material,points,front,back,point,options.cell);
        }
        function box(material,u,y,v,U,Y,V,bevel){polygon(material,[[u,y],[U,y],[U,Y],[u,Y]],v,V,bevel);}
        return {point:point,polygon:polygon,box:box};
    }
    function prepare(options){
        var tone=options.frame.tint||[1,1,1];
        return Object.assign({},options,{left:Number.isFinite(options.left)?options.left:.09,right:Number.isFinite(options.right)?options.right:.91,
            reverse:/right|down/.test(options.segment||""),
            frame:Object.assign({},options.frame,{modelRole:"frame",tint:[tone[0]*.78,tone[1]*.8,tone[2]*.76],roughness:.9})});
    }
    function arch(mesh,options){
        var build=builder(mesh,options,false),frame=options.frame,gate=options.segment;
        var left=options.joinedBefore===undefined?!gate||gate==="left"||gate==="up":!options.joinedBefore;
        var right=options.joinedAfter===undefined?!gate||gate==="right"||gate==="down":!options.joinedAfter;
        if(left)for(var l=0;l<5;l++)build.box(frame,0,l*.292,.27,.085,l*.292+.287,.73,.003);
        if(right)for(var r=0;r<5;r++)build.box(frame,.915,r*.292,.27,1,r*.292+.287,.73,.003);
        if(gate)build.box(options.wall||frame,0,1.9,.27,1,3.35,.73);
        else {
            for(var n=0;n<9;n++){
                var a=n*Math.PI/9+.006,b=(n+1)*Math.PI/9-.006;
                build.polygon(frame,[[.5+Math.cos(a)*.425,1.46+Math.sin(a)*.425],
                    [.5+Math.cos(a)*.5,1.46+Math.sin(a)*.5],
                    [.5+Math.cos(b)*.5,1.46+Math.sin(b)*.5],
                    [.5+Math.cos(b)*.425,1.46+Math.sin(b)*.425]],.25,.75,.003);
            }
            for(var c=0;c<10;c++){
                var u=c/10,U=(c+1)/10,low=1.445+Math.sqrt(Math.max(0,.25-Math.pow(u-.5,2)));
                var high=1.445+Math.sqrt(Math.max(0,.25-Math.pow(U-.5,2)));
                build.polygon(options.wall||frame,[[u,low],[U,high],[U,3.35],[u,3.35]],.27,.73);
            }
        }
        build.box(frame,options.left-.01,0,.26,options.right+.01,.025,.74,.003);
    }
    function leafTop(u,segment){return segment?1.88:1.46+Math.sqrt(Math.max(0,.42*.42-Math.pow(u-.5,2)));}
    function door(mesh,input){
        var options=prepare(input);arch(mesh,options);
        var build=builder(mesh,options,true),clear=options.clear,planks=0,left=options.left,right=options.right,width=right-left;
        var panel=Object.assign({},options.panel,{modelRole:"leaf",uvSpace:{origin:[left,.045],size:[width,1.835]}});
        var metal=options.metal,skip=options.open&&options.segment==="middle";
        if(!skip&&!clear)for(var n=0;n<6;n++){
            if(options.broken&&n%3===1)continue;
            var u=left+n*width/6+.0015,U=left+(n+1)*width/6-.0015;
            var top=options.broken?Math.min(leafTop(u,options.segment),.65+(n%3)*.32):leafTop(u,options.segment);
            var topU=options.broken?Math.max(.35,top-.19):leafTop(U,options.segment);
            build.polygon(panel,[[u,.045],[U,.045],[U,topU],[(u+U)/2,Math.max(top,topU)],[u,top]],-.0375,.0375,.005);planks++;
        }
        if(!skip&&clear){
            build.polygon(panel,[[left+.065,.12],[right-.065,.12],[right-.065,leafTop(right-.065,options.segment)-.06],
                [(left+right)/2,1.83],[left+.065,leafTop(left+.065,options.segment)-.06]],-.014,.014);
            [left,right-.055].forEach(function(u){build.box(metal,u,.045,-.04,u+.055,leafTop(u+.0275,options.segment),.04,.004);});
            [.48,1.04,1.6].forEach(function(y){build.box(metal,left+.05,y,-.028,right-.05,y+.027,.028,.003);});
        }
        if(!skip){
            [.42,1.34].forEach(function(y){
                if(options.broken&&y>1)return;
                build.box(metal,left+.012,y,-.056,right-.012,y+.047,.056,.004);
                [.07,.25,.75,.93].forEach(function(part){
                    var u=left+part*width,points=Array.from({length:8},function(_,i){var a=i*Math.PI/4;return [u+Math.cos(a)*.011,y+.023+Math.sin(a)*.011];});
                    build.polygon(metal,points,-.066,.066,.002);
                });
            });
            if(options.segment!=="middle")[.35,1.28].forEach(function(y){var hinge=options.reverse?right-.04:left-.02;build.box(metal,hinge,y,-.066,hinge+.065,y+.12,.066,.004);});
            [-1,1].forEach(function(side){
                function faceBox(material,u,y,v,U,Y,V){build.box(material,u,y,side>0?v:-V,U,Y,side>0?V:-v,.003);}
                var handle=options.reverse?left+.14:right-.14;
                if(options.segment!=="middle"){
                    faceBox(metal,handle-.025,.84,-.054,handle+.025,.96,-.04);
                    solids.torus(mesh,metal,handle,.85,.046,.01,-.078,function(u,y,v){return build.point(u,y,v*side);},options.cell,16,6);
                }
                if(options.runed){
                    faceBox(metal,left+width*.12,1.075,-.049,right-width*.12,1.255,-.039);
                    var patterns=[[[0,-.05,0,.05],[-.026,.02,.026,-.02]],
                        [[-.025,-.045,0,.05],[0,.05,.025,-.045],[-.018,-.018,.018,-.018]],
                        [[-.025,0,0,.05],[0,.05,.025,0],[.025,0,0,-.05],[0,-.05,-.025,0]],
                        [[-.025,-.05,-.025,.05],[-.025,.05,.025,.018],[-.025,-.005,.025,-.035]],
                        [[-.025,.045,.025,-.045],[0,-.05,0,.05]]];
                    patterns.forEach(function(strokes,k){var center=left+width*(.22+k*.14);strokes.forEach(function(s){
                        var dx=s[2]-s[0],dy=s[3]-s[1],length=Math.hypot(dx,dy),px=-dy/length*.004,py=dx/length*.004;
                        var points=[[center+s[0]+px,1.165+s[1]+py],[center+s[2]+px,1.165+s[3]+py],
                            [center+s[2]-px,1.165+s[3]-py],[center+s[0]-px,1.165+s[1]-py]];
                        build.polygon(options.rune,points,-.056*side,-.05*side,.001);
                    });});
                }
                if(options.sealed){
                    faceBox(options.seal,left+width*.24,.87,-.068,right-width*.24,.92,-.052);
                    var center=(left+right)/2;
                    solids.ring(mesh,options.seal,center,.9,.089,.012,-.081*side,-.07*side,build.point,options.cell,8);
                }
            });
        }
        if(!options.open&&!options.broken&&mesh.bounds){
            var corners=[build.point(left,.045,-.0375),build.point(right,1.88,.0375)];
            mesh.bounds([0,1,2].map(function(axis){return Math.min(corners[0][axis],corners[1][axis]);}),
                [0,1,2].map(function(axis){return Math.max(corners[0][axis],corners[1][axis]);}),options.cell);
        }
        return {kind:clear?"clear-door":options.broken?"broken-door":options.segment?"gate":"arched-door",planks:planks,
            width:width,height:1.88,left:left,right:right,joinedBefore:Boolean(options.joinedBefore),joinedAfter:Boolean(options.joinedAfter),
            runed:Boolean(options.runed),sealed:Boolean(options.sealed),open:Boolean(options.open),custom:true};
    }
    function gateway(mesh,input){
        var options=prepare(Object.assign({},input,{horizontal:input.horizontal!==false,open:false}));arch(mesh,options);
        var build=builder(mesh,options,false),points=[[.09,.035],[.91,.035]];
        for(var n=0;n<=12;n++){var a=n*Math.PI/12;points.push([.5+Math.cos(a)*.41,1.46+Math.sin(a)*.41]);}
        build.polygon(options.dark,points,.54,.56);
        if(options.inset)mesh.quad(options.inset,[build.point(.29,2.03,.23),build.point(.71,2.03,.23),build.point(.71,2.45,.23),build.point(.29,2.45,.23)]);
        build.box(options.frame,.12,0,.11,.88,.035,.9,.003);
        return {kind:options.kind+"-gateway",custom:true,nativeInset:Boolean(options.inset),walkable:true};
    }
    return {door:door,gateway:gateway,dimensions:dimensions};
});
