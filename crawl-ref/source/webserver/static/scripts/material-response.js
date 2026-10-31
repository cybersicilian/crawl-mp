/* Reusable surface parameters: relief, roughness, reflectance and light gain.
 * Pigment and geometry still come from the consumer's selected artwork. */
define([], function () {
    "use strict";
    var profiles = {
        stone: { relief: .8, roughness: .84, reflectance: .025, gain: 2.8 },
        wall: { relief: 1.1, roughness: .82, reflectance: .025, gain: 3.5 },
        brick: { relief: 1.05, roughness: .9, reflectance: .018, gain: 3.5 },
        wood: { relief: .7, roughness: .8, reflectance: .045, gain: 3.3 },
        metal: { relief: .7, roughness: .34, reflectance: .48, gain: 3.1 },
        crystal: { relief: 1.15, roughness: .23, reflectance: .56, gain: 3.2 },
        glass: { relief: .45, roughness: .12, reflectance: .64, gain: 2.8 },
        moss: { relief: .5, roughness: .98, reflectance: .008, gain: 2.65 },
        sand: { relief: .55, roughness: .96, reflectance: .012, gain: 2.8 },
        water: { relief: 1.2, roughness: .27, reflectance: .42, gain: 2.8 }
    };
    Object.keys(profiles).forEach(function (key) { Object.freeze(profiles[key]); }); Object.freeze(profiles);
    return { get: function (material) { return profiles[material] || profiles.stone; }, profiles: profiles };
});
