/* Optional DOM collection filtering. Consumers supply IDs, entry selectors and labels. */
(function () {
    "use strict";
    document.querySelectorAll("[data-collection-filter]").forEach(function (input) {
        var list = document.getElementById(input.dataset.collectionFilter);
        if (!list) return;
        var status = document.getElementById(input.getAttribute("aria-describedby"));
        var empty = document.getElementById(input.dataset.collectionEmpty);
        var key = input.dataset.collectionStorage;
        var facet = document.querySelector('[data-collection-facet="' + list.id + '"]');
        if (key) {
            try { input.value = sessionStorage.getItem(key) || ""; }
            catch (error) { /* Filtering still works when storage is unavailable. */ }
            if (facet) {
                try { facet.value = sessionStorage.getItem(key + ":facet") || ""; }
                catch (error) { /* Optional. */ }
            }
        }
        function apply() {
            var terms = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
            var entries = list.querySelectorAll("[data-collection-entry]"), shown = 0;
            entries.forEach(function (entry) {
                var content = entry.textContent.toLocaleLowerCase();
                entry.hidden = (facet && facet.value && entry.dataset.collectionGroup !== facet.value) ||
                    !terms.every(function (term) { return content.includes(term); });
                if (!entry.hidden) shown++;
            });
            if (status) status.textContent = shown + " of " + entries.length + " records";
            if (empty) empty.hidden = shown > 0;
            if (key) {
                try {
                    sessionStorage.setItem(key, input.value);
                    if (facet) sessionStorage.setItem(key + ":facet", facet.value);
                }
                catch (error) { /* Persistence is optional. */ }
            }
        }
        input.addEventListener("input", apply);
        if (facet) {
            facet.closest("[data-collection-tools]").hidden = false;
            facet.addEventListener("change", apply);
        }
        input.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && input.value) { input.value = ""; apply(); }
        });
        window.addEventListener("pageshow", apply); apply();
    });
})();
