/* Continuous, world-anchored source variation. Geometry and hue never jitter. */
define([], function () {
    "use strict";
    function level(light, now, enabled) {
        if (!enabled || light.animated === false || !light.variation) return 1;
        var time = now / 1000, seed = light.x * 2.17 + light.y * 3.13;
        var wave = Math.sin(time * 2.3 + seed) * .65 + Math.sin(time * 5.1 + seed * 1.7) * .35;
        return 1 + wave * light.variation;
    }
    function sample(light, now, enabled) {
        return Object.assign({}, light, { strength: light.strength * level(light, now, enabled) });
    }
    return { level: level, sample: sample };
});
