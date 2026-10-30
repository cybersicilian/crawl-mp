/* Visual selection over native selects; consumers retain validation and commands. */
define(["class-art"], function (classArt) {
    "use strict";
    var controls = new WeakMap();
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function art(record, kind) {
        if (kind !== "species") return classArt.render(record);
        if (!record.tile) return el("span", "visual-choice-image", record.abbr || "?");
        var image = el("img", "visual-choice-image");
        image.alt = ""; image.loading = "lazy"; image.decoding = "async";
        image.src = record.tile.src;
        return image;
    }
    function create(select, kind, records) {
        var root = el("div", "visual-choices"), tools = el("div", "visual-choice-tools");
        var search = el("input", "visual-choice-search"); search.type = "search";
        search.id = select.id + "_visual_search"; search.placeholder = "Find " + kind + "…";
        search.setAttribute("aria-label", "Find " + kind + " for " + (select.getAttribute("aria-label") || "hero"));
        var toggle = el("button", "visual-choice-toggle"); toggle.type = "button";
        var list = el("div", "visual-choice-list"); list.id = select.id + "_visual_choices";
        list.setAttribute("role", "group"); list.setAttribute("aria-label", kind + " choices");
        toggle.setAttribute("aria-controls", list.id);
        var status = el("span", "visual-choice-count"); status.setAttribute("role", "status");
        tools.append(search, toggle); root.append(tools, list, status);
        select.after(root); select.classList.add("choice-native-select");
        select.tabIndex = -1; select.setAttribute("aria-hidden", "true");
        var label = select.parentElement.querySelector("label"); if (label) label.htmlFor = search.id;
        var state = { root: root, select: select, kind: kind, records: records, search: search, toggle: toggle,
            list: list, status: status, expanded: false, signature: "" };
        controls.set(select, state);
        search.addEventListener("input", function () { render(state); });
        ["keydown", "keypress"].forEach(function (type) {
            search.addEventListener(type, function (event) { event.stopPropagation(); });
        });
        toggle.addEventListener("click", function () { state.expanded = !state.expanded; render(state); });
        return state;
    }
    function render(state) {
        var select = state.select, query = state.search.value.trim().toLocaleLowerCase();
        var options = Array.from(select.options).filter(function (option) {
            return !option.disabled && !option.hidden && state.records[option.value]
                && (!query || option.value.toLocaleLowerCase().includes(query));
        });
        var shown = options;
        if (!query && !state.expanded && options.length > 6) {
            shown = options.slice(0, 6);
            var selected = options.find(function (option) { return option.value === select.value; });
            if (selected && shown.indexOf(selected) < 0) shown[shown.length - 1] = selected;
        }
        state.list.replaceChildren();
        state.list.classList.toggle("is-expanded", state.expanded || !!query);
        shown.forEach(function (option) {
            var record = state.records[option.value], chosen = select.value === option.value;
            var button = el("button", "visual-choice"); button.type = "button";
            button.dataset.value = option.value; button.disabled = select.disabled;
            button.setAttribute("aria-pressed", String(chosen));
            button.setAttribute("aria-label", record.name + (option.dataset.recommended === "true" ? ", recommended" : ""));
            button.title = (record.description || "").replace(/\s+/g, " ");
            var image = el("span", "visual-choice-art"); image.appendChild(art(record, state.kind));
            var text = el("span", "visual-choice-text");
            text.appendChild(el("strong", "visual-choice-name", record.name));
            text.appendChild(el("small", "visual-choice-meta", option.dataset.recommended === "true" ? "✦ Recommended" : record.category || record.abbr || ""));
            button.append(image, text);
            button.addEventListener("click", function () {
                if (select.disabled || option.disabled || select.value === option.value) return;
                select.value = option.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                var replacement = Array.from(state.list.children).find(function (node) { return node.dataset.value === option.value; });
                if (replacement) replacement.focus({ preventScroll: true });
            });
            state.list.appendChild(button);
        });
        state.search.disabled = select.disabled; state.toggle.disabled = select.disabled;
        state.toggle.hidden = !!query || options.length <= 6;
        state.toggle.textContent = state.expanded ? "Show fewer" : "Show all " + options.length;
        state.toggle.setAttribute("aria-expanded", String(state.expanded || !!query));
        state.status.textContent = options.length ? (query ? options.length + " matching choices" : "") : "No available matches.";
    }
    function refresh(select, kind, records) {
        if (!select) return;
        var state = controls.get(select) || create(select, kind, records);
        var signature = JSON.stringify([select.value, select.disabled, Array.from(select.options).map(function (option) {
            return [option.value, option.disabled, option.hidden, option.dataset.recommended];
        })]);
        if (state.signature !== signature) { state.signature = signature; render(state); }
    }
    function reset(select) {
        var state = select && controls.get(select);
        if (!state) return;
        state.search.value = ""; state.expanded = false; state.signature = "";
    }
    return { refresh: refresh, reset: reset };
});
