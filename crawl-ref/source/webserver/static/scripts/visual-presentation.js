/* Account graphics are independent of native options and texture packs. */
define(["jquery", "graphics-preferences", "graphics-settings-model"], function ($, preferences, model) {
    "use strict";
    var values = preferences.snapshot().settings, signature = JSON.stringify(values);
    function update(event, state) {
        var next = JSON.stringify(state.settings);
        if (next === signature) return;
        signature = next; values = state.settings;
        document.documentElement.dataset.presentation = values.mode;
        document.documentElement.dataset.graphicsInterface = String(values.mode === "premium" && values.interface === true);
        document.documentElement.dataset.graphicsMotion = values.motion;
        $(document).trigger("visual_presentation_changed", [values.mode]);
        $(document).trigger("premium_animation_cadence_changed");
    }
    $(document).on("graphics_settings_changed.presentation", update);
    document.documentElement.dataset.presentation = values.mode;
    document.documentElement.dataset.graphicsInterface = String(values.mode === "premium" && values.interface === true);
    document.documentElement.dataset.graphicsMotion = values.motion;
    return { current: function () { return values.mode; }, premium: function () { return values.mode === "premium"; },
        enabled: function (feature) { return values.mode === "premium" && values[feature] === true; },
        animated: function () { return values.motion !== "reduced"; },
        select: function (mode) {
            var settings = model.preset(mode, values); return settings ? preferences.change(settings) : false;
        } };
});
