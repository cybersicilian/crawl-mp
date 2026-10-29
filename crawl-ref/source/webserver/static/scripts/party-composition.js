/* Native starting values align across every planned hero without extra navigation. */
define(["starting-sheet", "character-guide", "character-stat-help"], function (sheet, guide, help) {
    "use strict";
    var grid, panel, tabs, selected = "heroes", pending = false;
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function refreshSnapshot(card, row) {
        var build = sheet.read(card), record = sheet.preview(build), ready = record.status === "ready";
        row.querySelectorAll("[data-compare-stat]").forEach(function (cell) {
            var key = cell.dataset.compareStat, value = ready ? record.snapshot[key] : undefined;
            cell.textContent = ready ? String(value) : record.status === "loading" ? "…" : "—";
            help.explain(cell, help.stats[key], value, build.name + " · " + (ready ? "Native starting value" : "Starting value unavailable"));
            cell.setAttribute("aria-label", build.name + " · " + help.stats[key].title + ": " + (ready ? value : record.status === "loading" ? "Preparing" : "Unavailable"));
        });
        var marker = row.querySelector(".party-compare-portrait"), portraitKey = record.key + "|" + record.status;
        if (marker.dataset.preview !== portraitKey) { marker.replaceChildren(sheet.portrait(build)); marker.dataset.preview = portraitKey; }
        row.setAttribute("aria-busy", String(record.status === "loading"));
        var status = row.querySelector(".party-compare-preview-status");
        status.textContent = record.status === "loading" ? "Preparing stats…" : ready ? "" : "Stats unavailable";
        row.querySelector(".party-compare-retry").hidden = record.status !== "error";
    }
    function refreshSnapshots() {
        if (selected !== "composition") return;
        grid.querySelectorAll(".party-slot-box").forEach(function (card) {
            var row = panel.querySelector("[data-compare-slot='" + card.dataset.slot + "']");
            if (row) refreshSnapshot(card, row);
        });
    }
    function render() {
        pending = false;
        if (selected !== "composition") return;
        var focused = document.activeElement, focusKey = panel.contains(focused) ? focused.dataset.compareFocus : null;
        var scroller = panel.querySelector(".party-comparison-scroll"), scrollLeft = scroller ? scroller.scrollLeft : 0;
        document.dispatchEvent(new CustomEvent("lobby-tooltip-dismiss")); panel.replaceChildren();
        var counts = {}, active = 0, cards = Array.from(grid.querySelectorAll(".party-slot-box"));
        cards.forEach(function (card) {
            var build = sheet.read(card);
            if (!build.active || !build.job) return;
            active++; counts[build.job.category] = (counts[build.job.category] || 0) + 1;
        });
        var header = el("header", "party-composition-header");
        header.append(el("h3", "", "Your party at a glance"), el("p", "", active + (active === 1 ? " active hero" : " active heroes") + " · " + Object.keys(counts).map(function (category) { return counts[category] + " " + category + (counts[category] === 1 ? "" : "s"); }).join(" · ")));
        panel.appendChild(header);
        var scroll = el("div", "party-comparison-scroll"); scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Compare starting party statistics");
        var table = el("table", "party-comparison-table"), head = el("thead"), labels = el("tr"), tbody = el("tbody");
        var heroLabel = el("th", "", "Hero"); heroLabel.scope = "col"; labels.appendChild(heroLabel);
        help.combat.forEach(function (key) {
            var label = help.explain(el("th", "", help.stats[key].label), help.stats[key]); label.scope = "col"; labels.appendChild(label);
        });
        var actionsLabel = el("th", "", "Plan"); actionsLabel.scope = "col"; labels.appendChild(actionsLabel); head.appendChild(labels); table.append(head, tbody);
        cards.forEach(function (card, index) {
            var build = sheet.read(card); if (!build.species || !build.job) return;
            var row = el("tr", build.active ? "" : "is-inactive"); row.dataset.compareSlot = card.dataset.slot;
            var hero = el("th", "party-compare-hero"); hero.scope = "row";
            var identity = el("div", "party-compare-identity"), marker = el("span", "party-compare-portrait"), copy = el("div");
            copy.append(el("small", "", "P" + (index + 1) + " · " + (build.active ? build.job.category : card.classList.contains("slot-state-open") ? "Open seat · Planned" : "Closed · Planned")),
                el("strong", "party-compare-name", build.name), el("span", "", build.species.name + " " + build.job.name));
            copy.appendChild(el("small", "party-compare-preview-status")); identity.append(marker, copy); hero.appendChild(identity); row.appendChild(hero);
            help.combat.forEach(function (key) {
                var cell = el("td", "party-compare-value"); cell.dataset.compareStat = key; cell.dataset.statLabel = help.stats[key].label; cell.dataset.compareFocus = card.dataset.slot + ":" + key; row.appendChild(cell);
            });
            var actions = el("td", "party-comparison-actions");
            var inspect = el("button", "party-starting-sheet", "Sheet"); inspect.type = "button"; inspect.setAttribute("aria-haspopup", "dialog"); inspect.setAttribute("aria-label", "Starting sheet for " + build.name);
            inspect.dataset.compareFocus = card.dataset.slot + ":sheet"; inspect.addEventListener("click", function () { guide.openSheet(card, inspect); });
            var edit = el("button", "party-edit-hero", "Edit"); edit.type = "button"; edit.setAttribute("aria-label", "Edit " + build.name); edit.dataset.compareFocus = card.dataset.slot + ":edit";
            edit.addEventListener("click", function () { show("heroes"); card.scrollIntoView({ block: "center" }); card.querySelector(".party-slot-name").focus({ preventScroll: true }); });
            var retry = el("button", "party-compare-retry", "Retry stats"); retry.type = "button";
            retry.addEventListener("click", function () { sheet.retry(sheet.read(card)); refreshSnapshot(card, row); });
            actions.append(inspect, edit, retry); row.appendChild(actions); tbody.appendChild(row); refreshSnapshot(card, row);
        });
        scroll.appendChild(table); panel.appendChild(scroll); scroll.scrollLeft = scrollLeft;
        panel.appendChild(el("p", "party-composition-note", "Native starting values, before temporary effects. Hover or focus a stat for its explanation. Open and closed seats show their planned builds."));
        if (focusKey) { var next = panel.querySelector("[data-compare-focus='" + focusKey + "']"); if (next) next.focus({ preventScroll: true }); }
    }
    function show(view, focus) {
        selected = view; grid.hidden = view !== "heroes"; panel.hidden = view !== "composition";
        tabs.querySelectorAll("button").forEach(function (button) {
            var active = button.dataset.partyView === view; button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
            if (active && focus) button.focus();
        });
        document.dispatchEvent(new CustomEvent("lobby-tooltip-dismiss")); if (view === "composition") render();
    }
    function init(root) {
        grid = root; if (!grid || document.getElementById("party_builder_views")) return;
        tabs = el("div", "party-builder-views"); tabs.id = "party_builder_views"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Party planning views");
        panel = el("section", "party-composition-view"); panel.id = "party_composition_view";
        [["heroes", "Edit heroes", grid], ["composition", "Party composition", panel]].forEach(function (item) {
            var button = el("button", "", item[1]); button.type = "button"; button.dataset.partyView = item[0]; button.id = "party_view_" + item[0];
            button.setAttribute("role", "tab"); button.setAttribute("aria-controls", item[2].id); item[2].setAttribute("role", "tabpanel"); item[2].setAttribute("aria-labelledby", button.id);
            button.addEventListener("click", function () { show(item[0]); });
            button.addEventListener("keydown", function (event) {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault(); show(event.key === "Home" ? "heroes" : event.key === "End" ? "composition" : selected === "heroes" ? "composition" : "heroes", true);
            }); tabs.appendChild(button);
        });
        var tools = el("div", "party-setup-tools"); tools.appendChild(tabs);
        grid.before(tools); grid.after(panel); show("heroes");
        new MutationObserver(function (changes) {
            if (pending || selected !== "composition" || changes.every(function (change) { return change.target.closest && change.target.closest(".party-slot-monogram"); })) return;
            pending = true; requestAnimationFrame(render);
        }).observe(grid, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "disabled", "aria-pressed"] });
        window.addEventListener("native-start-updated", refreshSnapshots);
    }
    return { init: init };
});
