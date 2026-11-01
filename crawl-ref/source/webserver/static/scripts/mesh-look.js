/* Shared display-space atmosphere for mesh surfaces and palette-preserving art.
 * The consumer may supply scene.look; this module has no world or game access.
 * Ambient values are linear irradiance; fogColor is an output/display color. */
define([], function () {
    "use strict";
    var defaults = Object.freeze({
        ambient: Object.freeze([0.16, 0.185, 0.22]),
        bounce: Object.freeze([0.09, 0.075, 0.05]),
        fogColor: Object.freeze([0.045, 0.058, 0.072]),
        fogDensity: 0.038, fogStart: 1.5, exposure: 1.65
    });
    function bounded(value, fallback, low, high) {
        return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
    }
    function color(value, fallback, high) {
        return fallback.map(function (component, index) {
            return bounded(value && value[index], component, 0, high);
        });
    }
    function resolve(input) {
        input = input || {};
        return {
            ambient: color(input.ambient, defaults.ambient, 2),
            bounce: color(input.bounce, defaults.bounce, 2),
            fogColor: color(input.fogColor, defaults.fogColor, 1),
            fogDensity: bounded(input.fogDensity, defaults.fogDensity, 0, 1),
            fogStart: bounded(input.fogStart, defaults.fogStart, 0, 100),
            exposure: bounded(input.exposure, defaults.exposure, 0.1, 8)
        };
    }
    // CPU reference also lets non-WebGL consumers use exactly the same haze.
    function fogAmount(distance, input) {
        var look = resolve(input);
        return 1 - Math.exp(-Math.max(0, bounded(distance, 0, 0, 10000) - look.fogStart) * look.fogDensity);
    }
    var glsl = [
        "uniform vec3 uAmbient; uniform vec3 uBounce; uniform vec3 uFogColor; uniform vec3 uAtmosphere;",
        "vec3 meshAmbient(vec3 normal){return uAmbient+uBounce*max(0.0,normal.y);}",
        "vec3 meshDisplay(vec3 linearColor){return pow(vec3(1.0)-exp(-max(linearColor,vec3(0.0))*uAtmosphere.z),vec3(1.0/2.2));}",
        // Apply only after tone mapping, equally to sprites, glass and terrain.
        "vec3 meshAtmosphere(vec3 displayColor,vec3 point,vec3 eye){",
        " float distance=max(0.0,length(eye-point)-uAtmosphere.y);",
        " float amount=1.0-exp(-distance*uAtmosphere.x);return mix(displayColor,uFogColor,amount); }"
    ].join("\n");
    return { defaults: defaults, resolve: resolve, fogAmount: fogAmount, glsl: glsl };
});
