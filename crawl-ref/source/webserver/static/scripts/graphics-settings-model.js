/* Shared schema-driven values; the server supplies the canonical schema. */
define([], function () {
    "use strict";
    var schema = { version: 1, fields: [], presets: [] }, fields = Object.create(null);
    function valid(field, value) {
        return field.type === "boolean" ? typeof value === "boolean"
            : typeof value === "string" && field.options.indexOf(value) !== -1;
    }
    function configure(next) {
        if (!next || next.version !== 1 || !Array.isArray(next.fields) || !Array.isArray(next.presets)) return false;
        var candidate = Object.create(null);
        if (!next.fields.every(function (field) {
            if (!field || typeof field.id !== "string" || !/^[a-z_]+$/.test(field.id) || field.id === "__proto__" || candidate[field.id]
                || ["boolean", "choice"].indexOf(field.type) === -1
                || field.type === "choice" && !Array.isArray(field.options) || !valid(field, field.default)) return false;
            candidate[field.id] = field; return true;
        }) || !candidate.mode || !candidate.motion) return false;
        schema = next; fields = candidate; return true;
    }
    function defaults() {
        var result = { mode: "classic", motion: "system", ui_theme: "folio" };
        Object.keys(fields).forEach(function (key) { result[key] = fields[key].default; });
        return result;
    }
    function validate(changes) {
        if (!changes || Array.isArray(changes) || typeof changes !== "object" || !Object.keys(changes).length) return null;
        return Object.keys(changes).every(function (key) { return fields[key] && valid(fields[key], changes[key]); })
            ? Object.assign({}, changes) : null;
    }
    function normalize(value) {
        var result = defaults();
        Object.keys(fields).forEach(function (key) { if (value && valid(fields[key], value[key])) result[key] = value[key]; });
        return result;
    }
    function preset(id, current) {
        var found = schema.presets.find(function (entry) { return entry.id === id; });
        if (!found) return null;
        var result = normalize(found.settings), previous = normalize(current);
        Object.keys(fields).forEach(function (key) {
            if (fields[key].presetIndependent) result[key] = previous[key];
        });
        return result;
    }
    function matching(value) {
        var found = schema.presets.find(function (entry) {
            var values = preset(entry.id);
            return Object.keys(fields).every(function (key) { return fields[key].presetIndependent || values[key] === value[key]; });
        });
        return found ? found.id : "custom";
    }
    return { configure: configure, defaults: defaults, validate: validate, normalize: normalize,
        preset: preset, matching: matching, schema: function () { return schema; } };
});
