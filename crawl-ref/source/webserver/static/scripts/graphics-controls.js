/* One schema-driven control surface for profiles and the in-game dialog. */
define(["jquery", "graphics-preferences", "graphics-settings-model"], function ($, preferences, model) {
    "use strict";
    var nextId = 0;
    function node(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }
    function mount(root) {
        var id = "graphics" + (++nextId), signature = "", inputs = new Map(), presets = new Map();
        var heading = node("div", "graphics-heading"), title = node("h2", "", "Graphics settings");
        title.id = id + "-title"; heading.appendChild(title);
        var badge = node("span", "graphics-current"); heading.appendChild(badge);
        root.replaceChildren(heading, node("p", "graphics-intro",
            "Saved to your account across browsers. Changes apply immediately to your open games. Party members keep their own view."));
        var choices = node("div", "graphics-presets"), groups = node("div", "graphics-groups");
        choices.setAttribute("role", "group"); choices.setAttribute("aria-label", "Graphics preset");
        var status = node("p", "graphics-save-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
        var retry = node("button", "graphics-retry", "Retry connection"); retry.type = "button";
        retry.addEventListener("click", function () { preferences.refresh(); });
        root.append(choices, groups, status, retry);
        function build(schema) {
            choices.replaceChildren(); groups.replaceChildren(); inputs.clear(); presets.clear();
            schema.presets.forEach(function (preset) {
                var button = node("button", "graphics-preset"); button.type = "button"; button.dataset.graphicsPreset = preset.id;
                button.append(node("strong", "", preset.label), node("span", "", preset.description));
                button.addEventListener("click", function () {
                    var value = model.preset(preset.id); value.motion = preferences.snapshot().settings.motion;
                    preferences.change(value);
                });
                choices.appendChild(button); presets.set(preset.id, button);
            });
            var fieldsets = new Map();
            schema.fields.filter(function (field) { return !field.hidden; }).forEach(function (field) {
                var fieldset = fieldsets.get(field.group);
                if (!fieldset) {
                    fieldset = node("fieldset", "graphics-group"); fieldset.appendChild(node("legend", "", field.group));
                    fieldsets.set(field.group, fieldset); groups.appendChild(fieldset);
                }
                var label = node("label", "graphics-setting"), input = node(field.type === "boolean" ? "input" : "select");
                input.id = id + "-" + field.id; input.dataset.graphicsField = field.id;
                if (field.type === "boolean") input.type = "checkbox";
                else field.options.forEach(function (value, index) {
                    var option = node("option", "", (field.optionLabels || field.options)[index]); option.value = value; input.appendChild(option);
                });
                var copy = node("span", "graphics-setting-copy"), help = node("span", "graphics-help", field.description);
                help.id = input.id + "-help"; input.setAttribute("aria-describedby", help.id);
                copy.append(node("strong", "", field.label), help); label.append(copy, input); fieldset.appendChild(label);
                input.addEventListener("change", function () {
                    var value = field.type === "boolean" ? input.checked : input.value, patch = {}; patch[field.id] = value;
                    var settings = Object.assign({}, preferences.snapshot().settings, patch);
                    if (field.type === "boolean") patch.mode = schema.fields.some(function (entry) {
                        return entry.type === "boolean" && settings[entry.id];
                    }) ? "premium" : "classic";
                    preferences.change(patch);
                });
                inputs.set(field.id, { field: field, input: input });
            });
        }
        function render() {
            var state = preferences.snapshot(), schemaKey = JSON.stringify(state.schema);
            if (schemaKey !== signature) { signature = schemaKey; build(state.schema); }
            var preset = model.matching(state.settings);
            badge.textContent = preset === "custom" ? "Custom" : preset.charAt(0).toUpperCase() + preset.slice(1);
            presets.forEach(function (button, key) {
                button.setAttribute("aria-pressed", String(key === preset)); button.disabled = !state.ready || !state.available;
            });
            inputs.forEach(function (entry, key) {
                var input = entry.input;
                if (entry.field.type === "boolean") input.checked = state.settings[key] === true;
                else input.value = state.settings[key];
                input.disabled = !state.ready || !state.available || Boolean(entry.field.requires && !state.settings[entry.field.requires]);
            });
            status.textContent = state.error || (!state.username ? "Sign in to save graphics settings."
                : !state.ready ? "Loading your account settings…" : state.saving ? "Saving…" : "Saved to your account.");
            status.dataset.state = state.error ? "error" : state.saving ? "saving" : "saved";
            retry.hidden = !state.error;
        }
        $(document).on("graphics_settings_changed." + id, render); render();
        return { titleId: title.id, destroy: function () { $(document).off("." + id); } };
    }
    return { mount: mount };
});
