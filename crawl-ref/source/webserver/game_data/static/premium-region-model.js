/* Area semantics come only from native cell fields and overlays. */
define(["./tileinfo-dngn", "./enums"], function (tiles, enums) {
    "use strict";
    var profiles = {
        halo: { colour: [246, 191, 87], edge: [255, 225, 151], fill: .055, rim: .24, motion: .008, speed: 1.4 },
        umbra: { colour: [22, 16, 37], edge: [122, 91, 174], fill: .27, rim: .24, motion: .024, speed: .85 },
        silence: { colour: [62, 121, 139], edge: [164, 218, 223], fill: .055, rim: .25, motion: .009, speed: .75 },
        sanctuary: { colour: [241, 201, 122], edge: [255, 241, 190], fill: .08, rim: .32, motion: .012, speed: 1 },
        blasphemy: { colour: [110, 29, 51], edge: [215, 94, 114], fill: .09, rim: .28, motion: .015, speed: 1.1 },
        orb: { colour: [139, 71, 174], edge: [225, 164, 245], fill: .075, rim: .25, motion: .015, speed: 1.2 },
        quad: { colour: [174, 65, 54], edge: [253, 161, 126], fill: .075, rim: .28, motion: .012, speed: 1.3 },
        disjunction: { colour: [71, 117, 176], edge: [169, 203, 246], fill: .055, rim: .25, motion: .014, speed: 1.4 },
        heat: { colour: [174, 83, 30], edge: [255, 185, 103], fill: .05, rim: .22, motion: .016, speed: 1.3 },
        target: { colour: [219, 183, 80], edge: [255, 225, 141], fill: .09, rim: .34, motion: 0, speed: 0 },
        multi: { colour: [249, 215, 115], edge: [255, 242, 189], fill: .12, rim: .38, motion: 0, speed: 0 },
        distant: { colour: [115, 92, 40], edge: [173, 137, 65], fill: .09, rim: .24, motion: 0, speed: 0 }
    };
    var byTile = new Map();
    profiles.umbra.inward = true; profiles.umbra.distortion = .65;
    Object.keys(profiles).forEach(function (kind) { profiles[kind].circular = !["target", "multi", "distant"].includes(kind); });
    function register(name, kind, count) {
        if (Number.isInteger(tiles[name])) for (var i = 0; i < (count || 1); i++) byTile.set(tiles[name] + i, kind);
    }
    register("HALO_RANGE", "halo"); register("UMBRA", "umbra", 4); register("SILENCED", "silence");
    register("SANCTUARY", "sanctuary"); register("BLASPHEMY", "blasphemy"); register("ORB_GLOW", "orb", 2);
    register("QUAD_GLOW", "quad"); register("DISJUNCT", "disjunction", 4); register("HEAT_AURA", "heat", 3);
    register("RAY", "target"); register("RAY_MULTI", "multi"); register("RAY_OUT_OF_RANGE", "distant");
    function describe(entry) {
        if (!entry || !entry.t) return [];
        var cell = entry.t, bg = enums.prepare_bg_flags(cell.bg || 0), result = [];
        if (bg.UNSEEN || bg.MM_UNSEEN || bg.value <= tiles.DNGN_ERROR) return result;
        function add(tile) { var kind = byTile.get(tile); if (kind && !result.some(function (item) { return item.kind === kind; })) result.push({ kind: kind, tile: tile }); }
        if (cell.halo === enums.HALO_RANGE) add(tiles.HALO_RANGE);
        if (cell.halo >= enums.HALO_UMBRA_FIRST && cell.halo <= enums.HALO_UMBRA_LAST) add(tiles.UMBRA);
        if (cell.silenced) add(tiles.SILENCED);
        if (cell.sanctuary) add(tiles.SANCTUARY);
        if (cell.blasphemy) add(tiles.BLASPHEMY);
        if (cell.orb_glow) add(tiles.ORB_GLOW);
        if (cell.quad_glow) add(tiles.QUAD_GLOW);
        if (cell.disjunct) add(tiles.DISJUNCT);
        (cell.ov || []).forEach(add);
        return result;
    }
    return { describe: describe, kind: function (tile) { return byTile.get(tile); }, profiles: profiles, visible: function (entry) {
        var bg = enums.prepare_bg_flags(entry && entry.t && entry.t.bg || 0);
        return Boolean(entry && entry.t && !bg.UNSEEN && !bg.MM_UNSEEN && bg.value > tiles.DNGN_ERROR);
    } };
});
