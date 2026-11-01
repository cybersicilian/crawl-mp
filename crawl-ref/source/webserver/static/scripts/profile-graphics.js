/* Compatibility for cached copies of the former standalone appearance page. */
define([], function () {
    "use strict";
    function openSharedSettings() {
        if (!document.getElementById("profile_graphics")) return;
        var category = location.hash === "#profile_tips" ? "tips" : "appearance";
        location.replace("/?settings=" + category + "#lobby");
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", openSharedSettings, { once: true });
    else openSharedSettings();
});
