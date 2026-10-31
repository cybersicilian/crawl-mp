define(["tooltip-layout"], function (layout) {
    "use strict";
    var regions = "#right_column, #party_turn_banner, #dcss_quick_dock, #message_pane, #chat, "
        + ".party-insp-header, .party-insp-hero-bar, .party-insp-tab-bar";

    function place(card, source, parents) {
        var anchor = source.getBoundingClientRect ? source.getBoundingClientRect() : source;
        var surfaces = Array.from(document.querySelectorAll(regions));
        var dialog = source.closest && source.closest("dialog[open]");
        if (dialog) surfaces = surfaces.concat(Array.from(dialog.querySelectorAll("button, input, select, [role='tab']"))
            .filter(function (node) { return !node.closest("#dcss_rich_tooltip, .dcss-nested-tip") && !source.contains(node); }));
        var panel = source.closest && source.closest(regions + ", .party-power-list, .party-equipment-list");
        var avoid = surfaces.map(function (node) { return node.getBoundingClientRect(); });
        (parents || []).forEach(function (node) { avoid.push(node.getBoundingClientRect()); });
        return layout.place(card, anchor, {
            edge: parents && parents.length ? parents[parents.length - 1].getBoundingClientRect()
                : panel && panel.getBoundingClientRect(),
            avoid: avoid
        });
    }
    return { place: place, overlap: layout.overlap };
});
