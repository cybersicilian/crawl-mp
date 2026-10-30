/* Collection presentation only. Save identity, authority and actions belong to library-ui. */
define(["text-query"], function (textQuery) {
    "use strict";
    var root, input, status, sort, count, reset, body;
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function select(label, id, options) {
        var field = el("label", "library-select", label), control = el("select");
        control.id = id; control.setAttribute("aria-label", label);
        options.forEach(function (option) {
            var item = el("option", "", option[1]); item.value = option[0]; control.appendChild(item);
        });
        field.appendChild(control); return field;
    }
    function refresh() {
        if (!body) return;
        var match = textQuery.compile(input.value), shown = 0;
        body.querySelectorAll(".game-library-entry").forEach(function (row) {
            var hidden = (status.value !== "all" && row.dataset.status !== status.value) || !match(row.dataset.search);
            if (row.hidden !== hidden) row.hidden = hidden;
            if (!hidden) shown++;
        });
        var rows = body.querySelectorAll(".game-library-entry");
        var message = shown + " of " + rows.length + (rows.length === 1 ? " expedition" : " expeditions");
        if (count.textContent !== message) count.textContent = message;
        root.querySelector("#library_no_matches").hidden = !rows.length || shown > 0;
        reset.disabled = !input.value && status.value === "all";
    }
    function order() {
        if (!body) return;
        var current = Array.from(body.children), ordered = current.slice().sort(function (left, right) {
            var difference = sort.value === "name" ? left.dataset.name.localeCompare(right.dataset.name)
                : sort.value === "progress" ? Number(right.dataset.turns) - Number(left.dataset.turns)
                : Number(right.dataset.saved) - Number(left.dataset.saved);
            return difference || Number(left.dataset.order) - Number(right.dataset.order);
        });
        if (ordered.some(function (row, i) { return row !== current[i]; }))
            ordered.forEach(function (row) { body.appendChild(row); });
    }
    function init(panel) {
        if (root === panel && panel.contains(input)) return;
        var previous = root === panel && input ? { query: input.value, status: status.value, sort: sort.value } : null;
        body = null;
        root = panel;
        var tools = el("div", "library-browser-tools");
        var label = el("label", "library-search-field", "Find an expedition");
        input = el("input", "library-search"); input.type = "search";
        input.placeholder = "Name, hero, species, floor…"; input.id = "library_search";
        input.setAttribute("aria-label", "Find a saved expedition"); input.setAttribute("aria-controls", "library_rows");
        input.setAttribute("aria-describedby", "library_result_count"); label.appendChild(input);
        var statusField = select("Status", "library_status", [["all", "All expeditions"], ["saved", "Saved"],
            ["running", "Running"], ["unavailable", "Unavailable"]]);
        var sortField = select("Sort by", "library_sort", [["recent", "Recently saved"], ["name", "Name A–Z"], ["progress", "Most turns"]]);
        status = statusField.querySelector("select"); sort = sortField.querySelector("select");
        reset = el("button", "dcss-btn library-clear", "Clear filters"); reset.type = "button";
        tools.append(label, statusField, sortField, reset); panel.appendChild(tools);
        count = el("p", "library-result-count"); count.id = "library_result_count"; count.setAttribute("role", "status");
        panel.appendChild(count);
        status.addEventListener("change", refresh);
        sort.addEventListener("change", function () { order(); refresh(); });
        input.addEventListener("input", refresh);
        input.addEventListener("keydown", function (event) {
            if (event.key !== "Escape" || !input.value) return;
            event.preventDefault(); event.stopPropagation(); input.value = ""; refresh();
        });
        reset.addEventListener("click", function () {
            input.value = ""; status.value = "all"; refresh(); input.focus({ preventScroll: true });
        });
        if (previous) { input.value = previous.query; status.value = previous.status; sort.value = previous.sort; }
    }
    function update(nextBody, games) {
        body = nextBody;
        body.querySelectorAll(".game-library-entry").forEach(function (row, index) {
            var game = games[index], state = game.state || {};
            row.dataset.status = game.running ? "running" : game.loadable ? "saved" : "unavailable";
            row.dataset.name = game.name || "";
            row.dataset.turns = Number(state.turns) || 0;
            row.dataset.saved = Date.parse(game.saved_at) || 0;
            row.dataset.order = index;
            row.dataset.search = [game.name, state.place, state.turns, row.dataset.status].concat((state.players || []).map(function (hero) {
                return [hero.name, hero.species, hero.job].join(" ");
            })).join(" ");
        });
        root.querySelector(".library-browser-tools").hidden = !games.length && !input.value && status.value === "all";
        count.hidden = !games.length; order(); refresh();
    }
    return { init: init, update: update };
});
