/* Sprite RGBA -> exposed voxel faces. Independent of atlases, games and renderers. */
define([], function () {
    "use strict";
    function build(pixels, width, height, options) {
        options = options || {};
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
            || width > 128 || height > 128 || !pixels || pixels.length !== width * height * 4) return null;
        var threshold = Number.isFinite(options.alpha) ? Math.max(0,Math.min(254,options.alpha)) : 32;
        var depth = Number.isFinite(options.depth) ? Math.max(.5, Math.min(12, options.depth)) : 3;
        var dome = Number.isFinite(options.dome) ? Math.max(0,Math.min(depth*2,options.dome)) : 0;
        var minX = width, minY = height, maxX = -1, maxY = -1, faces = [], count = 0;
        var mask = new Uint8Array(width * height), distance = new Float32Array(width * height);
        for (var p = 0; p < mask.length; p++) mask[p] = pixels[p * 4 + 3] > threshold ? 1 : 0;
        function solid(x, y) { return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1; }
        // Exterior black pixels in an icon are ink/shadow, not a black physical casing.
        // This is opt-in; predominantly dark art and enclosed details stay intact.
        var removed = 0;
        if (options.trimOutline) {
            var outside = new Uint8Array(mask.length), queue = [], total = 0;
            function dark(i) {
                var at = i * 4, max = Math.max(pixels[at], pixels[at+1], pixels[at+2]);
                return max < 38 && max - Math.min(pixels[at], pixels[at+1], pixels[at+2]) < 18;
            }
            function visit(x, y) {
                if (x < 0 || y < 0 || x >= width || y >= height) return;
                var i = y * width + x;
                if (outside[i] || mask[i] && !dark(i)) return;
                outside[i] = 1; queue.push(i);
            }
            for (var edge = 0; edge < width; edge++) { visit(edge, 0); visit(edge, height-1); }
            for (var side = 0; side < height; side++) { visit(0, side); visit(width-1, side); }
            for (var q = 0; q < queue.length; q++) {
                var at = queue[q], qx = at % width, qy = Math.floor(at / width);
                visit(qx-1,qy); visit(qx+1,qy); visit(qx,qy-1); visit(qx,qy+1);
            }
            for (var i = 0; i < mask.length; i++) { total += mask[i]; if (mask[i] && outside[i]) removed++; }
            if (total-removed >= Math.max(4, total*.25)) {
                for (var m = 0; m < mask.length; m++) if (outside[m]) mask[m] = 0;
            } else removed = 0;
        }
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            if (!solid(x, y)) continue;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x + 1);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y + 1); count++;
        }
        if (!count) return null;
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        if (options.alignAxis) {
            var axx=0, ayy=0, axy=0;
            for(var ay=minY;ay<maxY;ay++)for(var ax=minX;ax<maxX;ax++)if(solid(ax,ay)) {
                var ux=ax+.5-cx, uy=cy-ay-.5;axx+=ux*ux;ayy+=uy*uy;axy+=ux*uy;
            }
            var elongation=Math.sqrt(Math.pow(axx-ayy,2)+4*axy*axy)/Math.max(1,axx+ayy);
            if(elongation>.3) {
                var sourceAxis=.5*Math.atan2(2*axy,axx-ayy);if(sourceAxis<0)sourceAxis+=Math.PI;
                var angle=Math.PI/2-sourceAxis,ca=Math.cos(angle),sa=Math.sin(angle);
                var spanX=(maxX-minX)*Math.abs(ca)+(maxY-minY)*Math.abs(sa);
                var spanY=(maxX-minX)*Math.abs(sa)+(maxY-minY)*Math.abs(ca);
                var resolution=Math.min(2,120/Math.max(spanX,spanY),12/depth);
                var rw=Math.ceil(spanX*resolution)+4,rh=Math.ceil(spanY*resolution)+4,rgba=new Uint8ClampedArray(rw*rh*4);
                // Resample into the object's axes before voxelization. A diagonal
                // inventory grid must not become diamond-shaped teeth on a blade.
                for(var oy=0;oy<rh;oy++)for(var ox=0;ox<rw;ox++) {
                    var colour=[0,0,0],covered=0;
                    for(var sy=0;sy<4;sy++)for(var sx=0;sx<4;sx++) {
                        var u=(ox+(sx+.5)/4-rw/2)/resolution,v=(rh/2-oy-(sy+.5)/4)/resolution;
                        var sourceX=Math.floor(cx+u*ca+v*sa),sourceY=Math.floor(cy+u*sa-v*ca);
                        if(!solid(sourceX,sourceY))continue;
                        var sample=(sourceY*width+sourceX)*4;covered++;
                        for(var channel=0;channel<3;channel++)colour[channel]+=pixels[sample+channel];
                    }
                    if(covered>=6) {
                        var target=(oy*rw+ox)*4;
                        for(var component=0;component<3;component++)rgba[target+component]=colour[component]/covered;
                        rgba[target+3]=255;
                    }
                }
                var aligned=build(rgba,rw,rh,{depth:depth*resolution,bevel:options.bevel,dome:dome*resolution});
                if(aligned) {
                    // Faces share contour corners. Scale copies so one corner is
                    // never divided repeatedly through its neighboring faces.
                    aligned.faces.forEach(function(face){face.points=face.points.map(function(point){return point.map(function(v){return v/resolution;});});});
                    aligned.width/=resolution;aligned.height/=resolution;aligned.depth/=resolution;aligned.trimmed=removed;
                    aligned.axis=Math.PI/2;aligned.sourceAxis=sourceAxis;aligned.resolution=resolution;
                    return aligned;
                }
            }
        }
        // A distance field rounds the thickness toward exposed contours. Shared
        // corner heights make connected bevels rather than detached pixel bricks.
        for (var d = 0; d < distance.length; d++) distance[d] = mask[d] ? 128 : 0;
        for (var dy = 0; dy < height; dy++) for (var dx = 0; dx < width; dx++) {
            var index = dy * width + dx;
            if (mask[index]) distance[index] = Math.min(distance[index], dx ? distance[index-1]+1 : 1, dy ? distance[index-width]+1 : 1);
        }
        for (var ry = height-1; ry >= 0; ry--) for (var rx = width-1; rx >= 0; rx--) {
            var ri = ry * width + rx;
            if (mask[ri]) distance[ri] = Math.min(distance[ri], rx+1 < width ? distance[ri+1]+1 : 1, ry+1 < height ? distance[ri+width]+1 : 1);
        }
        function corner(x, y) {
            if (!options.bevel) return depth/2;
            var sum = 0;
            [[x-1,y-1],[x,y-1],[x-1,y],[x,y]].forEach(function (p) {
                if (p[0] >= 0 && p[1] >= 0 && p[0] < width && p[1] < height) sum += distance[p[1]*width+p[0]];
            });
            var bevel = Math.min(1, .18 + sum/4*.3);
            var radial = Math.max(0, 1-Math.pow((x-cx)/Math.max(1,(maxX-minX)/2),2)-Math.pow((y-cy)/Math.max(1,(maxY-minY)/2),2));
            return depth/2*bevel + dome*radial;
        }
        function face(points, colour, normal) {
            if (options.bevel) {
                var a = points[1].map(function (v,i) { return v-points[0][i]; });
                var b = points[3].map(function (v,i) { return v-points[0][i]; });
                normal = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
                var length = Math.hypot.apply(null,normal) || 1; normal = normal.map(function (v) { return v/length; });
            }
            faces.push({ points: points, colour: colour, normal: normal });
        }
        var xx = 0, yy = 0, xy = 0;
        for (var py = minY; py < maxY; py++) for (var px = minX; px < maxX; px++) {
            if (!solid(px, py)) continue;
            var at = (py * width + px) * 4, colour = Array.from(pixels.slice(at, at + 4));
            var a = px - cx, b = cy - py - 1;
            xx += (a+.5)*(a+.5); yy += (b+.5)*(b+.5); xy += (a+.5)*(b+.5);
            var A = [a,b,corner(px,py+1)], B = [a+1,b,corner(px+1,py+1)];
            var C = [a+1,b+1,corner(px+1,py)], D = [a,b+1,corner(px,py)];
            function back(p) { return [p[0],p[1],-p[2]*(options.bevel ? .65 : 1)]; }
            face([A,B,C,D], colour, [0,0,1]); face([back(B),back(A),back(D),back(C)], colour, [0,0,-1]);
            if (!solid(px - 1, py)) face([back(A),A,D,back(D)], colour, [-1,0,0]);
            if (!solid(px + 1, py)) face([B,back(B),back(C),C], colour, [1,0,0]);
            if (!solid(px, py - 1)) face([D,C,back(C),back(D)], colour, [0,1,0]);
            if (!solid(px, py + 1)) face([back(A),back(B),B,A], colour, [0,-1,0]);
        }
        return { faces: faces, voxels: count, width: maxX - minX, height: maxY - minY, depth: depth,
            axis: .5*Math.atan2(2*xy,xx-yy), elongation: Math.sqrt(Math.pow(xx-yy,2)+4*xy*xy)/Math.max(1,xx+yy), trimmed: removed };
    }
    function project(point, pose) {
        var yaw = pose.yaw || 0, pitch = pose.pitch || 0, roll = pose.roll || 0;
        var x = point[0] * Math.cos(yaw) + point[2] * Math.sin(yaw), z = -point[0] * Math.sin(yaw) + point[2] * Math.cos(yaw);
        var y = point[1] * Math.cos(pitch) - z * Math.sin(pitch); z = point[1] * Math.sin(pitch) + z * Math.cos(pitch);
        return [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll), z];
    }
    function paint(ctx, model, pose) {
        if (!model) return;
        pose = pose || {};
        var scale = pose.scale || 1;
        var faces = model.faces.map(function (face) {
            var normal = project(face.normal, pose), points = face.points.map(function (p) { return project(p, pose); });
            return { points: points, normal: normal, colour: face.colour, depth: points.reduce(function (sum, p) { return sum + p[2]; }, 0) / points.length };
        }).filter(function (face) { return face.normal[2] > .001; }).sort(function (a, b) { return a.depth - b.depth; });
        ctx.save(); ctx.translate(pose.x || 0, pose.y || 0);
        faces.forEach(function (face) {
            var light = .68 + Math.max(0, -.38 * face.normal[0] + .55 * face.normal[1] + .72 * face.normal[2]) * .4;
            var c = face.colour, highlight = 0, base = c.slice(0,3);
            if (pose.materialLighting) {
                var max = Math.max.apply(null,base), min = Math.min.apply(null,base);
                var steel = max-min < 38 && max > 65, gold = c[0] > 185 && c[1] > 95 && c[2] < 115 && c[1]/c[0] > .72;
                light = .36 + Math.max(0,-.45*face.normal[0]+.65*face.normal[1]+.62*face.normal[2])*.7;
                if (steel || gold) {
                    var pigment = steel ? [164,179,192] : [185,137,49];
                    if(pose.materialLighting!=="source") base = base.map(function (v,i) { return v*.7+pigment[i]*.3; });
                    var specular = Math.max(0,-.24*face.normal[0]+.34*face.normal[1]+.91*face.normal[2]);
                    highlight = Math.pow(specular,steel?28:20)*(steel?95:65);
                }
            }
            ctx.fillStyle = "rgba(" + base.map(function (v) { return Math.min(255, Math.round(v * light+highlight)); }).join(",") + "," + c[3] / 255 + ")";
            ctx.beginPath(); face.points.forEach(function (p, i) {
                if (i) ctx.lineTo(p[0] * scale, -p[1] * scale); else ctx.moveTo(p[0] * scale, -p[1] * scale);
            }); ctx.closePath(); ctx.fill();
        });
        ctx.restore();
    }
    function bounds(model, pose) {
        var left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
        model.faces.forEach(function (face) { face.points.forEach(function (point) {
            var p = project(point,pose); left = Math.min(left,p[0]); right = Math.max(right,p[0]);
            bottom = Math.min(bottom,p[1]); top = Math.max(top,p[1]);
        }); });
        return { left:left, right:right, bottom:bottom, top:top, width:right-left, height:top-bottom };
    }
    return { build: build, paint: paint, project: project, bounds: bounds };
});
