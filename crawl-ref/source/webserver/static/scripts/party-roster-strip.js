/* Roster strip: the four seats as tabs. Selecting a seat focuses its editor card.
 * Every seat card stays in the DOM so room updates, tests and handlers keep working. */
define(["starting-sheet", "hero-roles"], function (sheet, roles) {
    "use strict";
    var grid, strip, tabs = [], active = 0, pending = false, ownSeat = null, layoutToggle;
    var KIND = { host: "Host", you: "You", friend: "Friend", open: "Open seat", ai: "AI · Jev",
        companion: "Companion", closed: "Closed", player: "Friend" };
    var STORAGE = "pebble.partySeatLayout";
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function cards() { return Array.from(grid.querySelectorAll(".party-slot-box")); }
    function card(slot) { return grid.querySelector(".party-slot-box[data-slot='" + slot + "']"); }
    function seatKind(node) {
        if (node.dataset.seatKind) return node.dataset.seatKind;
        if (node.classList.contains("slot-state-closed")) return "closed";
        if (node.classList.contains("slot-state-open")) return node.dataset.slot === "0" ? "host" : "open";
        if (node.classList.contains("slot-state-ai")) return "ai";
        if (node.classList.contains("slot-state-companion")) return "companion";
        return node.dataset.slot === "0" ? "host" : "friend";
    }
    function text(node, value) { if (node.textContent !== value) node.textContent = value; }
    function refreshTab(node, tab) {
        var build = sheet.read(node), preview = sheet.preview(build), kind = seatKind(node);
        var role = roles.roleForBackground(build.job), ready = node.querySelector(".party-slot-ready");
        var portrait = tab.querySelector(".party-seat-portrait"), key = preview.key + "|" + preview.status;
        if (build.species && portrait.dataset.preview !== key) {
            portrait.dataset.preview = key; portrait.replaceChildren(sheet.portrait(build));
        }
        text(tab.querySelector(".party-seat-name"), build.name);
        text(tab.querySelector(".party-seat-build"), build.species && build.job ? build.species.name + " " + build.job.name : "Choose a build");
        var badge = tab.querySelector(".party-role-badge");
        badge.className = roles.badgeClasses(role.key); badge.dataset.role = role.key; text(badge, role.label);
        text(tab.querySelector(".party-seat-kind"), KIND[kind] || kind);
        var readyText = ready ? ready.textContent.trim() : "";
        var readyNode = tab.querySelector(".party-seat-ready");
        text(readyNode, readyText); readyNode.dataset.state = ready && ready.classList.contains("waiting") ? "waiting"
            : ready && ready.classList.contains("closed") ? "inactive" : "ready";
        tab.dataset.seatKind = kind;
        tab.classList.toggle("is-inactive", !build.active);
        tab.setAttribute("aria-label", "Seat " + (Number(node.dataset.slot) + 1) + ": " + build.name + ", "
            + (build.species && build.job ? build.species.name + " " + build.job.name : "no build") + ", " + role.label + ", "
            + (KIND[kind] || kind) + (readyText ? ", " + readyText : ""));
    }
    function update() {
        pending = false;
        cards().forEach(function (node) { var tab = tabs[Number(node.dataset.slot)]; if (tab) refreshTab(node, tab); });
        var mine = cards().find(function (node) { return node.dataset.seatKind === "you"; });
        var mineSlot = mine ? Number(mine.dataset.slot) : 0;
        if (mineSlot !== ownSeat) { ownSeat = mineSlot; if (!grid.contains(document.activeElement)) select(mineSlot); }
    }
    function schedule() { if (pending) return; pending = true; requestAnimationFrame(update); }
    function select(slot, focus) {
        slot = Math.max(0, Math.min(tabs.length - 1, Number(slot) || 0)); active = slot;
        grid.dataset.activeSeat = String(slot);
        cards().forEach(function (node) { node.classList.toggle("is-active-seat", Number(node.dataset.slot) === slot); });
        tabs.forEach(function (tab, index) {
            var current = index === slot;
            tab.setAttribute("aria-selected", String(current)); tab.tabIndex = current ? 0 : -1;
            if (current && focus) tab.focus();
        });
        document.dispatchEvent(new CustomEvent("lobby-tooltip-dismiss"));
    }
    function layout(mode, persist) {
        grid.dataset.seatLayout = mode === "all" ? "all" : "focus";
        if (layoutToggle) {
            layoutToggle.setAttribute("aria-pressed", String(mode === "all"));
            layoutToggle.textContent = mode === "all" ? "Focus one seat" : "Show all seats";
        }
        if (persist) { try { localStorage.setItem(STORAGE, grid.dataset.seatLayout); } catch (error) { /* Optional. */ } }
    }
    function tab(node) {
        var slot = Number(node.dataset.slot);
        var button = el("button", "party-seat-tab slot-p" + slot); button.type = "button"; button.dataset.seat = String(slot);
        button.id = "party_seat_tab_" + slot; button.setAttribute("role", "tab");
        if (!node.id) node.id = "party_seat_editor_" + slot;
        button.setAttribute("aria-controls", node.id);
        node.setAttribute("aria-labelledby", button.id);
        button.appendChild(el("span", "party-seat-portrait"));
        var copy = el("span", "party-seat-copy");
        copy.append(el("strong", "party-seat-name"), el("span", "party-seat-build"), el("span", roles.badgeClasses("unknown"), "Hero"));
        var meta = el("span", "party-seat-meta");
        meta.append(el("small", "party-seat-kind"), el("small", "party-seat-ready"));
        copy.appendChild(meta); button.appendChild(copy);
        button.addEventListener("click", function () { select(slot); });
        button.addEventListener("keydown", function (event) {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            var next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                : (active + (event.key === "ArrowLeft" ? tabs.length - 1 : 1)) % tabs.length;
            select(next, true);
        });
        return button;
    }
    function init(root) {
        grid = root; if (!grid || document.getElementById("party_roster_strip")) return;
        strip = el("div", "party-roster-strip"); strip.id = "party_roster_strip";
        var list = el("div", "party-roster-tabs"); list.setAttribute("role", "tablist"); list.setAttribute("aria-label", "Party seats");
        tabs = cards().map(function (node) { var button = tab(node); list.appendChild(button); return button; });
        strip.appendChild(list);
        layoutToggle = el("button", "party-seat-layout-toggle"); layoutToggle.type = "button"; layoutToggle.id = "party_seat_layout_toggle";
        layoutToggle.setAttribute("aria-controls", grid.id);
        layoutToggle.addEventListener("click", function () { layout(grid.dataset.seatLayout === "all" ? "focus" : "all", true); });
        strip.appendChild(layoutToggle);
        grid.before(strip);
        grid.setAttribute("role", "presentation");
        cards().forEach(function (node) { node.setAttribute("role", "tabpanel"); });
        var stored = "focus";
        try { stored = localStorage.getItem(STORAGE) || "focus"; } catch (error) { /* Optional. */ }
        layout(stored, false); select(0); update();
        new MutationObserver(function (changes) {
            if (changes.every(function (change) { return change.target.closest && change.target.closest(".party-slot-monogram"); })) return;
            schedule();
        }).observe(grid, { subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ["class", "disabled", "aria-pressed", "data-seat-kind", "data-starting-seed"] });
        grid.addEventListener("input", schedule);
        grid.addEventListener("change", schedule);
        grid.addEventListener("focusin", function (event) {
            var node = event.target.closest(".party-slot-box");
            if (node && grid.dataset.seatLayout === "all" && Number(node.dataset.slot) !== active) select(Number(node.dataset.slot));
        });
        window.addEventListener("native-start-updated", schedule);
    }
    return { init: init, select: select, active: function () { return active; }, refresh: schedule };
});
