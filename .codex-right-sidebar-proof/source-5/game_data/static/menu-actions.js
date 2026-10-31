/* Optional native action metadata: reusable controls, no gameplay rules. */
define(["jquery", "comm", "client"], function ($, comm, client) {
    "use strict";
    var pending = null;

    $(document).off("game_popup_changed.menuActions").on("game_popup_changed.menuActions", function () {
        var menu = $("#ui-stack > :last-child .workflow-action-menu").data("native-actions");
        if (menu) restore(menu);
    });

    function button(action, entry, name, menu) {
        return $("<button type='button' class='workflow-button'></button>")
            .text(action.label).attr("data-entry-action", action.id)
            .attr("aria-label", name ? action.label + " " + name : action.label)
            .prop("disabled", action.enabled === false || client.is_watching())
            .on("click", function (event) {
                event.stopPropagation();
                if (client.is_watching() || action.active === true) return;
                var buttons = menu.elem.find(".workflow-entry-actions button").toArray();
                pending = { entry: entry, action: action.id, index: buttons.indexOf(this),
                    scroll: menu.scroller && menu.scroller.scrollElement.scrollTop };
                comm.send_message("menu_action", { action: action.id, entry: entry });
            }).on("keydown keypress", function (event) {
                if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            });
    }
    function restore(menu) {
        requestAnimationFrame(function () {
            if (!pending || !menu.elem[0].isConnected) return;
            var wrapper = menu.elem.closest(".ui-popup");
            if (wrapper.length && wrapper[0] !== $("#ui-stack").children().last()[0]) return;
            var target = menu.elem.find("[data-entry-id='" + pending.entry + "'] button")
                .filter(function () { return this.dataset.entryAction === pending.action && !this.disabled; }).first();
            if (pending.entry === -1) target = menu.elem.find(".workflow-menu-actions button")
                .filter(function () { return this.dataset.entryAction === pending.action; }).first();
            if (!target.length) {
                var available = menu.elem.find(".workflow-entry-actions button:enabled");
                target = available.eq(Math.min(available.length - 1, Math.max(0, pending.index)));
            }
            if (!target.length) target = menu.elem.find(".workflow-menu-actions button[aria-pressed='true']");
            target[0]?.focus({ preventScroll: true });
            if (pending.scroll !== undefined && menu.scroller)
                menu.scroller.scrollElement.scrollTop = pending.scroll;
            pending = null;
        });
    }
    function title(menu) {
        var root = menu.elem;
        root.toggleClass("workflow-action-menu", Array.isArray(menu.menu_actions));
        if (!Array.isArray(menu.menu_actions)) return;
        root.data("native-actions", menu);
        if (menu.action_title) root.children(".menu_title").text(menu.action_title);
        var tools = root.children(".workflow-menu-actions");
        if (!tools.length) tools = $("<div class='workflow-menu-actions' role='group'></div>")
            .insertAfter(root.children(".menu_title"));
        else tools.insertAfter(root.children(".menu_title"));
        tools.attr("aria-label", menu.menu_actions_label || "Menu options");
        var focused = tools.find(":focus").attr("data-entry-action");
        tools.empty();
        menu.menu_actions.forEach(function (action) {
            button(action, -1, "", menu).attr("aria-pressed", String(Boolean(action.active))).appendTo(tools);
        });
        if (focused && !pending) pending = { entry: -1, action: focused };
        $.each(menu.items, function (index, entry) {
            if (entry && entry.elem) item(entry, entry.elem, menu);
        });
        restore(menu);
    }
    function item(item, element, menu) {
        if (!Array.isArray(item.entry_actions)) return;
        var focused = element.find(":focus").attr("data-entry-action");
        element.children(".workflow-entry-actions").remove();
        // Rows group real buttons; they must not be nested button roles.
        element.attr({ role: "group", tabindex: -1, "aria-label": item.action_name,
            "data-entry-id": item.entry_id });
        var area = $("<span class='workflow-entry-actions'></span>").appendTo(element);
        item.entry_actions.forEach(function (action) {
            button(action, item.entry_id, item.action_name, menu).appendTo(area);
        });
        if (focused && !pending) pending = { entry: item.entry_id, action: focused };
        restore(menu);
    }
    return { title: title, item: item };
});
