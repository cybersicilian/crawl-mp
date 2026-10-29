/* Reversible choices apply immediately; serialized writes preserve the last choice. */
define(["texture-pack"], function (texturePack) {
    "use strict";
    function init() {
    var root = document.getElementById("profile_appearance");
    if (!root) return;
    var options = Array.from(root.querySelectorAll("input[name='texture_pack']"));
    var status = root.querySelector("[role='status']"), confirmed = root.dataset.texturePack;
    var desired = confirmed, saving = false;
    texturePack.bindUser(root.dataset.username); texturePack.select(confirmed);
    function render(message) {
        options.forEach(function (input) { input.checked = input.value === desired; });
        status.textContent = message;
    }
    function saveNext() {
        if (saving || desired === confirmed) return;
        saving = true;
        var value = desired, token = root.querySelector("input[name='_xsrf']").value;
        fetch("/api/profile/appearance", { method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-XSRFToken": token, "X-Profile-User": root.dataset.username },
            body: JSON.stringify({ texture_pack: value }) }).then(function (response) {
            if (!response.ok) throw new Error("Save failed");
            return response.json();
        }).then(function (data) {
            if (data.texture_pack !== value || data.username.toLowerCase() !== root.dataset.username.toLowerCase())
                throw new Error("Unexpected preference response");
            confirmed = value;
            if (desired === value) render("Saved to your profile. Applies to your open games.");
        }).catch(function () {
            if (desired === value) {
                desired = confirmed; texturePack.select(confirmed);
                render("Could not save. Your previous texture pack has been restored. Try again.");
            } else if (desired === confirmed) render("Saved to your profile.");
        }).finally(function () {
            saving = false;
            if (desired !== confirmed) saveNext();
        });
    }
    options.forEach(function (input) {
        input.addEventListener("change", function () {
            if (!input.checked || !texturePack.select(input.value)) return;
            desired = input.value;
            render(desired === confirmed && !saving ? "Saved to your profile." : "Saving…");
            saveNext();
        });
    });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
});
