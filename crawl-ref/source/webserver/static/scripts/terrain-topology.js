/* Connected terrain boundaries; unknown neighbours never create an edge. */
define(["tile-edges"], function (edges) {
    "use strict";
    var corners = [16, 32, 64, 128]; // NE SE SW NW, above the four cardinal bits.
    function known(other) { return Boolean(other && (other.visible || other.remembered)); }
    // Flooded features stand in connected water rather than beside it.
    function liquid(other) { return other.surface || (other.waterlogged ? "water" : null); }
    function depthOf(other) { return other.depth || "shallow"; }
    function describe(own, neighbours, diagonals) {
        var wall = 0, shore = 0, depth = 0, wet = 0, hot = 0, blends = [];
        edges.sides.forEach(function (side, index) {
            var other = neighbours[index];
            if (!known(other)) return;
            if (own.solid && !other.solid) wall |= side.bit;
            var fluid = liquid(other);
            if (own.surface && own.surface !== fluid) shore |= side.bit;
            if (own.surface === "water" && fluid === "water" && depthOf(own) !== depthOf(other)) depth |= side.bit;
            if (!own.solid && !own.surface && fluid === "water") wet |= side.bit;
            if (!own.solid && !own.surface && fluid === "lava") hot |= side.bit;
            if (own.material && other.material && own.material !== other.material
                && !own.solid && !other.solid && !own.surface && !other.surface)
                blends.push({ side: side, neighbour: other });
        });
        var coast = shore, ledge = depth, damp = wet, scorch = hot;
        (diagonals || []).forEach(function (other, index) {
            if (!known(other)) return;
            var fluid = liquid(other);
            if (own.surface && own.surface !== fluid) coast |= corners[index];
            if (own.surface === "water" && fluid === "water" && depthOf(own) !== depthOf(other)) ledge |= corners[index];
            if (!own.solid && !own.surface && fluid === "water") damp |= corners[index];
            if (!own.solid && !own.surface && fluid === "lava") scorch |= corners[index];
        });
        return { own: own, wall: wall, shore: shore, depth: depth, wet: wet, hot: hot, blends: blends,
            coast: coast, ledge: ledge, damp: damp, scorch: scorch };
    }
    return { describe: describe, sides: edges.sides };
});
