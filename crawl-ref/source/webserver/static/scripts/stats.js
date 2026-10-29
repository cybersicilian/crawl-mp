/* /stats tables: client-side sorting (aria-sort) and text search. Vanilla JS. */
(function () {
    "use strict";
    var storageKey = "stats-tables:" + window.location.pathname + window.location.search;
    var state = {};
    try { state = JSON.parse(window.sessionStorage.getItem(storageKey) || "{}"); } catch (_) { /* Storage is optional. */ }
    if (!state || typeof state !== "object" || Array.isArray(state)) state = {};

    function tableState(id) {
        if (!state[id] || typeof state[id] !== "object") state[id] = {};
        return state[id];
    }

    function remember() {
        try { window.sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { /* Private browsing. */ }
    }

    function cellValue(row, index, numeric) {
        var cell = row.cells[index];
        if (!cell) return numeric ? NaN : "";
        if (numeric) {
            var raw = cell.getAttribute("data-sort");
            var num = raw === null || raw === "" ? NaN : parseFloat(raw);
            return num;
        }
        return (cell.textContent || "").trim().toLowerCase();
    }

    function sortTable(table, index, button, restoredDirection) {
        var th = button.closest("th");
        var numeric = button.getAttribute("data-num") === "1";
        var current = th.getAttribute("aria-sort");
        // Numbers default to largest-first; text to A→Z.
        var direction = restoredDirection || (current === "none" || !current ?
            (numeric ? "descending" : "ascending") :
            (current === "ascending" ? "descending" : "ascending"));
        Array.prototype.forEach.call(table.tHead.rows[0].cells, function (other) {
            other.setAttribute("aria-sort", "none");
        });
        th.setAttribute("aria-sort", direction);
        var body = table.tBodies[0];
        var rows = Array.prototype.slice.call(body.rows);
        var sign = direction === "ascending" ? 1 : -1;
        rows.sort(function (a, b) {
            var x = cellValue(a, index, numeric), y = cellValue(b, index, numeric);
            if (numeric) {
                var xn = isNaN(x), yn = isNaN(y);
                if (xn && yn) return 0;
                if (xn) return 1;   // empty values always sink
                if (yn) return -1;
                return x === y ? 0 : (x - y) * sign;
            }
            if (!x && y) return 1;
            if (x && !y) return -1;
            return x.localeCompare(y, undefined, { numeric: true }) * sign;
        });
        var fragment = document.createDocumentFragment();
        rows.forEach(function (row) { fragment.appendChild(row); });
        body.appendChild(fragment);
        tableState(table.id).sort = { index: index, direction: direction };
        remember();
    }

    function initSorting(table) {
        var head = table.tHead && table.tHead.rows[0];
        if (!head) return;
        Array.prototype.forEach.call(head.cells, function (th, index) {
            var button = th.querySelector(".stats-sort");
            if (button) button.addEventListener("click", function () { sortTable(table, index, button); });
        });
        var saved = tableState(table.id).sort;
        if (saved && head.cells[saved.index] && /^(ascending|descending)$/.test(saved.direction)) {
            var button = head.cells[saved.index].querySelector(".stats-sort");
            if (button) sortTable(table, saved.index, button, saved.direction);
        }
    }

    function initSearch(input) {
        var table = document.getElementById(input.getAttribute("data-stats-search"));
        if (!table) return;
        var section = table.closest(".stats-section");
        var empty = section && section.querySelector(".stats-noresults");
        var count = section && section.querySelector(".stats-row-count");
        var timer = null;
        var saved = tableState(table.id);
        if (typeof saved.query === "string") input.value = saved.query;
        function apply() {
            var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
            var shown = 0;
            Array.prototype.forEach.call(table.tBodies[0].rows, function (row) {
                var text = row.getAttribute("data-search-text");
                if (text === null) {
                    text = (row.textContent || "").replace(/\s+/g, " ").toLowerCase();
                    row.setAttribute("data-search-text", text);
                }
                var recorded = section.querySelector("[data-table-records]");
                var match = (!recorded || !recorded.checked || row.dataset.hasRecord === "true") &&
                    terms.every(function (term) { return text.indexOf(term) !== -1; });
                row.hidden = !match;
                if (match) shown++;
            });
            if (empty) empty.hidden = shown !== 0;
            if (count) count.textContent = terms.length ? shown + " of " + table.tBodies[0].rows.length + " entries" :
                shown + (shown === 1 ? " entry" : " entries");
            saved.query = input.value;
            remember();
        }
        input.addEventListener("input", function () {
            window.clearTimeout(timer);
            timer = window.setTimeout(apply, 80);
        });
        input.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && input.value) { input.value = ""; apply(); }
        });
        var recordFilter = section.querySelector("[data-table-records]");
        if (recordFilter) recordFilter.addEventListener("change", apply);
        var clear = section.querySelector("[data-stats-clear]");
        if (clear) clear.addEventListener("click", function () {
            input.value = "";
            if (recordFilter && recordFilter.checked) {
                recordFilter.checked = false; recordFilter.dispatchEvent(new Event("change"));
            }
            apply(); input.focus();
        });
        apply();
    }

    function initFilters(form) {
        var submitted = false;
        function submit() {
            if (submitted || !form.reportValidity()) return;
            submitted = true;
            form.requestSubmit();
        }
        form.classList.add("is-enhanced");
        form.querySelectorAll("select, input[type=checkbox]").forEach(function (field) {
            field.addEventListener("change", submit);
        });
        form.querySelectorAll("input[type=search], input[type=date]").forEach(function (field) {
            var initial = field.value;
            // Commit text/date edits on blur so keyboard date entry is not interrupted.
            field.addEventListener("blur", function () { if (field.value !== initial) submit(); });
            field.addEventListener("keydown", function (event) {
                if (event.key === "Enter") { event.preventDefault(); submit(); }
            });
        });
        form.addEventListener("submit", function () {
            Array.prototype.forEach.call(form.elements, function (el) {
                if (el.name && !el.value && el.type !== "checkbox") el.disabled = true;
            });
        });
        window.addEventListener("pageshow", function () {
            submitted = false;
            Array.prototype.forEach.call(form.elements, function (el) { el.disabled = false; });
        });
    }

    function init() {
        document.querySelectorAll("table[data-stats-sortable]").forEach(initSorting);
        document.querySelectorAll("input[data-stats-search]").forEach(initSearch);
        var form = document.querySelector(".stats-filters");
        if (form) initFilters(form);
        // BFCache can restore an input before its pending filter timer has run.
        window.addEventListener("pageshow", function () {
            document.querySelectorAll("input[data-stats-search]").forEach(function (input) {
                input.dispatchEvent(new Event("input"));
            });
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
