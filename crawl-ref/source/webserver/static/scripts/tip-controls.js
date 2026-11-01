/* Tutorial tip settings for the account page and the in-game dialog. */
define(["jquery", "graphics-preferences", "graphics-controls"], function ($, preferences, controls) {
    "use strict";
    var nextId = 0;
    function mount(root, options) {
        var id = "tips" + (++nextId), signature = "", inputs = new Map(), unavailable = Boolean(options) && options.jev === false;
        var title = document.createElement("h2"); title.id = id + "-title"; title.textContent = "Tutorial tips";
        var intro = document.createElement("p"); intro.className = "graphics-intro";
        intro.textContent = "Saved to your account across browsers. Changes apply immediately to your open games.";
        var group = document.createElement("fieldset"); group.className = "graphics-group tips-group";
        var legend = document.createElement("legend"); legend.className = "tips-legend"; legend.textContent = "How tips behave";
        var status = document.createElement("p"); status.className = "graphics-save-status";
        status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
        root.replaceChildren(title, intro, group, status);
        function build(schema) {
            group.replaceChildren(legend); inputs.clear();
            schema.fields.filter(function (field) { return field.section === "tips"; }).forEach(function (field) {
                var row = controls.row(field, id, function (value) {
                    var patch = {}; patch[field.id] = value; preferences.change(patch);
                });
                if (field.id === "tips_jev" && unavailable) row.label.querySelector(".graphics-help").textContent = "Jev isn't connected on this server, so tips follow their usual order.";
                group.appendChild(row.label); inputs.set(field.id, { field: field, input: row.input });
            });
        }
        function render() {
            var state = preferences.snapshot(), schemaKey = JSON.stringify(state.schema);
            if (schemaKey !== signature) { signature = schemaKey; build(state.schema); }
            var locked = !state.ready || !state.available, off = state.settings.tips_level === "off";
            inputs.forEach(function (entry, key) {
                var input = entry.input, field = entry.field;
                if (field.type === "boolean") input.checked = state.settings[key] === true;
                else input.value = state.settings[key];
                input.disabled = locked || (off && key !== "tips_level")
                    || (key === "tips_jev" && unavailable);
            });
            status.textContent = state.error || (!state.username ? "Sign in to save tip settings."
                : !state.ready ? "Loading your account settings…" : state.saving ? "Saving…" : "Saved to your account.");
            status.dataset.state = state.error ? "error" : state.saving ? "saving" : "saved";
        }
        $(document).on("graphics_settings_changed." + id, render); render();
        return { titleId: title.id, destroy: function () { $(document).off("." + id); } };
    }
    return { mount: mount };
});
