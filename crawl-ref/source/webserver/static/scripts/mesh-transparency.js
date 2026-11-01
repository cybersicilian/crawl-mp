/* Sort individual surface quads with sprite planes, rather than whole grid cells. */
define([], function () {
    "use strict";
    function blended(material) { return Boolean(material.actor || material.transparent || material.opacity < 1 || material.transmission > 0); }
    function faces(data) {
        var result=[],vertices=data.length/9;
        for(var start=0;start<vertices;start+=6){
            var count=Math.min(6,vertices-start),center=[0,0,0];
            for(var n=0;n<count;n++)for(var axis=0;axis<3;axis++)center[axis]+=data[(start+n)*9+axis]/count;
            result.push({start:start,count:count,center:center});
        }
        return result;
    }
    function order(groups,eye,forward) {
        var result=[];
        groups.forEach(function(group){(group.faces||[]).forEach(function(face){
            var depth=0;for(var axis=0;axis<3;axis++)depth+=(face.center[axis]-eye[axis])*forward[axis];
            result.push({buffer:group.buffer,material:group.material,start:face.start,count:face.count,depth:depth});
        });});
        return result.sort(function(a,b){return b.depth-a.depth;});
    }
    return {blended:blended,faces:faces,order:order};
});
