/* Tip settings plus a journal of tips already met. Never sends a game command. */
define(["jquery", "tip-controls", "graphics-preferences", "./tutorial-tips"], function ($, controls, preferences, tips) {
    "use strict";
    var dialog, content, journal, sample, opener;
    function node(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }
    function close() {
        if (!dialog || !dialog.open) return;
        dialog.close();
        var target = opener && opener.isConnected && opener.getClientRects().length ? opener
            : document.getElementById("dock_session_menu") || document.getElementById("dungeon");
        if (target) target.focus({ preventScroll: true });
        opener = null;
    }
    function renderJournal() {
        if (!journal) return;
        var seen = tips.seen(), met = tips.catalog().filter(function (tip) { return seen[tip.id]; });
        var list = node("div", "tips-journal-list");
        met.forEach(function (tip) { list.appendChild(tips.card(tip, false)); });
        var reset = node("button", "graphics-retry", "Show every tip again"); reset.type = "button";
        reset.hidden = false; reset.disabled = !met.length;
        reset.addEventListener("click", function () { tips.resetSeen(); });
        journal.replaceChildren(node("h3", "", "Tip journal"), node("p", "graphics-help",
            met.length ? met.length + " of " + tips.catalog().length + " tips met. Read any of them again here."
                : "Tips you meet will collect here."), list, reset);
        applySize();
    }
    function applySize() {
        var size = preferences.snapshot().settings.tips_size;
        if (journal) journal.dataset.tipSize = size;
        if (sample) sample.dataset.tipSize = size;
    }
    function ensure() {
        if (dialog) return;
        dialog = node("dialog", "graphics-dialog tips-dialog"); dialog.id = "tips_settings_dialog";
        var top = node("div", "graphics-dialog-actions"), done = node("button", "", "Done · Esc"), root = node("section");
        done.type = "button"; done.addEventListener("click", close); top.appendChild(done);
        var settings = node("div", "tips-settings"); journal = node("div", "tips-journal"); sample = node("div", "tips-sample");
        sample.appendChild(tips.card({ id: "sample", title: "How tips look", body: "Press `o` or Explore to walk the floor automatically." }, false));
        root.append(settings, sample, journal); dialog.append(top, root); document.body.appendChild(dialog);
        content = controls.mount(settings, { jev: tips.jevAvailable() });
        dialog.setAttribute("aria-labelledby", content.titleId);
        dialog.addEventListener("cancel", function (event) { event.preventDefault(); close(); });
        ["keydown", "keypress", "keyup"].forEach(function (type) {
            dialog.addEventListener(type, function (event) { event.stopPropagation(); });
        });
    }
    $(document).on("tutorial_tips_changed.tipsDialog", renderJournal)
        .on("graphics_settings_changed.tipsDialog", applySize)
        .on("game_cleanup.tipsDialog game_preinit.tipsDialog", function () {
            if (!dialog) return;
            close(); content.destroy(); dialog.remove(); dialog = content = journal = sample = null;
        });
    return { open: function () {
        opener = document.activeElement; ensure(); renderJournal();
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
        dialog.showModal(); dialog.querySelector("button").focus(); preferences.refresh();
    } };
});
