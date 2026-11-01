/* Mesh assembly and explicit pick bounds. Materials stay consumer-owned. */
define(["mesh-camera"], function (math) {
    "use strict";
    function create() {
        var groups = new Map(), boxes = [];
        function quad(material, points, uv, shade) {
            if (!material) return;
            var values = groups.get(material);
            if (!values) { values = []; groups.set(material, values); }
            var normal = math.unit(math.cross(points[1].map(function (v, i) { return v - points[0][i]; }),
                points[2].map(function (v, i) { return v - points[0][i]; })));
            var coords = uv || [[0, 1], [1, 1], [1, 0], [0, 0]];
            [0, 1, 2, 0, 2, 3].forEach(function (i) { values.push.apply(values,
                points[i].concat(normal, coords[i], shade === undefined ? 1 : shade)); });
        }
        function box(material, min, max, pick, shade) {
            var x = min[0], y = min[1], z = min[2], X = max[0], Y = max[1], Z = max[2];
            var tile = material.tileScale, height = tile ? (Y-y)/tile : 1;
            function sides(width) { var u = tile ? width/tile : 1; return [[0,height],[0,0],[u,0],[u,height]]; }
            quad(material, [[x,y,z],[x,Y,z],[X,Y,z],[X,y,z]], sides(X-x), shade);
            quad(material, [[X,y,Z],[X,Y,Z],[x,Y,Z],[x,y,Z]], sides(X-x), shade);
            quad(material, [[x,y,Z],[x,Y,Z],[x,Y,z],[x,y,z]], sides(Z-z), shade);
            quad(material, [[X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z]], sides(Z-z), shade);
            quad(material, [[x,Y,z],[x,Y,Z],[X,Y,Z],[X,Y,z]], null, shade);
            boxes.push({ min: min, max: max, cell: pick || null });
        }
        function floor(material, x, z, elevation, shade) {
            quad(material, [[x,elevation,z],[x,elevation,z+1],[x+1,elevation,z+1],[x+1,elevation,z]],
                [[0,0],[0,1],[1,1],[1,0]], shade);
        }
        function cylinder(material, x, y, z, radius, height, pick, sides) {
            sides = sides || 12;
            for (var n = 0; n < sides; n++) {
                var a = n / sides * Math.PI * 2, b = (n + 1) / sides * Math.PI * 2;
                var A = [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius];
                var B = [x + Math.cos(b) * radius, y, z + Math.sin(b) * radius];
                quad(material, [B, A, [A[0], y + height, A[2]], [B[0], y + height, B[2]]]);
                quad(material, [[x,y+height,z], [B[0],y+height,B[2]], [A[0],y+height,A[2]], [x,y+height,z]]);
            }
            if (pick) boxes.push({ min: [x-radius,y,z-radius], max: [x+radius,y+height,z+radius], cell: pick });
        }
        return { quad: quad, box: box, floor: floor, cylinder: cylinder, boxes: boxes,
            bounds:function(min,max,cell){boxes.push({min:min,max:max,cell:cell||null});},
            groups: function () { return Array.from(groups, function (pair) { return { material: pair[0], data: new Float32Array(pair[1]) }; }); } };
    }
    function sprite(sprite, angle) {
        var right = [-Math.sin(angle) * sprite.width / 2, Math.cos(angle) * sprite.width / 2];
        var x = sprite.x + 0.5, z = sprite.y + 0.5, y = sprite.elevation || 0;
        var mesh = create();
        mesh.quad(sprite.material, [[x-right[0],y,z-right[1]], [x+right[0],y,z+right[1]],
            [x+right[0],y+sprite.height,z+right[1]], [x-right[0],y+sprite.height,z-right[1]]]);
        return mesh.groups()[0];
    }
    return { create: create, sprite: sprite };
});
