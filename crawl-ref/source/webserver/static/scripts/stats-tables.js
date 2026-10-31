/* Optional collection views: the complete server-rendered table is the fallback. */
(function () {
    "use strict";
    document.body.classList.add("stats-enhanced");
    var sectionSelect = document.querySelector("[data-stats-section-select]");
    if (sectionSelect) sectionSelect.addEventListener("change", function () {
        window.location.assign(sectionSelect.value);
    });
    document.querySelectorAll("[data-table-views]").forEach(function (section) {
        var tools = section.querySelector("[data-table-tools]");
        var view = tools.querySelector("[data-table-view]");
        var records = tools.querySelector("[data-table-records]");
        var storageKey = "stats-view:" + window.location.pathname + window.location.search + ":" + section.id;
        var saved = {};
        try { saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}"); } catch (_) { /* Optional. */ }
        if (!saved || typeof saved !== "object") saved = {};
        if (saved.view && Array.from(view.options).some(function (option) { return option.value === saved.view; }))
            view.value = saved.view;
        if (records) records.checked = saved.records === true;
        function apply() {
            var stage = document.querySelector("[data-stage-conditional]");
            if (stage) stage.hidden = !Array.from(document.querySelectorAll("[data-table-view]")).some(function (select) {
                return select.value === "analysis";
            });
            section.querySelectorAll("[data-column-view]").forEach(function (cell) {
                cell.hidden = view.value !== cell.dataset.columnView;
            });
            var search = section.querySelector("[data-stats-search]");
            if (search) search.dispatchEvent(new Event("input"));
            else section.querySelectorAll("tbody tr").forEach(function (row) {
                row.hidden = !!records && records.checked && row.dataset.hasRecord !== "true";
            });
            try { sessionStorage.setItem(storageKey, JSON.stringify({view: view.value, records: !!records && records.checked})); }
            catch (_) { /* Private browsing. */ }
        }
        view.addEventListener("change", apply);
        if (records) records.addEventListener("change", apply);
        tools.hidden = false;
        apply();
        window.addEventListener("pageshow", apply);
    });
})();
