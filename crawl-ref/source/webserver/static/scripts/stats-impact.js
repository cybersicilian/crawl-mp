/* Progressive feature/interaction lookup. GET forms work without JavaScript. */
(function () {
    "use strict";
    var form = document.querySelector("[data-impact-search]");
    if (!form) return;
    var input = form.querySelector("input[type=search]");
    var results = document.getElementById("impact_matches");
    var timer, controller, generation = 0;

    function lookup() {
        var current = ++generation;
        if (controller) controller.abort();
        results.replaceChildren();
        if (!input.value.trim()) { results.hidden = true; return; }
        controller = new AbortController();
        var query = new URLSearchParams(new FormData(form));
        query.set("lookup", "1");
        results.hidden = false;
        results.textContent = "Searching features…";
        fetch("/api/stats/impacts?" + query.toString(), { signal: controller.signal })
            .then(function (response) {
                if (!response.ok) throw new Error("Lookup failed");
                return response.json();
            }).then(function (data) {
                if (current !== generation) return;
                results.replaceChildren();
                var matches = data.feature_matches || [];
                if (!matches.length) { results.textContent = "No matching features."; return; }
                var list = document.createElement("ul");
                matches.forEach(function (match) {
                    var item = document.createElement("li");
                    var link = document.createElement("a");
                    link.textContent = match.name;
                    link.href = match.href;
                    item.appendChild(link);
                    list.appendChild(item);
                });
                results.appendChild(list);
            }).catch(function (error) {
                if (current === generation && error.name !== "AbortError") {
                    results.textContent = "Live lookup is unavailable. Press Search to view results.";
                }
            });
    }
    input.addEventListener("input", function () {
        // Invalidate in-flight responses as soon as the query changes.
        generation++;
        if (controller) controller.abort();
        window.clearTimeout(timer);
        timer = window.setTimeout(lookup, 150);
    });
    input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            generation++;
            if (controller) controller.abort();
            window.clearTimeout(timer);
            results.hidden = true;
        }
    });
})();
