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
    function glow(colour, radius, strength) { return { kind: "glow", radius: radius, colour: colour, strength: strength, elevation: .55 }; }
    // Holy places, gateways and magical fixtures carry their own colour of light.
    var devotions = { ZIN: [232, 232, 255], SHINING_ONE: [255, 234, 170], KIKUBAAQUDGHA: [130, 215, 140], YREDELEMNUL: [158, 98, 214], XOM: [235, 122, 235],
        VEHUMET: [235, 116, 92], OKAWARU: [236, 198, 116], MAKHLEB: [255, 112, 62], SIF_MUNA: [124, 154, 255], TROG: [232, 92, 62], NEMELEX_XOBEH: [222, 134, 255],
        ELYVILON: [204, 236, 255], LUGONU: [204, 104, 242], BEOGH: [222, 172, 112], JIYVA: [134, 232, 112], FEDHAS: [144, 222, 114], CHEIBRIADOS: [196, 176, 124],
        ASHENZARI: [204, 194, 255], DITHMENOS: [116, 106, 176], GOZAG: [255, 212, 94], QAZLAL: [154, 204, 255], RU: [236, 184, 124], USKAYAW: [255, 154, 204],
        HEPLIAKLQANA: [154, 240, 222], WU_JIAN: [255, 202, 144], IGNIS: [255, 142, 64], PAKELLAS: [124, 222, 255] };
    var fixtures = { DNGN_ENTER_ABYSS: [172, 92, 236], DNGN_EXIT_ABYSS: [172, 92, 236], DNGN_ABYSSAL_STAIR: [172, 92, 236], DNGN_ENTER_PANDEMONIUM: [236, 92, 192],
        DNGN_EXIT_PANDEMONIUM: [236, 92, 192], DNGN_ENTER_HELL: [255, 96, 56], DNGN_ENTER_GEHENNA: [255, 110, 52], DNGN_ENTER_DIS: [186, 196, 214], DNGN_ENTER_COCYTUS: [158, 216, 255],
        DNGN_ENTER_TARTARUS: [150, 214, 136], DNGN_ENTER_ZOT_OPEN: [216, 122, 255], DNGN_TRANSPORTER: [124, 222, 255], DNGN_ORB_DAIS: [255, 226, 152],
        DNGN_DRAGON_VEIN_FIRE: [255, 132, 62], DNGN_DRAGON_VEIN_ICE: [152, 216, 255], DNGN_DRAGON_VEIN_AIR: [204, 236, 255], DNGN_DRAGON_VEIN_EARTH: [204, 172, 112],
        DNGN_FOUNTAIN_NOVELTY_LANTERN: [255, 192, 112], DNGN_NASCENCE_CIRCUIT: [124, 222, 255], DNGN_DISCO_BALL: [236, 152, 255] };
    var portals = { ICE_CAVE: [172, 226, 255], BAZAAR: [255, 206, 122], TROVE: [255, 222, 132], GAUNTLET: [222, 112, 72], OSSUARY: [216, 196, 142], SEWER: [132, 202, 122],
        VOLCANO: [255, 122, 62], WIZLAB: [192, 122, 255], ZIGGURAT: [255, 212, 122], DESOLATION: [192, 172, 152], NECROPOLIS: [152, 222, 172], BAILEY: [232, 192, 122] };
    var kindled = new Map();
    Object.keys(tiles).forEach(function (name) {
        if (!Number.isInteger(tiles[name])) return;
        var altar = /^DNGN_ALTAR_(.+)$/.exec(name), portal = /^DNGN_PORTAL_(.+)$/.exec(name);
        if (altar) kindled.set(tiles[name], glow(devotions[altar[1]] || [226, 212, 176], 2.9, .12));
        else if (portal && !/(GONE|EXPIRED|RUSTED)/.test(portal[1])) kindled.set(tiles[name], glow(portals[portal[1]] || [152, 192, 255], 3.1, .14));
        else if (fixtures[name]) kindled.set(tiles[name], glow(fixtures[name], 3, .13));
    });
    var fungus = glow([122, 236, 192], 2.2, .07);
    // Creatures made of flame, storm or holy radiance light the floor they cross.
    var living = [[/\b(fire|flam|ember|magma|lava|molten|salamander|efreet|ifrit|phoenix|hell hound|hellephant|balrug|solar|burning|blazing|brimstone)/i, [255, 146, 72], 3.6, .14],
        [/\b(storm|lightning|electric|spark|thunder|plasma)/i, [168, 210, 255], 3.4, .13],
        [/\b(angel|seraph|daeva|cherub|apis|radiant|shining)/i, [255, 232, 170], 3.6, .13],
        [/\b(orb of|crystal guardian|starcursed|eldritch)/i, [192, 142, 255], 3, .11],
        [/\b(will-o|wisp|spectral|phantom)/i, [152, 222, 206], 2.8, .09],
        [/\b(ice|frost|freezing|blizzard|glacial)/i, [162, 214, 255], 2.6, .07]];
    var creatures = new Map();
    function creatureLight(mon) {
        if (!mon || !mon.name) return null;
        if (creatures.has(mon.name)) return creatures.get(mon.name);
        var match = living.find(function (entry) { return entry[0].test(mon.name); });
        var light = match ? glow(match[1], match[2], match[3]) : null;
        creatures.set(mon.name, light);
        return light;
    }
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
        var shrine = kindled.get(base);
        var radiation = emitting ? emitting.radiance : torch ? { type: "flame", width: .26, height: .43, y: .54 }
            : lava ? { type: "lava" } : fountain ? { type: "glow", colour: lights.fountain.colour } : shrine ? { type: "glow", colour: shrine.colour } : null;
        return { visible: visible, remembered: !visible, index: bg.value, solid: solid, surface: surface, waterlogged: Boolean(cell.mangrove_water),
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
            light: !visible ? null : emitting ? emitting.light : torch ? lights.torch : lava ? lights.lava : fountain ? lights.fountain
                : creatureLight(entry.mon) || shrine || (cell.glowing_mold ? fungus : null) };
    }
    // A flooded feature's water, shaded like any other shallow tile beneath it.
    function flooded(own) {
        return Object.assign({}, own, { surface: "water", depth: "shallow", murky: false, shading: "water", ground: false, waterlogged: false,
            index: tiles.DNGN_SHALLOW_WATER, relightable: true, material: "stone", effect: own.visible ? "water" : null });
    }
    return { describe: describe, flooded: flooded, floorMax: tiles.FLOOR_MAX };
});
