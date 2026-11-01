/* Unit-grid camera geometry. Angles use screen coordinates: east=0, south=PI/2.
 * The consumer supplies cells; absent cells stop rays and never expose terrain. */
define([], function () {
    "use strict";
    function basis(camera) {
        var span = Math.tan((camera.fov || Math.PI / 2.4) / 2);
        var dx = Math.cos(camera.angle), dy = Math.sin(camera.angle);
        return { dx: dx, dy: dy, px: -dy * span, py: dx * span };
    }
    function ray(camera, horizontal) {
        var b = basis(camera);
        return { x: b.dx + b.px * horizontal, y: b.dy + b.py * horizontal };
    }
    function translucent(cell) {
        var material=cell && (cell.wallMaterial || cell.wall);
        return Boolean(cell && cell.solid && (material && material.opacity !== undefined
            ? material.opacity < 1 || material.transmission > 0
            : cell.transparent || material && material.transmission > 0));
    }
    function walk(get, camera, direction, limit, transmission) {
        var x = Math.floor(camera.x), y = Math.floor(camera.y);
        var sx = direction.x < 0 ? -1 : 1, sy = direction.y < 0 ? -1 : 1;
        var dx = Math.abs(1 / direction.x), dy = Math.abs(1 / direction.y);
        var tx = (sx < 0 ? camera.x - x : x + 1 - camera.x) * dx;
        var ty = (sy < 0 ? camera.y - y : y + 1 - camera.y) * dy;
        var distance = 0, side = 0, cell, layers=[];
        for (var n = 0; n < 256; n++) {
            if (tx < ty) { distance = tx; tx += dx; x += sx; side = 0; }
            else { distance = ty; ty += dy; y += sy; side = 1; }
            if (distance > limit) break;
            cell = get(x, y);
            if (!cell || cell.solid) {
                var edge = side ? camera.x + distance * direction.x : camera.y + distance * direction.y;
                var hit={ x: x, y: y, distance: Math.max(0.001, distance), side: side,
                    u: edge - Math.floor(edge), cell: cell };
                // Bound both work and retained layers. At the cap, preserve a
                // conservative opaque boundary rather than reveal more cells.
                if(transmission && translucent(cell) && layers.length<32)layers.push(hit);
                else return {wall:hit,layers:layers};
            }
        }
        return {wall:{ x: x, y: y, distance: limit, side: side, u: 0, cell: null },layers:layers};
    }
    function cast(get,camera,direction,limit){return walk(get,camera,direction,limit,false).wall;}
    function trace(get,camera,direction,limit){return walk(get,camera,direction,limit,true);}
    function project(camera, x, y, width, height) {
        var b = basis(camera), dx = x - camera.x, dy = y - camera.y;
        var depth = dx * b.dx + dy * b.dy;
        if (depth <= 0.05) return null;
        var lateral = (dx * b.px + dy * b.py) / (b.px * b.px + b.py * b.py);
        var focal = width / (2 * Math.tan((camera.fov || Math.PI / 2.4) / 2));
        var eye=camera.height||camera.eye||0.5,horizon=height/2+focal*Math.tan(camera.pitch||0);
        return { x: width / 2 * (1 + lateral / depth), bottom: horizon + focal * eye / depth,
            size: focal / depth, depth: depth };
    }
    function ground(camera, x, y, width, height) {
        var focal = width / (2 * Math.tan((camera.fov || Math.PI / 2.4) / 2));
        var horizon=height/2+focal*Math.tan(camera.pitch||0);
        if (y <= horizon) return null;
        var distance = focal * (camera.height||camera.eye||0.5) / (y - horizon), direction = ray(camera, 2 * x / width - 1);
        return { x: camera.x + direction.x * distance, y: camera.y + direction.y * distance, distance: distance };
    }
    return { basis: basis, ray: ray, cast: cast, trace:trace,translucent:translucent,project: project, ground: ground };
});
