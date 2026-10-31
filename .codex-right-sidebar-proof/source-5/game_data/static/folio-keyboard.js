define(["jquery", "./menu-keyboard"], function ($, keyboard) {
    "use strict";
    function hint() {
        var tab = window.crawl_party.inspector_tab;
        $("#party_insp_key_help").text("1–4: hero · [ / ]: section · " + (tab === "equipment"
            ? "Item letter: inspect / manage" : tab === "abilities"
                ? "Power letter: select (repeat to cycle matches) · Enter: use" : "Tab: controls · Enter: activate"));
    }
    function handle(dialog, event, view) {
        if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || keyboard.typing(event.target)) return false;
        if (event.key === "[" || event.key === "]") {
            var index = view.sections.findIndex(function (section) { return section.key === window.crawl_party.inspector_tab; });
            view.selectTab(view.sections[(index + (event.key === "]" ? 1 : -1) + view.sections.length) % view.sections.length].key, true);
            hint(); return keyboard.consume(event);
        }
        var tab = window.crawl_party.inspector_tab;
        if (!["equipment", "abilities"].includes(tab) || event.key.length !== 1) return false;
        var entries = Array.from(dialog.querySelectorAll("[data-folio-key]")).filter(function (element) {
            return element.getAttribute("data-folio-key") === event.key && keyboard.available(element);
        });
        if (!entries.length) return false;
        if (!event.repeat) {
            if (tab === "equipment") keyboard.activate(entries[0]);
            else {
                var index = entries.indexOf(document.activeElement);
                if (index < 0 && document.activeElement.id === "party_spells_heading") {
                    var spell = entries.findIndex(function (entry) { return entry.getAttribute("data-power-kind") === "spell"; });
                    if (spell >= 0) index = spell - 1;
                }
                var entry = entries[(index + 1) % entries.length];
                entry.focus({ preventScroll: true }); entry.scrollIntoView({ block: "nearest" });
            }
        }
        return keyboard.consume(event);
    }
    return { handle: handle, hint: hint };
});
