/* Presentation adapter only: account authority lives in graphics-preferences. */
define([], function () {
    "use strict";
    var themes = ["folio", "dungeon", "contrast"];
    var generation = 0;
    function current() {
        var value = document.documentElement.dataset.uiTheme;
        return themes.indexOf(value) === -1 ? "folio" : value;
    }
    return { themes: themes.slice(), current: current, apply: function (value) {
        // Only canonical identifiers reach selectors; never interpolate account text.
        var root = document.documentElement, next = themes.indexOf(value) === -1 ? "folio" : value;
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
