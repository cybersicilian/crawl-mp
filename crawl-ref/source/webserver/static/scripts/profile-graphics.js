define(["graphics-preferences", "graphics-controls", "tip-controls"], function (preferences, controls, tips) {
    "use strict";
    function init() {
        var root = document.getElementById("profile_graphics"), data = document.getElementById("profile_graphics_state");
        if (!root || !data) return;
        var initial = JSON.parse(data.textContent);
        preferences.bindUser(initial.username, initial); controls.mount(root);
        var tipRoot = document.getElementById("profile_tips");
        if (tipRoot) tips.mount(tipRoot);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
});
