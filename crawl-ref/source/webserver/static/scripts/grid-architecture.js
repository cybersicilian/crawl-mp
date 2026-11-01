/* Grid-aligned architecture. All identities, textures and action locations are supplied. */
define(["grid-door-models", "grid-dungeon-fixtures"], function (models,fixtures) {
    "use strict";
    function door(mesh,options){return models.door(mesh,options);}
    function connector(mesh,options){
        var x=options.x,z=options.z,stone=options.stone,rim=options.rim,loc=options.cell;
        // Low approach stones ground native entrance art without a second doorway or a solid barrier.
        if(options.kind==="portal"){
            for(var n=0;n<12;n++){
                var a=n*Math.PI/6,b=(n+1)*Math.PI/6;
                var points=[[x+.5+Math.cos(a)*.43,.018,z+.5+Math.sin(a)*.43],
                    [x+.5+Math.cos(b)*.43,.018,z+.5+Math.sin(b)*.43],
                    [x+.5+Math.cos(b)*.36,.018,z+.5+Math.sin(b)*.36],
                    [x+.5+Math.cos(a)*.36,.018,z+.5+Math.sin(a)*.36]];
                mesh.quad(rim,points);
            }
        }else if(options.kind!=="hatch"){
            mesh.box(stone,[x+.12,-.03,z+.12],[x+.88,.018,z+.88],loc);
            mesh.box(rim,[x+.1,0,z+.1],[x+.19,.075,z+.9],loc);
            mesh.box(rim,[x+.81,0,z+.1],[x+.9,.075,z+.9],loc);
            mesh.box(rim,[x+.19,0,z+.81],[x+.81,.045,z+.9],loc);
        }
    }
    function stairs(mesh, options) {
        var x=options.x,z=options.z,stone=options.stone,rim=options.rim,dark=options.dark,loc=options.cell;
        function box(material,u,y,v,U,Y,V){mesh.box(material,[x+u,y,z+v],[x+U,Y,z+V],loc);}
        if(options.down) {
            // This is a genuine opening: no floor or hidden pick plane spans the well.
            box(rim,0,-.08,0,.14,.035,1);
            box(rim,.86,-.08,0,1,.035,1);
            box(rim,.14,-.08,.8,.86,.035,1);
            box(rim,.14,-.08,0,.86,.035,.06);
            for(var step=0;step<6;step++) {
                var edge=.8-step*.12,top=-(step+1)*.14;
                box(stone,.14,-1.12,edge-.12,.86,top,edge);
            }
            box(stone,.065,-1.15,.04,.14,.11,.86);
            box(stone,.86,-1.15,.04,.935,.11,.86);
            box(stone,.14,-1.15,.015,.86,.035,.06);
            box(dark,.14,-1.18,.06,.86,-1.15,.8);
        } else {
            for(var rise=0;rise<6;rise++) {
                var start=.8-(rise+1)*.12,height=(rise+1)*.14;
                box(stone,.14,0,start,.86,height,start+.12);
                box(rim,.065,0,start,.14,height+.1,start+.12);
                box(rim,.86,0,start,.935,height+.1,start+.12);
            }
            box(rim,.14,.84,.015,.86,.87,.08);
        }
    }
    function surfaceHeight(kind,u,v){
        if(kind!=="stairs_up"&&kind!=="stairs_down")return 0;
        if(kind==="stairs_down"){
            if(u<=.14||u>=.86||v>=.8||v<.06)return .035;
            if(v<.08)return -1.15;
            return -(Math.min(5,Math.max(0,Math.floor((.8-v-0.0000001)/.12)))+1)*.14;
        }
        if(v>=.8||u<.065||u>.935)return 0;
        if(v<.08)return u>=.14&&u<=.86&&v>=.015?.87:0;
        var tread=(Math.min(5,Math.max(0,Math.floor((.8-v-0.0000001)/.12)))+1)*.14;
        return tread+(u<.14||u>.86?.1:0);
    }
    function overlay(mesh,options){
        var stairs=/^stairs_/.test(options.kind||""),us=stairs?[0,.065,.14,.86,.935,1]:[0,1];
        var vs=stairs?[0,.015,.06,.08,.2,.32,.44,.56,.68,.8,1]:[0,1];
        for(var u=0;u<us.length-1;u++)for(var v=0;v<vs.length-1;v++){
            var a=us[u],b=us[u+1],c=vs[v],d=vs[v+1];
            var h=surfaceHeight(options.kind,(a+b)/2,(c+d)/2)+.012;
            mesh.quad(options.material,[[options.x+a,h,options.z+c],[options.x+a,h,options.z+d],
                [options.x+b,h,options.z+d],[options.x+b,h,options.z+c]],[[a,c],[a,d],[b,d],[b,c]]);
        }
    }
    return {door:door,gateway:models.gateway,hatch:function(mesh,options){return fixtures.build(mesh,{x:options.x,z:options.z,profile:{kind:"hatch",direction:options.up?"up":"down",active:true},stone:options.frame,wood:options.panel,metal:options.metal,dark:options.dark,cell:options.cell});},fixture:fixtures.build,connector:connector,stairs:stairs,surfaceHeight:surfaceHeight,overlay:overlay};
});
