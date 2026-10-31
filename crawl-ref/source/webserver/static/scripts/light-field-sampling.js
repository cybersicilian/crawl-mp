/* Continuous sampling shared by material shaders and low-resolution light maps. */
define([], function () {
    "use strict";
    function coverage(grid, u, v) {
        if (!grid) return 1;
        var x = Math.max(0, Math.min(2, u * 2)), y = Math.max(0, Math.min(2, v * 2));
        var ix = Math.min(1, Math.floor(x)), iy = Math.min(1, Math.floor(y));
        var fx = x - ix, fy = y - iy, n = iy * 3 + ix;
        return (grid[n] * (1 - fx) + grid[n + 1] * fx) * (1 - fy)
            + (grid[n + 3] * (1 - fx) + grid[n + 4] * fx) * fy;
    }
    function falloff(distance, radius) {
        var edge = Math.max(0, 1 - Math.pow(distance / radius, 4));
        return edge * edge / (1 + distance * distance * .35);
    }
    return { coverage: coverage, falloff: falloff };
});
