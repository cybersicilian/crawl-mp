/* Native IDs and semantic exclusions live here, apart from reusable painters. */
define(["./tileinfo-dngn", "./enums", "./environment-art", "./terrain-materials", "./premium-effect-model"],
function (tiles, enums, environment, stone, effects) {
    "use strict";
    var materials = new Map(), water = new Map(), torches = new Set(), responses = new Map(), transmission = new Map();
    Object.keys(tiles).forEach(function (name) {
        var index = tiles[name];
        if (!Number.isInteger(index) || index < tiles.FLOOR_MAX || index >= tiles.WALL_MAX) return;
        var base = tiles.basetile(index), clear = /^DNGN_.*TRANSPARENT/.test(name), stoneWall = /STONE/.test(name);
        var kind = clear ? stoneWall ? "wall" : "glass" : /METAL|IRON|STEEL|COPPER|GOLD|SILVER/.test(name) ? "metal"
            : /CRYSTAL|EMERALD|SAPPHIRE/.test(name) ? "crystal" : /GLASS/.test(name) ? "glass" : /WOOD|TIMBER|TREE/.test(name) ? "wood"
            : /VINE|MOSS/.test(name) ? "moss" : /BRICK/.test(name) ? "brick" : "wall";
        responses.set(base, kind);
        if (clear) transmission.set(base, stoneWall ? .58 : .82);
    });
    environment.ground.entries.forEach(function (entry) {
        entry.names.forEach(function (name) {
            if (Number.isInteger(tiles[name])) materials.set(tiles[name], entry.label);
        });
    });
    stone.floor.forEach(function (region) {
        var base = tiles.basetile(region.tile);
        materials.set(base, base === tiles.FLOOR_MOSS ? "moss" : "stone");
    });
    ["DNGN_OPEN_SEA", "DNGN_DEEP_WATER", "DNGN_DEEP_WATER_MURKY", "DNGN_SHALLOW_WATER",
        "DNGN_SHALLOW_WATER_DISTURBANCE", "DNGN_SHALLOW_WATER_MURKY", "DNGN_SHALLOW_WATER_MURKY_DISTURBANCE"]
        .forEach(function (name) { if (Number.isInteger(tiles[name])) water.set(tiles[name], {
            depth: name.includes("SHALLOW") ? "shallow" : "deep", murky: name.includes("MURKY") }); });
    ["WALL_BRICK_DARK_2_TORCH", "WALL_BRICK_DARK_4_TORCH", "WALL_BRICK_DARK_6_TORCH"]
        .forEach(function (name) { if (Number.isInteger(tiles[name])) torches.add(tiles[name]); });
    var lights = {
        torch: { kind: "torch", radius: 4.8, colour: [255, 181, 103], strength: .19, variation: .075, elevation: .75 },
        lava: { kind: "lava", radius: 3.1, colour: [255, 117, 52], strength: .09, variation: .045, elevation: .25 },
        fountain: { kind: "fountain", radius: 2.8, colour: [108, 173, 223], strength: .12, elevation: .55 }
    };
    function describe(entry, settings) {
        if (!entry || !entry.t) return null;
        var cell = entry.t, bg = enums.prepare_bg_flags(cell.bg || 0);
        // Remembered terrain is available only to explicit material consumers.
        // Lighting and effects keep their visible-only contract by default;
        // magic-mapped and unexplored cells never supply premium terrain.
        if (bg.MM_UNSEEN || bg.value <= tiles.DNGN_ERROR || bg.UNSEEN && !(settings && settings.remembered)) return null;
        var visible = !bg.UNSEEN;
        var base = tiles.basetile(bg.value), fluid = water.get(base);
        var lava = base === tiles.DNGN_LAVA || base === tiles.DNGN_LAVA_SEA;
        var torch = torches.has(base), fountain = base === tiles.DNGN_BLUE_FOUNTAIN || base === tiles.DNGN_SPARKLING_FOUNTAIN;
        var solid = base >= tiles.FLOOR_MAX && base < tiles.WALL_MAX;
        var info = tiles.get_tile_info(bg.value);
        var surface = cell.mangrove_water ? null : fluid ? "water" : lava ? "lava" : null;
        var fg = enums.prepare_fg_flags(cell.fg || 0);
        var cloud = enums.prepare_fg_flags(cell.cloud || 0);
        var vapour = effects.describe(cloud.value, "cloud");
        var spells = (cell.ov || []).map(function (id) { return effects.describe(id, "overlay"); });
        var emitting = vapour && vapour.light ? vapour : spells.find(function (profile) { return profile && profile.light; });
        var protectedArt = Boolean(entry.mon || (cell.doll || []).length || (cell.mcache || []).length || fg.value
            || cell.ritual_blood || bg.CURSOR1 || bg.CURSOR2 || bg.CURSOR3 || bg.TUT_CURSOR);
        var radiation = emitting ? emitting.radiance : torch ? { type: "flame", width: .26, height: .43, y: .54 }
            : lava ? { type: "lava" } : fountain ? { type: "glow", colour: lights.fountain.colour } : null;
        return { visible: visible, remembered: !visible, index: bg.value, solid: solid, surface: surface,
            transmission: solid ? transmission.get(base) || 0 : 1,
            relightable: Boolean(info && info.w <= 32 && info.h <= 32 && (base < tiles.FLOOR_MAX || solid)),
            depth: fluid ? fluid.depth : null, murky: fluid ? fluid.murky : false,
            material: materials.get(base) || (base < tiles.FLOOR_MAX ? "stone" : null),
            ground: !surface && !solid && base < tiles.FLOOR_MAX,
            shading: surface || (solid ? responses.get(base) || "wall" : base === tiles.FLOOR_MOSS ? "moss"
                : /sand/i.test(materials.get(base) || "") ? "sand" : "stone"),
            occupied: Boolean(protectedArt || cloud.value || (cell.ov || []).length),
            emission: visible && radiation ? Object.assign({}, radiation, { blocked: protectedArt }) : null,
            effect: !visible ? null : emitting ? emitting.radiance.type === "flame" ? "fire" : "radiance" : torch ? "ember" : fountain ? "fountain" : lava ? "lava" : surface,
            light: !visible ? null : emitting ? emitting.light : torch ? lights.torch : lava ? lights.lava : fountain ? lights.fountain : null };
    }
    return { describe: describe, floorMax: tiles.FLOOR_MAX };
});
