/* A compact roster routes actions through the existing authoritative controls. */
define(["starting-sheet", "character-guide", "class-art"], function (sheet, guide, classArt) {
    "use strict";
    var root, grid, editHero, queued = false, signature = "";
    function el(tag, cls, text) {
        var node = document.createElement(tag); node.className = cls || "";
        if (text !== undefined) node.textContent = String(text); return node;
    }
    function action(text, key, handler) {
        var button = el("button", "party-manager-action", text); button.type = "button";
        button.dataset.managerFocus = key; button.addEventListener("click", handler); return button;
    }
    function refreshPortraits() {
        grid.querySelectorAll(".party-slot-box").forEach(function (card) {
            var marker = root.querySelector('[data-manager-slot="' + card.dataset.slot + '"] .party-manager-portrait');
            if (!marker) return;
            var build = sheet.read(card);
            if (grid.dataset.savedExpedition === "true") {
                var savedKey = "saved:" + build.species.name + ":" + build.job.name;
                if (marker.dataset.preview === savedKey) return;
                marker.dataset.preview = savedKey; marker.replaceChildren();
                if (build.species.tile) { var image = el("img"); image.src = build.species.tile.src; image.alt = build.species.name; marker.appendChild(image); }
                marker.appendChild(classArt.render(build.job)); return;
            }
            var preview = sheet.preview(build), key = preview.key + "|" + preview.status;
            if (marker.dataset.preview === key) return;
            marker.dataset.preview = key; marker.replaceChildren(sheet.portrait(build), classArt.render(build.job));
        });
    }
    function render() {
        queued = false;
        var cards = Array.from(grid.querySelectorAll(".party-slot-box"));
        var next = JSON.stringify(cards.map(function (card) {
            var build = sheet.read(card);
            return [build.name, build.species && build.species.name, build.job && build.job.name,
                card.dataset.seatState, card.dataset.seatOwner, card.dataset.seatReady,
                card.dataset.seatActive, card.dataset.seatEditable, card.dataset.seatHost, card.dataset.savedStats, grid.dataset.savedExpedition];
        }));
        if (signature === next) { refreshPortraits(); return; } signature = next;
        var focus = root.contains(document.activeElement) ? document.activeElement.dataset.managerFocus : null;
        var previousSeats = root.querySelector(".party-unused-seats"), seatsOpen = previousSeats && previousSeats.open;
        var head = el("header", "party-manager-heading");
        var active = cards.filter(function (card) { return card.dataset.seatActive === "true"; });
        var ready = active.filter(function (card) { return card.dataset.seatReady === "true"; });
        head.append(el("h3", "", "Your company"), el("span", "", ready.length + "/" + active.length + " ready"));
        head.lastChild.setAttribute("role", "status");
        var table = el("table", "party-manager-table"), thead = el("thead"), labels = el("tr"), body = el("tbody");
        ["Hero", "Control", "Readiness", "Actions"].forEach(function (name) { var th = el("th", "", name); th.scope = "col"; labels.appendChild(th); });
        thead.appendChild(labels); table.append(thead, body);
        cards.forEach(function (card) {
            var build = sheet.read(card), slot = card.dataset.slot, state = card.dataset.seatState || "open";
            if (!build.species || !build.job || card.dataset.seatActive !== "true") return;
            var row = el("tr", card.dataset.seatActive === "true" ? "" : "is-inactive"); row.dataset.managerSlot = slot;
            var hero = el("th", "party-manager-hero"); hero.scope = "row";
            var icon = el("span", "party-manager-portrait");
            var copy = el("div"); copy.append(el("strong", "", "P" + (Number(slot) + 1) + " · " + build.name), el("small", "", build.species.name + " · " + build.job.name));
            var saved = grid.dataset.savedExpedition === "true", stats = JSON.parse(card.dataset.savedStats || "{}");
            if (saved) copy.appendChild(el("small", "", (stats.xl ? "Level " + stats.xl + " · " : "") + (stats.hp !== undefined ? "HP " + stats.hp + "/" + stats.hp_max + " · " : "") + (stats.place || "Saved checkpoint")));
            hero.append(icon, copy); var control = el("td", "party-manager-control");
            if (!saved && slot !== "0" && card.dataset.seatHost === "true" && !card.dataset.seatOwner) {
                var select = el("select"); select.setAttribute("aria-label", "Control for " + build.name); select.dataset.managerFocus = slot + ":control";
                [["companion", build.multiplayer ? "Solo companion (not joining)" : "Shared companion"], ["ai", "AI player"], ["open", "Reserve for friend"], ["closed", "Not joining"]].filter(function (item) { return item[0] !== "ai" || grid.dataset.aiAvailable === "true"; }).forEach(function (item) {
                    var option = el("option", "", item[1]); option.value = item[0]; select.appendChild(option);
                }); select.value = state;
                select.addEventListener("change", function () { var button = card.querySelector('[data-mode="' + select.value + '"]'); if (button && !button.disabled) button.click(); });
                control.appendChild(select);
            } else control.appendChild(el("span", "", card.dataset.seatOwner || ({ companion: "Shared companion", ai: "AI player", open: "Open for a friend", closed: "Not joining" })[state] || "Player"));
            var readiness = el("td", "party-manager-readiness");
            var source = card.querySelector(".party-slot-ready");
            var readyButton = action(source ? source.textContent : "Planned", slot + ":ready", function () { if (source && !source.disabled) source.click(); });
            readyButton.disabled = !source || source.disabled; readyButton.setAttribute("aria-label", build.name + ": " + readyButton.textContent);
            readyButton.dataset.ready = card.dataset.seatReady; readiness.appendChild(readyButton);
            var actions = el("td", "party-manager-actions");
            var edit = action("Edit", slot + ":edit", function () { editHero(card); }); edit.disabled = card.dataset.seatEditable === "false";
            edit.setAttribute("aria-label", "Edit " + build.name);
            var inspect = action("Sheet", slot + ":sheet", function () { guide.openSheet(card, inspect); });
            inspect.setAttribute("aria-label", "Starting sheet for " + build.name); inspect.setAttribute("aria-haspopup", "dialog");
            if (saved) actions.appendChild(el("span", "", "Saved hero")); else actions.append(edit, inspect);
            row.append(hero, control, readiness, actions); body.appendChild(row);
        });
        var scroll = el("div", "party-manager-scroll"); scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Manage party seats"); scroll.appendChild(table);
        root.replaceChildren(head, scroll);
        if (cards.some(function (card) { return card.dataset.seatHost === "true"; }) && grid.dataset.savedExpedition !== "true") {
            var seats = el("details", "party-unused-seats"), inactive = cards.filter(function (card) { return card.dataset.slot !== "0" && card.dataset.seatActive !== "true" && !card.dataset.seatOwner; });
            seats.open = !!seatsOpen;
            if (inactive.length) {
                seats.appendChild(el("summary", "", "Manage open seats (" + inactive.length + ")"));
                inactive.forEach(function (card) {
                    var label = el("label", "", "P" + (Number(card.dataset.slot) + 1) + " · Seat control "), select = el("select");
                    [["open", "Open for a friend"], ["closed", "Closed"], ["ai", "AI player"], ["companion", "Solo companion"]].filter(function (item) { return item[0] !== "ai" || grid.dataset.aiAvailable === "true"; }).forEach(function (item) { var option = el("option", "", item[1]); option.value = item[0]; select.appendChild(option); });
                    select.value = card.dataset.seatState; select.dataset.managerFocus = card.dataset.slot + ":control";
                    select.addEventListener("change", function () { card.querySelector('[data-mode="' + select.value + '"]').click(); }); label.appendChild(select); seats.appendChild(label);
                }); root.appendChild(seats);
            }
        }
        refreshPortraits();
        if (focus) { var target = root.querySelector('[data-manager-focus="' + focus + '"]'); if (target) target.focus({ preventScroll: true }); }
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(render); } }
    function init(cards, edit) {
        grid = cards; editHero = edit; if (root) return;
        root = el("section", "party-manager"); grid.before(root);
        new MutationObserver(schedule).observe(grid, { subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ["class", "disabled", "data-seat-state", "data-seat-owner", "data-seat-ready", "data-seat-active", "data-seat-editable", "data-saved-stats", "data-saved-expedition"] });
        window.addEventListener("native-start-updated", schedule); schedule();
    }
    return { init: init };
});
