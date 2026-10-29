/* A pointer-complete adapter for native multi-selection. No selection is inferred. */
define(["jquery", "comm", "client", "./enums"], function ($, comm, client, enums) {
    "use strict";

    function supported(menu) {
        return Boolean(menu.flags & enums.menu_flag.MULTISELECT)
            && !(menu.flags & enums.menu_flag.QUIET_SELECT);
    }
    function update(menu) {
        var root = menu.elem, bar = root.children(".workflow-selection-tools");
        if (!supported(menu)) { bar.remove(); return; }
        if (!bar.length) {
            bar = $("<div class='workflow-selection-tools' role='group' aria-label='Pending selection'>"
                + "<span class='workflow-selection-summary' role='status' aria-live='polite' aria-atomic='true'></span>"
                + "<button type='button' class='workflow-button workflow-primary'>Confirm selection <kbd>Enter</kbd></button></div>");
            bar.find("button").on("click", function (event) {
                event.stopPropagation();
                if (!client.is_watching() && !this.disabled) comm.send_message("key", { keycode: 13 });
            }).on("keydown keypress", function (event) {
                if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            });
            var footer = root.children(".menu_more");
            if (footer.length) bar.insertBefore(footer);
            else root.append(bar);
        }
        var units = 0, stacks = 0, loaded = 0;
        $.each(menu.items, function (index, item) {
            if (!item || !item.elem || item.elem.hasClass("placeholder")) return;
            loaded++;
            var quantity = Math.max(0, Number(item.selected_qty) || 0);
            if (quantity) { stacks++; units += quantity; }
        });
        var complete = loaded === menu.total_items;
        var summary = units ? units + (units === 1 ? " item" : " items") + " in "
            + stacks + (stacks === 1 ? " stack selected" : " stacks selected") : "Nothing selected";
        if (!complete) summary = units ? summary + " in loaded entries" : "Selection still loading…";
        var status = bar.children(".workflow-selection-summary");
        if (status.text() !== summary) status.text(summary);
        bar.find("button").prop("disabled", client.is_watching() || complete && !units);
    }
    return { update: update };
});
