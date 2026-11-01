/* On-demand software 3D: perspective ground, textured walls, depth-clipped sprites.
 * Textures are {image, pixels: RGBA Uint8ClampedArray, size}; no game dependencies. */
define(["grid-perspective"], function (geometry) {
    "use strict";
    function create(canvas) {
        var ctx = canvas.getContext("2d"), frame, hits = [], traces=[],projected = [], last;
        function opacity(cell){
            var material=cell.wallMaterial||cell.wall||{},value=material.opacity;
            return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0.35;
        }
        function paint(scene, camera) {
            var width = canvas.width, height = canvas.height;
            if (!frame || frame.width !== width || frame.height !== height) frame = ctx.createImageData(width, height);
            var pixels = frame.data;
            var focal = width / (2 * Math.tan((camera.fov || Math.PI / 2.4) / 2));
            var eye=camera.height||camera.eye||0.5,horizon=height/2+focal*Math.tan(camera.pitch||0),wallHeight=scene.wallHeight||1;
            var b = geometry.basis(camera), range = scene.range || 14;
            // Ground samples use perspective-correct world coordinates. The
            // scene adapter memoizes cell lookups for this frame.
            for (var y = 0; y < height; y++) {
                var distance = y > horizon ? focal * eye / (y - horizon) : Infinity;
                var shade = Math.max(0.12, 0.94 - distance * 0.065);
                var wx = camera.x + (b.dx - b.px) * distance;
                var wy = camera.y + (b.dy - b.py) * distance;
                var stepX = b.px * distance * 2 / width, stepY = b.py * distance * 2 / width;
                for (var x = 0; x < width; x++, wx += stepX, wy += stepY) {
                    var offset = (y * width + x) * 4, sample = distance < range ? scene.get(Math.floor(wx), Math.floor(wy)) : null;
                    var texture = sample && (!sample.solid || geometry.translucent(sample)) && sample.floor;
                    if (texture) {
                        var u = Math.floor((wx - Math.floor(wx)) * texture.size);
                        var v = Math.floor((wy - Math.floor(wy)) * texture.size);
                        var source = (v * texture.size + u) * 4;
                        pixels[offset] = texture.pixels[source] * shade;
                        pixels[offset + 1] = texture.pixels[source + 1] * shade;
                        pixels[offset + 2] = texture.pixels[source + 2] * shade;
                    } else {
                        // Unseen space stays dark; the ceiling fades toward the horizon.
                        var ceiling = y < horizon ? 1 - y / horizon : 0;
                        pixels[offset] = 9 + ceiling * 12;
                        pixels[offset + 1] = 12 + ceiling * 14;
                        pixels[offset + 2] = 14 + ceiling * 15;
                    }
                    pixels[offset + 3] = 255;
                }
            }
            ctx.globalAlpha=1;ctx.putImageData(frame, 0, 0); ctx.imageSmoothingEnabled = false;
            hits = [];traces=[];
            for (var column = 0; column < width; column++) {
                var trace=geometry.trace(scene.get,camera,geometry.ray(camera,2*(column+0.5)/width-1),range),hit=trace.wall;
                traces.push(trace.layers);
                hits.push(hit);
                var size = focal * wallHeight / hit.distance, top = horizon + focal * eye / hit.distance-size;
                var wall = hit.cell && hit.cell.wall;
                if (wall) {
                    ctx.imageSmoothingEnabled=wall.pixelated===false;
                    ctx.fillStyle = "#171d23"; ctx.fillRect(column, top, 1, size);
                    ctx.drawImage(wall.image, Math.min(wall.size - 1, Math.floor(hit.u * wall.size)), 0, 1, wall.size,
                        column, top, 1, size);
                    ctx.fillStyle = "rgba(4,8,12," + Math.min(0.9, hit.distance * 0.055 + (hit.side ? 0.2 : 0.08)) + ")";
                } else ctx.fillStyle = "#090d10";
                ctx.fillRect(column, top, 1, size);
            }
            projected = [];
            scene.sprites.forEach(function (sprite) {
                var p = geometry.project(camera, sprite.x + 0.5, sprite.y + 0.5, width, height);
                if (p && p.depth < range) projected.push({ sprite: sprite, point: p });
            });
            projected.sort(function (a, c) { return c.point.depth - a.point.depth; });
            projected.forEach(function (entry) {
                var sprite = entry.sprite, p = entry.point, scale = sprite.width || sprite.scale || 1;
                var w = p.size * scale, h = sprite.height ? p.size*sprite.height : w * sprite.image.height / sprite.image.width;
                var left = p.x - w / 2, top = p.bottom-p.size*(sprite.elevation||0)-h;
                entry.bounds = { left: left, top: top, width: w, height: h };
            });
            // Composite glass strips and sprite strips together, far to near.
            // This preserves alpha edges and objects on either side of a pane.
            for(var x=0;x<width;x++){
                var strips=traces[x].map(function(hit){return {distance:hit.distance,hit:hit};});
                projected.forEach(function(entry){
                    var bounds=entry.bounds;
                    if(entry.point.depth<hits[x].distance&&x>=Math.floor(bounds.left)&&x<bounds.left+bounds.width)
                        strips.push({distance:entry.point.depth,entry:entry});
                });
                strips.sort(function(a,b){return b.distance-a.distance;});
                strips.forEach(function(strip){
                    if(strip.hit){
                        var hit=strip.hit,wall=hit.cell.wall;
                        if(!wall)return;
                        var size=focal*wallHeight/hit.distance,top=horizon+focal*eye/hit.distance-size;
                        ctx.globalAlpha=opacity(hit.cell);ctx.imageSmoothingEnabled=wall.pixelated===false;
                        ctx.drawImage(wall.image,Math.min(wall.size-1,Math.floor(hit.u*wall.size)),0,1,wall.size,x,top,1,size);
                    }else{
                        var entry=strip.entry,sprite=entry.sprite,bounds=entry.bounds;
                        var sx=Math.max(0,Math.min(sprite.image.width-1,Math.floor((x-bounds.left)/bounds.width*sprite.image.width)));
                        ctx.globalAlpha=1;ctx.imageSmoothingEnabled=sprite.pixelated===false;
                        ctx.drawImage(sprite.image,sx,0,1,sprite.image.height,x,bounds.top,1,bounds.height);
                    }
                });
            }
            ctx.globalAlpha=1;
            var vignette = ctx.createRadialGradient(width / 2, horizon, height * 0.15, width / 2, horizon, width * 0.7);
            vignette.addColorStop(0, "#0000"); vignette.addColorStop(1, "#020408b0");
            ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
            last = { scene: scene, camera: camera, focal: focal };
        }
        function pick(x, y) {
            if (!last || x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return null;
            var column=Math.floor(x),hit = hits[column],nearest=Infinity,selected=null;
            var eye=last.camera.height||last.camera.eye||0.5,horizon=canvas.height/2+last.focal*Math.tan(last.camera.pitch||0);
            traces[column].concat([hit]).forEach(function(wall){
                var size=last.focal*(last.scene.wallHeight||1)/wall.distance,bottom=horizon+last.focal*eye/wall.distance;
                if(y>=bottom-size&&y<bottom&&wall.distance<nearest){nearest=wall.distance;selected=wall.cell?wall:null;}
            });
            projected.forEach(function(entry){
                var bounds=entry.bounds;
                if(entry.point.depth<nearest&&entry.point.depth<hit.distance&&x>=bounds.left&&x<bounds.left+bounds.width
                    &&y>=bounds.top&&y<bounds.top+bounds.height&&(!entry.sprite.hit||entry.sprite.hit((x-bounds.left)/bounds.width,(y-bounds.top)/bounds.height))){
                    nearest=entry.point.depth;selected=entry.sprite;
                }
            });
            var ground = geometry.ground(last.camera, x, y, canvas.width, canvas.height);
            if (!ground || ground.distance >= (last.scene.range||14) || ground.distance>=nearest) return selected;
            var gx = Math.floor(ground.x), gy = Math.floor(ground.y), cell = last.scene.get(gx, gy);
            return cell && !cell.solid ? { x: gx, y: gy } : selected;
        }
        return { paint: paint, pick: pick, clear: function () { last = null; hits = []; traces=[];projected = []; } };
    }
    return { create: create };
});
