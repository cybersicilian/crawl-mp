/* Presentation adapter only: account authority lives in graphics-preferences. */
define([], function () {
    "use strict";
    var generation = 0;
    return { apply: function (value) {
        // Only canonical identifiers reach selectors; never interpolate account text.
        var root = document.documentElement, next = ["folio", "dungeon", "contrast"].indexOf(value) === -1 ? "folio" : value;
        if (root.dataset.uiTheme === next) return;
        var change = ++generation;
        // Foreground and surface must change together, including during preview.
        root.dataset.uiThemeChanging = ""; root.dataset.uiTheme = next;
        if (typeof window.requestAnimationFrame !== "function") { delete root.dataset.uiThemeChanging; return; }
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                if (change === generation) delete root.dataset.uiThemeChanging;
            });
        });
    } };
});
