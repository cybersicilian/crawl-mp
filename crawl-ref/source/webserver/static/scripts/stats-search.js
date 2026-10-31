/* Progressive archive lookup. The GET form remains usable without scripting. */
(function () {
    "use strict";
    var form = document.querySelector(".stats-global-search");
    var input = document.getElementById("stats_lookup");
    var panel = document.getElementById("stats_lookup_results");
    if (!form || !input || !panel || !window.fetch || !window.AbortController) return;
    var list = panel.querySelector("ul");
    var status = panel.querySelector("[role=status]");
    var all = panel.querySelector(".stats-lookup-all");
    var timer, request, sequence = 0;

    function close() {
        sequence++;
        window.clearTimeout(timer);
        if (request) request.abort();
        panel.hidden = true;
    }

    function open(message) {
        panel.hidden = false;
        status.textContent = message;
    }

    function parameters() {
        var params = new URLSearchParams(new FormData(form));
        Array.from(params.keys()).forEach(function (key) { if (!params.get(key)) params.delete(key); });
        return params.toString();
    }

    async function lookup(ticket) {
        request = new AbortController();
        var query = parameters();
        all.href = "/stats/search?" + query;
        all.hidden = false;
        list.replaceChildren();
        open("Searching the archive…");
        try {
            var response = await fetch("/api/stats/search?" + query, { signal: request.signal });
            if (!response.ok) throw new Error("Search unavailable");
            var data = await response.json();
            if (ticket !== sequence) return;
            var found = data.search;
            var fragment = document.createDocumentFragment();
            found.results.slice(0, 10).forEach(function (entry) {
                var li = document.createElement("li");
                var link = document.createElement("a");
                var name = document.createElement("strong");
                var category = document.createElement("span");
                name.textContent = entry.name;
                category.textContent = entry.category;
                link.href = entry.href;
                link.append(name, category);
                li.appendChild(link);
                fragment.appendChild(li);
            });
            list.appendChild(fragment);
            open(found.total ? found.total + (found.total === 1 ? " match" : " matches") +
                (found.total > 10 ? " · showing the first 10" : "") : "No matches. Try a shorter name or another keyword.");
            all.hidden = found.total === 0;
        } catch (error) {
            if (error.name === "AbortError" || ticket !== sequence) return;
            open("Live search is unavailable. Press Search to open the results page.");
            all.hidden = true;
        }
    }

    input.addEventListener("input", function () {
        close();
        if (!input.value.trim()) return;
        var ticket = sequence;
        timer = window.setTimeout(function () { lookup(ticket); }, 180);
    });
    input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "ArrowDown" && !panel.hidden) {
            var first = list.querySelector("a");
            if (first) { event.preventDefault(); first.focus(); }
        }
    });
    panel.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { close(); input.focus(); return; }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        var links = Array.from(panel.querySelectorAll("a:not([hidden])"));
        var index = links.indexOf(document.activeElement);
        var next = event.key === "ArrowDown" ? index + 1 : index - 1;
        event.preventDefault();
        if (next < 0) input.focus();
        else if (links[next]) links[next].focus();
    });
    document.addEventListener("click", function (event) {
        if (!event.target.closest(".stats-lookup")) close();
    });
    document.addEventListener("focusin", function (event) {
        if (!event.target.closest(".stats-lookup")) close();
    });
})();
