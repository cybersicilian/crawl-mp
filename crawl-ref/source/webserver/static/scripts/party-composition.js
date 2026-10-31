/* Party composition: always-visible squad summary beside the seat editor.
 * Role and damage coverage come from catalog data; starting values are native. */
define(["starting-sheet", "character-guide", "character-stat-help", "hero-roles", "party-coverage", "party-roster-strip", "party-manager"],
function (sheet, guide, help, roles, coverage, strip, manager) {
    "use strict";
    var grid, panel, pending = false;
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function heroes() {
        return Array.from(grid.querySelectorAll(".party-slot-box")).map(function (card) {
            var build = sheet.read(card), record = build.species && build.job ? sheet.preview(build) : { status: "unavailable", snapshot: null };
            return { card: card, build: build, name: build.name, job: build.job, species: build.species, active: build.active,
                status: record.status, snapshot: record.status === "ready" ? record.snapshot : null };
        });
    }
    function refreshSnapshot(card, row) {
        var build = sheet.read(card), record = sheet.preview(build), ready = record.status === "ready";
        row.querySelectorAll("[data-compare-stat]").forEach(function (cell) {
            var key = cell.dataset.compareStat, value = ready ? record.snapshot[key] : undefined;
            cell.textContent = ready ? String(value) : record.status === "loading" ? "…" : "—";
            help.explain(cell, help.stats[key], value, build.name + " · " + (ready ? "Native starting value" : "Starting value unavailable"));
            cell.setAttribute("aria-label", build.name + " · " + help.stats[key].title + ": " + (ready ? value : record.status === "loading" ? "Loading" : "Unavailable"));
        });
        var marker = row.querySelector(".party-compare-portrait"), portraitKey = record.key + "|" + record.status;
        if (marker.dataset.preview !== portraitKey) { marker.replaceChildren(sheet.portrait(build)); marker.dataset.preview = portraitKey; }
        row.setAttribute("aria-busy", String(record.status === "loading"));
        var status = row.querySelector(".party-compare-preview-status");
        status.textContent = record.status === "loading" ? "Loading stats…" : ready ? "" : "Stats unavailable";
        row.querySelector(".party-compare-retry").hidden = record.status !== "error";
    }
    function chips(parent, label, entries, kind) {
        var group = el("div", "party-coverage-group"); group.setAttribute("role", "group"); group.setAttribute("aria-label", label);
        group.appendChild(el("span", "party-coverage-label", label));
        var list = el("div", "party-coverage-chips");
        entries.forEach(function (entry) {
            var chip = el("span", "party-coverage-chip" + (entry.count ? " is-covered" : " is-missing"));
            chip.dataset.kind = kind; chip.dataset.key = entry.key;
            chip.append(el("strong", "", entry.count), el("span", "", entry.label));
            chip.setAttribute("aria-label", entry.count + " " + entry.label + (entry.count ? "" : ", none"));
            if (entry.summary) { chip.dataset.tipTitle = entry.label; chip.dataset.tipBody = entry.summary; chip.tabIndex = 0; }
            list.appendChild(chip);
        });
        group.appendChild(list); parent.appendChild(group);
    }
    function summary(parent, list) {
        var report = coverage.summarize(list);
        var header = el("header", "party-composition-header");
        header.append(el("h3", "", "Party at a glance"),
            el("p", "", report.active + (report.active === 1 ? " active hero" : " active heroes") + " · roles and damage types from the chosen backgrounds"));
        parent.appendChild(header);
        chips(parent, "Role coverage", roles.ORDER.map(function (key) {
            return { key: key, label: roles.ROLES[key].label, count: report.roles[key], summary: roles.ROLES[key].summary };
        }), "role");
        chips(parent, "Damage types", Object.keys(roles.DAMAGE).map(function (key) {
            return { key: key, label: roles.DAMAGE[key], count: report.damage[key] };
        }), "damage");
        var warnings = el("ul", "party-composition-warnings"); warnings.setAttribute("aria-label", "Party warnings");
        if (!report.warnings.length) warnings.appendChild(el("li", "is-good", "Balanced squad. Nothing stands out."));
        report.warnings.forEach(function (warning) {
            var item = el("li", "is-" + warning.level, warning.text); item.dataset.warning = warning.key; warnings.appendChild(item);
        });
        parent.appendChild(warnings);
    }
    function render() {
        pending = false; if (!panel) return;
        var focused = document.activeElement, focusKey = panel.contains(focused) ? focused.dataset.compareFocus : null;
        var scroller = panel.querySelector(".party-comparison-scroll"), scrollLeft = scroller ? scroller.scrollLeft : 0;
        var list = heroes();
        panel.replaceChildren();
        summary(panel, list);
        var scroll = el("div", "party-comparison-scroll"); scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Compare starting party statistics");
        var table = el("table", "party-comparison-table"), head = el("thead"), labels = el("tr"), tbody = el("tbody");
        var heroLabel = el("th", "", "Hero"); heroLabel.scope = "col"; labels.appendChild(heroLabel);
        help.combat.forEach(function (key) {
            var label = help.explain(el("th", "", help.stats[key].label), help.stats[key]); label.scope = "col"; labels.appendChild(label);
        });
        var actionsLabel = el("th", "", "Plan"); actionsLabel.scope = "col"; labels.appendChild(actionsLabel); head.appendChild(labels); table.append(head, tbody);
        list.forEach(function (hero, index) {
            // Only the heroes joining this party are compared; planned open or closed seats stay out.
            var card = hero.card, build = hero.build; if (!build.species || !build.job || !build.active) return;
            var role = roles.roleForBackground(build.job);
            var row = el("tr", build.active ? "" : "is-inactive"); row.dataset.compareSlot = card.dataset.slot;
            var heroCell = el("th", "party-compare-hero"); heroCell.scope = "row";
            var identity = el("div", "party-compare-identity"), marker = el("span", "party-compare-portrait"), copy = el("div");
            var badge = el("span", roles.badgeClasses(role.key), role.label); badge.dataset.role = role.key;
            copy.append(el("small", "", "P" + (index + 1) + " · " + (build.active ? build.job.category : card.classList.contains("slot-state-open") ? "Open seat · Planned" : "Closed · Planned")),
                el("strong", "party-compare-name", build.name), el("span", "", build.species.name + " " + build.job.name), badge);
            copy.appendChild(el("small", "party-compare-preview-status")); identity.append(marker, copy); heroCell.appendChild(identity); row.appendChild(heroCell);
            help.combat.forEach(function (key) {
                var cell = el("td", "party-compare-value"); cell.dataset.compareStat = key; cell.dataset.statLabel = help.stats[key].label; cell.dataset.compareFocus = card.dataset.slot + ":" + key; row.appendChild(cell);
            });
            var actions = el("td", "party-comparison-actions");
            var inspect = el("button", "party-starting-sheet", "Sheet"); inspect.type = "button"; inspect.setAttribute("aria-haspopup", "dialog"); inspect.setAttribute("aria-label", "Starting sheet for " + build.name);
            inspect.dataset.compareFocus = card.dataset.slot + ":sheet"; inspect.addEventListener("click", function () { guide.openSheet(card, inspect); });
            var edit = el("button", "party-edit-hero", "Edit"); edit.type = "button"; edit.setAttribute("aria-label", "Edit " + build.name); edit.dataset.compareFocus = card.dataset.slot + ":edit";
            edit.disabled = card.dataset.seatEditable === "false";
            edit.addEventListener("click", function () {
                strip.select(Number(card.dataset.slot));
                var name = card.querySelector(".party-slot-name"); if (name) name.focus();
            });
            var retry = el("button", "party-compare-retry", "Retry stats"); retry.type = "button";
            retry.addEventListener("click", function () { sheet.retry(sheet.read(card)); refreshSnapshot(card, row); });
            actions.append(inspect, edit, retry); row.appendChild(actions); tbody.appendChild(row); refreshSnapshot(card, row);
        });
        scroll.appendChild(table); panel.appendChild(scroll); scroll.scrollLeft = scrollLeft;
        panel.appendChild(el("p", "party-composition-note", "Native starting values for the heroes joining this party. Hover or focus a stat for its explanation."));
        if (focusKey) { var next = panel.querySelector("[data-compare-focus='" + focusKey + "']"); if (next) next.focus({ preventScroll: true }); }
    }
    function schedule() { if (pending) return; pending = true; requestAnimationFrame(render); }
    function init(root) {
        grid = root; if (!grid || (panel && panel.isConnected)) return;
        panel = document.getElementById("party_composition_view");
        if (!panel) { panel = el("section", "party-composition-view"); panel.id = "party_composition_view"; grid.after(panel); }
        panel.classList.add("party-composition-view"); panel.setAttribute("aria-label", "Party composition");
        if (!panel.hasAttribute("role")) panel.setAttribute("role", "region");
        panel.hidden = false;
        // The company roster (seat control, readiness, saved-hero facts) routes edits to the seat editor.
        manager.init(grid, function (card) {
            strip.select(Number(card.dataset.slot));
            var name = card.querySelector(".party-slot-name"); if (name) name.focus({ preventScroll: true });
        });
        new MutationObserver(function (changes) {
            if (changes.every(function (change) { return change.target.closest && change.target.closest(".party-slot-monogram"); })) return;
            schedule();
        }).observe(grid, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "disabled", "aria-pressed", "data-seat-kind", "data-starting-seed"] });
        grid.addEventListener("change", schedule);
        grid.addEventListener("input", function (event) { if (event.target.matches(".party-slot-name")) schedule(); });
        window.addEventListener("native-start-updated", schedule);
        render();
    }
    return { init: init, refresh: schedule };
});
