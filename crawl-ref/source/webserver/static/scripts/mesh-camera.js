/* Small column-major camera/ray primitives; world Y is height, X/Z are the grid. */
define([], function () {
    "use strict";
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function unit(a) { var n = Math.hypot(a[0], a[1], a[2]) || 1; return a.map(function (v) { return v / n; }); }
    function multiply(a, b) {
        var out = new Float32Array(16);
        for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
            for (var k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
        return out;
    }
    function basis(camera) {
        var pitch = camera.pitch || 0, cp = Math.cos(pitch);
        var forward = [Math.cos(camera.angle) * cp, Math.sin(pitch), Math.sin(camera.angle) * cp];
        var right = [-Math.sin(camera.angle), 0, Math.cos(camera.angle)];
        return { forward: forward, right: right, up: cross(right, forward),
            eye: [camera.x, Number.isFinite(camera.height) ? camera.height : Number.isFinite(camera.eye) ? camera.eye : 1.08, camera.y] };
    }
    function view(eye, target, up) {
        var backward = unit(eye.map(function (v, i) { return v - target[i]; }));
        var right = unit(cross(up, backward)), top = cross(backward, right);
        return new Float32Array([right[0], top[0], backward[0], 0, right[1], top[1], backward[1], 0,
            right[2], top[2], backward[2], 0, -dot(right, eye), -dot(top, eye), -dot(backward, eye), 1]);
    }
    function matrix(camera, width, height) {
        if (height === undefined) height = 1;
        var b = basis(camera), t = Math.tan((camera.fov || 1.3) / 2), near = 0.035, far = 40;
        var projection = new Float32Array([1 / t, 0, 0, 0, 0, width / height / t, 0, 0,
            0, 0, -(far + near) / (far - near), -1, 0, 0, -2 * far * near / (far - near), 0]);
        // The camera uses a right-handed view with screen-right clockwise on the map.
        return multiply(projection, view(b.eye, b.eye.map(function (v, i) { return v + b.forward[i]; }), b.up));
    }
    function ray(camera, x, y, width, height) {
        var b = basis(camera), t = Math.tan((camera.fov || 1.3) / 2);
        var horizontal = (2 * x / width - 1) * t, vertical = (1 - 2 * y / height) * t * height / width;
        var direction = unit(b.forward.map(function (v, i) {
            return v + b.right[i] * horizontal + b.up[i] * vertical;
        }));
        // Array coordinates preserve the earlier public camera API.
        direction.origin = b.eye; direction.direction = direction; return direction;
    }
    function boxRay(ray, min, max) {
        var near = 0, far = Infinity;
        for (var axis = 0; axis < 3; axis++) {
            var d = ray.direction[axis], p = ray.origin[axis];
            if (Math.abs(d) < 0.000001) { if (p < min[axis] || p > max[axis]) return null; continue; }
            var a = (min[axis] - p) / d, b = (max[axis] - p) / d;
            near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
            if (near > far) return null;
        }
        return far > 0.001 ? near : null;
    }
    function shadowMatrix(center, light, radius) {
        var near = 0.1, far = 35;
        var projection = new Float32Array([1 / radius, 0, 0, 0, 0, 1 / radius, 0, 0,
            0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]);
        return multiply(projection, view(light, center, [0, 1, 0]));
    }
    return { dot: dot, cross: cross, unit: unit, multiply: multiply, basis: basis, view: view,
        matrix: matrix, ray: ray, boxRay: boxRay,
        box: function (origin,direction,min,max) { return boxRay({origin:origin,direction:direction},min,max); },
        shadowMatrix: shadowMatrix };
});
