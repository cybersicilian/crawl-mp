/* A launch name is separate from the account that owns the expedition. */
define(function () {
    "use strict";
    var drafts = new Map();
    function field(username) {
        var row = document.createElement("div"); row.className = "mode-character-name";
        var label = document.createElement("label"); label.htmlFor = "run_character_name";
        label.textContent = "Character name";
        var input = document.createElement("input");
        input.id = "run_character_name"; input.type = "text"; input.className = "text";
        input.maxLength = 20; input.autocomplete = "off"; input.spellcheck = false;
        input.value = drafts.has(username) ? drafts.get(username) : username || "";
        input.placeholder = "Name your hero";
        input.setAttribute("aria-describedby", "run_character_name_help");
        input.addEventListener("input", function () { drafts.set(username, input.value); input.setCustomValidity(""); });
        var hint = document.createElement("small"); hint.id = "run_character_name_help";
        hint.textContent = "For new runs. Saved heroes keep their names. Name each hero in custom party setup.";
        row.append(label, input, hint);
        return row;
    }
    function read() {
        var input = document.getElementById("run_character_name");
        if (!input) return "";
        var name = input.value.trim();
        var invalid = name && (!/[\p{L}\p{N}]/u.test(name) || /[^\p{L}\p{N} ._-]/u.test(name));
        input.setCustomValidity(Array.from(name).length > 20 ? "Character name must fit within 20 characters."
            : invalid ? "Use letters, numbers, spaces, hyphens, periods or underscores." : "");
        return input.reportValidity() ? name : null;
    }
    return { field: field, read: read };
});
