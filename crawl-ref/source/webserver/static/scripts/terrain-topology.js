/* Connected terrain boundaries; unknown neighbours never create an edge. */
define(["tile-edges"], function (edges) {
    "use strict";
    function describe(own, neighbours) {
        var wall = 0, shore = 0, depth = 0, wet = 0, hot = 0, blends = [];
        edges.sides.forEach(function (side, index) {
            var other = neighbours[index];
            if (!other || !other.visible) return;
            if (own.solid && !other.solid) wall |= side.bit;
            if (own.surface && own.surface !== other.surface) shore |= side.bit;
            if (own.surface === "water" && other.surface === "water" && own.depth !== other.depth) depth |= side.bit;
            if (!own.solid && !own.surface && other.surface === "water") wet |= side.bit;
            if (!own.solid && !own.surface && other.surface === "lava") hot |= side.bit;
            if (own.material && other.material && own.material !== other.material
                && !own.solid && !other.solid && !own.surface && !other.surface)
                blends.push({ side: side, neighbour: other });
        });
        return { own: own, wall: wall, shore: shore, depth: depth, wet: wet, hot: hot, blends: blends };
    }
    return { describe: describe, sides: edges.sides };
});
