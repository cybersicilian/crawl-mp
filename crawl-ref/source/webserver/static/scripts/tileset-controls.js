/* Shared tileset rows for the profile page and the in-game graphics dialog. */
define(["jquery", "appearance-preferences"], function ($, preferences) {
    "use strict";
    var nextId = 0;
    function node(tag, className, text) {
        var element = document.createElement(tag); element.className = className;
        if (text) element.textContent = text;
        return element;
    }
    function mount(root) {
        var id = "tileset" + (++nextId), inputs = [];
        var fieldset = node("fieldset", "graphics-group"), help = node("p", "graphics-help",
            "Switch terrain, creatures and item artwork immediately. Saved to your account; each player keeps their own tileset.");
        help.id = id + "-help";
        fieldset.append(node("legend", "", "Tileset"), help);
        [["classic", "Default tiles", "Original Crawl pixel artwork."],
            ["illustrated", "Premium tiles", "Illustrated terrain, creatures and equipment. Original art fills any gaps."]]
            .forEach(function (choice) {
                var row = node("label", "graphics-setting"), copy = node("span", "graphics-setting-copy");
                var input = node("input", ""); input.type = "radio"; input.name = id; input.value = choice[0];
                input.dataset.tileset = choice[0]; input.setAttribute("aria-describedby", help.id);
                copy.append(node("strong", "", choice[1]), node("span", "graphics-help", choice[2]));
                row.append(copy, input); fieldset.appendChild(row); inputs.push(input);
                input.addEventListener("change", function () { if (input.checked) preferences.change(input.value); });
            });
        var status = node("p", "tileset-save-status profile-save-status graphics-help");
        status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
        var retry = node("button", "graphics-retry", "Retry tileset connection"); retry.type = "button";
        retry.addEventListener("click", preferences.refresh);
        root.replaceChildren(fieldset, status, retry);
        function render() {
            var state = preferences.snapshot();
            inputs.forEach(function (input) {
                input.checked = input.value === state.selected; input.disabled = !state.ready || !state.available;
            });
            status.textContent = state.error || (!state.username ? "Sign in to choose your tileset."
                : !state.ready ? "Loading your tileset…" : state.saving ? "Saving…" : "Saved to your profile. Applies to your open games.");
            retry.hidden = !state.error;
        }
        $(document).on("appearance_settings_changed." + id, render); render();
        return { destroy: function () { $(document).off("." + id); } };
    }
    return { mount: mount };
});
