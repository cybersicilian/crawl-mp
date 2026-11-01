/* The profile and in-game tileset choice share one account save controller. */
define(["jquery", "appearance-preferences"], function ($, preferences) {
    "use strict";
    function init() {
        var root = document.getElementById("profile_appearance");
        if (!root) return;
        var options = Array.from(root.querySelectorAll("input[name='texture_pack']"));
        var status = root.querySelector("[role='status']");
        preferences.bindUser(root.dataset.username, {
            username: root.dataset.username, texture_pack: root.dataset.texturePack, available: true
        });
        function render() {
            var state = preferences.snapshot();
            options.forEach(function (input) {
                input.checked = input.value === state.selected; input.disabled = !state.ready || !state.available;
                var card = input.closest(".texture-choice");
                if (card) card.classList.toggle("is-selected", input.checked);
            });
            status.textContent = state.error || (state.saving ? "Saving…" : "Saved to your profile. Applies to your open games.");
            status.dataset.state = state.error ? "error" : state.saving ? "saving" : "saved";
        }
        options.forEach(function (input) {
            input.addEventListener("change", function () { if (input.checked) preferences.change(input.value); });
        });
        $(document).on("appearance_settings_changed.profileAppearance", render); render();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
});
