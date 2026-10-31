define(["graphics-preferences", "graphics-controls"], function (preferences, controls) {
    "use strict";
    function init() {
        var root = document.getElementById("profile_graphics"), data = document.getElementById("profile_graphics_state");
        if (!root || !data) return;
        var initial = JSON.parse(data.textContent);
        preferences.bindUser(initial.username, initial); controls.mount(root);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
});
