/* The native tip journal extends the shared Settings section while in a game. */
define(["jquery", "tip-controls", "graphics-preferences", "settings-dialog", "./tutorial-tips"],
function ($, controls, preferences, settings, tips) {
    "use strict";
    var nextId = 0;
    function node(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }
    function mount(root) {
        var id = "tipsJournal" + (++nextId);
        var content = controls.mount(root, { jev: tips.jevAvailable });
        var sample = node("div", "tips-sample"), journal = node("div", "tips-journal");
        sample.appendChild(tips.card({ id: "sample", title: "How tips look",
            body: "Press `o` or Explore to walk the floor automatically." }, false));
        root.append(sample, journal);
        function size() {
            sample.dataset.tipSize = journal.dataset.tipSize = preferences.snapshot().settings.tips_size;
        }
        function render() {
            var seen = tips.seen(), met = tips.catalog().filter(function (tip) { return seen[tip.id]; });
            var list = node("div", "tips-journal-list");
            met.forEach(function (tip) { list.appendChild(tips.card(tip, false)); });
            var reset = node("button", "graphics-retry", "Show every tip again"); reset.type = "button";
            reset.disabled = !met.length;
            reset.addEventListener("click", tips.resetSeen);
            journal.replaceChildren(node("h3", "", "Tip journal"), node("p", "graphics-help",
                met.length ? met.length + " of " + tips.catalog().length + " tips met. Read any of them again here."
                    : "Tips you meet will collect here."), list, reset);
            content.refresh(); size();
        }
        $(document).on("tutorial_tips_changed." + id, render).on("graphics_settings_changed." + id, size);
        render();
        return { titleId: content.titleId, total: content.total, customized: content.customized,
            filter: function (query, changedOnly, context) {
                var shown = content.filter(query, changedOnly);
                sample.hidden = journal.hidden = Boolean(query) || changedOnly || !context || !context.selected;
                return shown;
            },
            destroy: function () { $(document).off("." + id); content.destroy(); root.replaceChildren(); } };
    }
    function bind() { settings.bindAccountSection("Tutorial tips", mount); }
    $(document).on("game_cleanup.tipsJournal", function () { settings.bindAccountSection("Tutorial tips", null); });
    return { bind: bind, open: function () { bind(); settings.open({ category: "Tutorial tips" }); } };
});
