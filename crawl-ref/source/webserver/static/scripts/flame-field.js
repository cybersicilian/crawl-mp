/* Advected flame density in normalized emitter space. Geometry, lifetime and
 * palette belong to the consumer; no world or rendering dependencies. */
define(["liquid-field"], function (field) {
    "use strict";
    function sample(x, rise, seconds, seed) {
        if (rise < 0 || rise > 1 || Math.abs(x) > 1.25) return { alpha: 0, colour: [0, 0, 0] };
        var billow = field.noise(x * 2.4 + seed, rise * 4 - seconds * 2.8, 256);
        var detail = field.noise(x * 5.2 - seconds * .55 + seed, rise * 7 - seconds * 4.3, 256);
        var curl = Math.sin(rise * 6.5 - seconds * 3.1 + seed) * .15 * rise + (billow - .5) * .32;
        var width = (.86 - rise * .64) * (.67 + billow * .56);
        var edge = 1 - field.smooth(width - .2, width + .06, Math.abs(x + curl));
        var tip = 1 - field.smooth(.47 + billow * .34, .9 + detail * .1, rise);
        var heat = Math.max(0, Math.min(1, 1 - rise * .66 - Math.abs(x + curl) * .32 + (detail - .5) * .2));
        var core = field.smooth(.6, .96, heat);
        return { alpha: edge * tip * (.7 + detail * .3),
            colour: [219 + heat * 36, 50 + heat * 112 + core * 88, 14 + heat * 19 + core * 143] };
    }
    return { sample: sample };
});
