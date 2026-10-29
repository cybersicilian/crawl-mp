/* Native IDs select declarative material responses. No inferred projectile
 * trajectory or cloud lifetime: native cells remain the sole authority. */
define(["./tileinfo-main"], function (tiles) {
    "use strict";
    var profiles = {
        smoke: { mode: "vapour", volume: true, spread: 1.2, density: .94, speed: .65, lift: 1.2, emission: 0, glow: 0 },
        mist: { mode: "vapour", volume: true, spread: 1.5, density: .78, speed: .4, lift: .24, emission: 0, glow: 0 },
        fumes: { mode: "vapour", volume: true, spread: .9, density: .96, speed: .55, lift: .65, emission: .04, glow: 0 },
        fire: { mode: "vapour", density: .96, speed: 1.3, lift: 1.7, emission: .65, glow: 0 },
        flame: { mode: "energy", speed: 1.3, lift: 1, emission: .85, glow: .32, colour: [255, 161, 74] },
        frost: { mode: "energy", speed: .65, lift: 0, emission: .5, glow: .23, colour: [144, 219, 255] },
        electric: { mode: "energy", speed: 2, lift: 0, emission: 1, glow: .3, colour: [178, 192, 255] },
        magic: { mode: "energy", speed: 1, lift: 0, emission: .65, glow: .23, colour: [203, 163, 255] },
        projectile: { mode: "projectile", speed: 1, lift: 0, emission: .12, glow: .1, colour: [218, 192, 141] }
    };
    profiles.fire.light = { kind: "fire", radius: 3.8, strength: .19, colour: [255, 157, 69], variation: .12, elevation: .85 };
    profiles.fire.radiance = { type: "flame", width: .68, height: .77, y: .88 };
    ["flame", "frost", "electric", "magic"].forEach(function (kind) {
        profiles[kind].light = { kind: kind, radius: 2.6, strength: kind === "flame" ? .14 : .1,
            colour: profiles[kind].colour, variation: .06, elevation: .55 };
        profiles[kind].radiance = { type: "glow", colour: profiles[kind].colour };
    });
    var clouds = new Map(), effects = new Map();
    Object.keys(tiles).forEach(function (name) {
        var index = tiles[name];
        if (!Number.isInteger(index)) return;
        if (name.startsWith("CLOUD_")) {
            var cloud = /FIRE|FLAME/.test(name) ? "fire" : /POISON|MEPHITIC|MIASMA|ACID|MUTAGENIC|RUST/.test(name) ? "fumes"
                : /MIST|COLD|FROST|RAIN|FREEZING|WHITE_SMOKE/.test(name) ? "mist" : "smoke";
            clouds.set(index, profiles[cloud]);
        } else if (/^MI_(DART|JAVELIN|THROWING_NET|ARROW|BOLT|SLUG|STONE|LARGE_ROCK|BOOMERANG|SLING_BULLET)[0-9]/.test(name)) {
            effects.set(index, profiles.projectile);
        } else if (name.startsWith("BOLT_")) {
            var effect = /FLAME|FIRE|MAGMA|LAVA|IGNITE/.test(name) ? "flame" : /FROST|COLD|ICE|ICICLE|FREEZ/.test(name) ? "frost"
                : /ELEC|LIGHTNING|ZAP|ARC|PLASMA/.test(name) ? "electric"
                : /ARROW|BOLT_STEEL|BOLT_SILVER|IRON|STONE|SHOT|SLUG|JAVELIN|SPEAR/.test(name) ? "projectile" : "magic";
            effects.set(index, profiles[effect]);
        }
    });
    return { describe: function (index, kind) {
        var profile = (kind === "cloud" ? clouds : effects).get(index);
        if (!profile) return;
        var info = tiles.get_tile_info(index);
        // Oversized art retains its native overlap bookkeeping and full extent.
        return info && info.w <= 32 && info.h <= 32 ? profile : undefined;
    }, profiles: profiles };
});
