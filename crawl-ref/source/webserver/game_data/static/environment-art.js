/* Sheet geometry and native opt-ins are data; original generated PNGs stay intact. */
define([], function () {
    "use strict";
    return {
        ground: { id: "illustrated_wilds", file: "painted-wilds-v1.png", width: 1536, height: 1024,
            columns: 3, rows: 2, cell: 512, entries: [
                { label: "Woodland grass", names: ["FLOOR_GRASS"], shade: 0.24 },
                { label: "Shaded leaf litter", names: ["FLOOR_GRASS_DARK"], shade: 0.16 },
                { label: "Damp mud", names: ["FLOOR_MUD"], shade: 0.16 },
                { label: "Weathered sand", names: ["FLOOR_SAND"], shade: 0.3 },
                { label: "Frosted ice", names: ["FLOOR_ICE"], shade: 0.22 },
                { label: "Rooted woodland earth", names: ["FLOOR_LAIR"], shade: 0.2 }
            ] },
        sprites: { id: "illustrated_woodland", file: "woodland-sprites-v1.png", width: 1448, height: 1086,
            columns: 4, rows: 3, cell: 362,
            style: { brightness: 1.16, contrast: 1.08, outline: { color: "#070d0be0", blur: 0.8 } }, entries: [
                { label: "Gnarled oak", names: ["DNGN_TREE"] },
                { label: "Slender woodland tree", names: [] },
                { label: "Ochre autumn tree", names: ["DNGN_TREE_YELLOW"] },
                { label: "Copper autumn tree", names: ["DNGN_TREE_RED", "DNGN_TREE_LIGHTRED"] },
                { label: "Dead tree", names: ["DNGN_TREE_DEAD"] },
                { label: "Mangrove", names: ["DNGN_MANGROVE"] },
                { label: "Petrified tree", names: ["DNGN_PETRIFIED_TREE"] },
                { label: "Blue tree of woe", names: ["DNGN_TREE_OF_WOE"] },
                { label: "Dead tree of woe", names: ["DNGN_DEAD_TREE_OF_WOE"] },
                { label: "Mossy boulders", names: [] },
                { label: "Fungal stump", names: [] },
                { label: "Mushroom cluster", names: [] }
            ] }
    };
});
