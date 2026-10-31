/* One schema-driven control surface for profiles and the in-game dialog. */
define(["jquery", "graphics-preferences", "graphics-settings-model"], function ($, preferences, model) {
    "use strict";
    var nextId = 0;
    // Presentation copy for the theme swatches; the schema stays canonical for values and labels.
    var themeCopy = { folio: "Leather, brass and parchment pages", dungeon: "Slate, silver and dark pages", contrast: "Black, white rules and yellow cues" };
    function node(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }
    function swatch(theme) {
        var art = node("span", "graphics-swatch-art"); art.dataset.graphicsSwatch = theme; art.setAttribute("aria-hidden", "true");
        art.append(node("span", "graphics-swatch-binding"), node("span", "graphics-swatch-page"), node("span", "graphics-swatch-accent"));
        return art;
    }
    function mount(root) {
        var id = "graphics" + (++nextId), signature = "", inputs = new Map(), presets = new Map(), themes = new Map();
        var heading = node("div", "graphics-heading"), title = node("h2", "", "Appearance & graphics");
        title.id = id + "-title"; heading.appendChild(title);
        var badge = node("span", "graphics-current"); heading.appendChild(badge);
        root.replaceChildren(heading, node("p", "graphics-intro",
            "Saved to your account across browsers. Changes apply immediately to your open games. Party members keep their own view."));
        var appearance = node("div", "graphics-appearance"), choices = node("div", "graphics-presets"), groups = node("div", "graphics-groups");
        var renderingTitle = node("h3", "graphics-rendering-title", "Dungeon graphics");
        var renderingHelp = node("p", "graphics-rendering-help", "Pick a rendering preset, then fine-tune individual effects. Any edit becomes a Custom configuration.");
        choices.setAttribute("role", "group"); choices.setAttribute("aria-label", "Graphics preset");
        var status = node("p", "graphics-save-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
        var retry = node("button", "graphics-retry tr-btn", "Retry connection"); retry.type = "button";
        retry.addEventListener("click", function () { preferences.refresh(); });
        root.append(appearance, renderingTitle, renderingHelp, choices, groups, status, retry);
        function themePicker(field, select) {
            var picker = node("div", "graphics-swatches"); picker.setAttribute("role", "group"); picker.setAttribute("aria-label", field.label);
            field.options.forEach(function (value, index) {
                var button = node("button", "graphics-swatch"); button.type = "button"; button.dataset.graphicsTheme = value;
                var copy = node("span", "graphics-swatch-copy");
                copy.append(node("strong", "", (field.optionLabels || field.options)[index]), node("span", "", themeCopy[value] || ""));
                button.append(swatch(value), copy);
                button.addEventListener("click", function () { preferences.change({ ui_theme: value }); });
                picker.appendChild(button); themes.set(value, button);
            });
            var preview = node("div", "graphics-theme-preview"); preview.setAttribute("aria-hidden", "true");
            preview.append(node("span", "graphics-preview-binding", "Expedition"),
                node("span", "graphics-preview-page", "Your adventurer's journal"));
            return [picker, select, preview];
        }
        function build(schema) {
            appearance.replaceChildren(); choices.replaceChildren(); groups.replaceChildren(); inputs.clear(); presets.clear(); themes.clear();
            schema.presets.forEach(function (preset) {
                var button = node("button", "graphics-preset"); button.type = "button"; button.dataset.graphicsPreset = preset.id;
                button.append(node("strong", "", preset.label), node("span", "", preset.description));
                button.addEventListener("click", function () {
                    var value = model.preset(preset.id, preferences.snapshot().settings);
                    preferences.change(value);
                });
                choices.appendChild(button); presets.set(preset.id, button);
            });
            var fieldsets = new Map();
            schema.fields.filter(function (field) { return !field.hidden; }).forEach(function (field) {
                var fieldset = fieldsets.get(field.group);
                if (!fieldset) {
                    fieldset = node("fieldset", "graphics-group"); fieldset.appendChild(node("legend", "", field.group));
                    fieldsets.set(field.group, fieldset);
                    (field.id === "ui_theme" ? appearance : groups).appendChild(fieldset);
                }
                var label = node("label", "graphics-setting"), input = node(field.type === "boolean" ? "input" : "select");
                input.id = id + "-" + field.id; input.dataset.graphicsField = field.id;
                if (field.type === "boolean") { input.type = "checkbox"; input.className = "graphics-switch"; input.setAttribute("role", "switch"); }
                else field.options.forEach(function (value, index) {
                    var option = node("option", "", (field.optionLabels || field.options)[index]); option.value = value; input.appendChild(option);
                });
                var copy = node("span", "graphics-setting-copy"), help = node("span", "graphics-help", field.description);
                help.id = input.id + "-help"; input.setAttribute("aria-describedby", help.id);
                copy.append(node("strong", "", field.label), help); label.append(copy, input);
                label.classList.add(field.type === "boolean" ? "graphics-setting-switch" : "graphics-setting-choice");
                if (field.id === "ui_theme") { label.classList.add("graphics-theme-select"); themePicker(field, label).forEach(function (part) { fieldset.appendChild(part); }); }
                else fieldset.appendChild(label);
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
            var preset = model.matching(state.settings), locked = !state.ready || !state.available;
            badge.textContent = preset === "custom" ? "Custom" : preset.charAt(0).toUpperCase() + preset.slice(1);
            badge.dataset.preset = preset;
            presets.forEach(function (button, key) {
                button.setAttribute("aria-pressed", String(key === preset)); button.disabled = locked;
            });
            themes.forEach(function (button, key) {
                button.setAttribute("aria-pressed", String(key === state.settings.ui_theme)); button.disabled = locked;
            });
            inputs.forEach(function (entry, key) {
                var input = entry.input;
                if (entry.field.type === "boolean") input.checked = state.settings[key] === true;
                else input.value = state.settings[key];
                input.disabled = locked || Boolean(entry.field.requires && !state.settings[entry.field.requires]);
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
