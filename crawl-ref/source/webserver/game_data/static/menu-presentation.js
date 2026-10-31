define(["jquery", "comm", "client", "./util", "./menu-keyboard", "./menu-columns", "./menu-search", "./enums", "./menu-actions"], function ($, comm, client, util, keyboard, columns, search, enums, entryActions) {
    "use strict";

    function button(label, action) {
        return $("<button type='button' class='workflow-button'></button>").text(label)
            .on("click", function (event) { event.stopPropagation(); action(); })
            .on("keydown keypress", function (event) {
                if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            });
    }
    function title(menu) {
        var root = menu.elem, title = root.find(".menu_title");
        columns.title(menu);
        search.title(menu);
        entryActions.title(menu);
        caption(menu);
        root.toggleClass("workflow-inventory", Array.isArray(menu.categories));
        if (!Array.isArray(menu.categories)) return;
        title.text(title.text().replace(/\s*\(Left\/Right\/Tab.*$/, ""));
        var tabs = root.children(".workflow-categories");
        if (!tabs.length) tabs = $("<div class='workflow-categories' role='tablist' aria-label='Inventory categories'></div>");
        var focused = tabs.find(":focus").length > 0;
        var anchor = root.children(".workflow-menu-caption").last();
        if (!anchor.length) anchor = title;
        if (tabs.prev()[0] !== anchor[0]) tabs.insertAfter(anchor);
        tabs.empty();
        menu.categories.forEach(function (category) {
            var selected = category.id === menu.active_category;
            button(category.label + " " + category.count, function () {
                if (!selected && !client.is_watching()) comm.send_message("menu_category", { category: category.id });
            }).attr({ role: "tab", "aria-selected": String(selected), tabindex: selected ? 0 : -1,
                "data-category": category.id }).appendTo(tabs);
        });
        if (focused) tabs.find("[aria-selected='true']").trigger("focus");
        tabs.off("keydown.categories").on("keydown.categories", "button", function (event) {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            var index = Number(this.getAttribute("data-category"));
            var next = event.key === "Home" ? 0 : event.key === "End" ? menu.categories.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + menu.categories.length) % menu.categories.length;
            comm.send_message("menu_category", { category: next });
        });
        root.children(".workflow-empty").remove();
        if (!menu.total_items) $("<p class='workflow-empty' role='status'>Nothing in this category.</p>").insertAfter(tabs);
    }
    function caption(menu) {
        var root = menu.elem, heading = root.children(".menu_title");
        var text = heading.text().replace(/\s*\(Left\/Right\/Tab[^)]*\)/, "");
        var match = text.match(/^(.*?)\s+(\d+\/\d+ gear slots)\s*(\(_ for help\))?$/);
        var area = root.children(".workflow-menu-caption");
        if (!match) { area.remove(); return; }
        heading.text(match[1].replace(/:\s*$/, ""));
        if (!area.length) area = $("<div class='workflow-menu-caption'></div>").insertAfter(heading);
        var signature = match[2] + Boolean(match[3]);
        if (area.data("caption") === signature) return;
        var focused = area.find(":focus").length > 0;
        area.data("caption", signature);
        area.empty().append($("<span></span>").text(match[2]));
        if (match[3]) button("Help", function () {
            if (!client.is_watching()) comm.send_message("key", { keycode: 95 });
        }).append("<kbd aria-hidden='true'>_</kbd>").attr("aria-label", "Inventory help")
            .prop("disabled", client.is_watching()).appendTo(area);
        if (focused) area.find("button:enabled").trigger("focus");
    }
    function item(item, element, menu) {
        // Removing tabindex from a focused row drops focus during native updates.
        element.removeAttr("aria-keyshortcuts data-menu-key aria-pressed");
        element.off("keydown.workflowItem");
        if (item.kind) element.attr("data-kind", item.kind);
        if (item.level < 2 && menu.categories) {
            element.text(element.text().replace(/\s*\(go to first with.*$/, ""));
        } else if (item.label !== undefined && menu.tag !== "shop") {
            element.contents().filter(function () { return this.nodeName !== "CANVAS"; }).remove();
            var chips = states(item);
            element.append($("<span class='workflow-item-name'></span>").text(chips.label));
            chips.states.forEach(function (state) {
                element.append($("<span class='workflow-state'></span>").attr("data-state", state.key).text(state.label));
            });
            if (item.letter) element.append($("<kbd class='workflow-key'></kbd>").text(item.letter));
        }
        if (item.level === 2 && element.hasClass("selectable")) {
            element.attr({ role: "button", tabindex: 0,
                "data-row-hint": menu.flags & enums.menu_flag.MULTISELECT ? "Toggle" : "Select" });
            var key = item.letter || (item.hotkeys || []).map(function (code) {
                return code === 27 ? "Esc" : code === 13 ? "Enter" : code === 32 ? "Space"
                    : code >= 33 && code <= 126 ? String.fromCharCode(code) : "";
            }).find(Boolean);
            if (key) {
                element.attr("data-menu-key", key);
                if (!element.find("kbd").length) {
                    var copy = $("<span class='workflow-entry-copy'></span>");
                    copy.append(element.contents().filter(function () { return this.nodeName !== "CANVAS"; }));
                    columns.trimPrefix(copy[0], key);
                    element.append(copy, $("<kbd class='workflow-key'></kbd>").text(key));
                }
            }
            element.off("keydown.workflowItem").on("keydown.workflowItem", function (event) {
                if (keyboard.handle(menu.elem[0], event.originalEvent || event))
                    event.preventDefault();
            });
        }
        else element.removeAttr("role tabindex");
        columns.item(item, element, menu);
        search.item(item, element, menu);
        entryActions.item(item, element, menu);
        selection(item, element, menu);
    }
    // Status chips come from the native equipped flag and the item's own
    // name suffixes; nothing is inferred beyond what the engine printed.
    function states(item) {
        var label = String(item.label), result = [];
        if (item.equipped) result.push({ key: "equipped", label: "Equipped" });
        var quivered = label.match(/\s*\(quivered\)\s*$/);
        if (quivered) { label = label.slice(0, quivered.index); result.push({ key: "quivered", label: "Quivered" }); }
        if (/\bcursed\b/i.test(label)) result.push({ key: "cursed", label: "Cursed" });
        if (/\bunidentified\b|\{unknown\}/i.test(label)) result.push({ key: "unidentified", label: "Unidentified" });
        return { label: label, states: result };
    }
    function selection(item, element, menu) {
        var multiple = element.hasClass("selectable")
            && (menu.flags & enums.menu_flag.MULTISELECT)
            && !(menu.flags & enums.menu_flag.QUIET_SELECT);
        var quantity = Number(item.selected_qty) || 0;
        var selected = multiple && quantity > 0;
        element.toggleClass("workflow-selected", Boolean(selected));
        if (!multiple) return;
        element.attr("aria-pressed", String(Boolean(selected)));
        element.prepend($("<span class='workflow-selection-mark' aria-hidden='true'></span>")
            .text(selected ? "✓" : ""));
        if (selected) {
            var label = item.q > quantity ? quantity + " of " + item.q + " selected" : "Selected";
            var state = $("<span class='workflow-selection-state'></span>").text(label);
            var key = element.children("kbd.workflow-key");
            if (key.length) state.insertBefore(key);
            else element.append(state);
        }
    }
    function actions(root, data) {
        if (!Array.isArray(data.action_buttons)) return false;
        var area = root.find(".actions").empty();
        data.action_buttons.forEach(function (action) {
            if (typeof action.key !== "string" || action.key.length !== 1) return;
            $("<button type='button' class='workflow-button'></button>")
                .attr("data-hotkey", action.key).text(action.label + " ")
                .append($("<kbd></kbd>").text(action.key))
                .on("keydown keypress", function (event) {
                    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                }).appendTo(area);
        });
        return true;
    }
    function advanced(root) {
        var paragraphs = root.find(".body pre, .body .rich-text > p").filter(function () {
            return /^(Stash search prefixes:|Menu\/colouring prefixes:)/.test(this.textContent.trim());
        });
        if (!paragraphs.length) return;
        var details = $("<details class='workflow-advanced'><summary>Advanced item details</summary></details>");
        details.append(paragraphs.detach()).appendTo(root.find(".body"));
    }
    function tabs(root, labels, select) {
        if (labels.length < 2) return;
        var nav = $("<nav class='workflow-pane-tabs' role='tablist' aria-label='Information sections'></nav>");
        labels.forEach(function (label, index) {
            button(label, function () { select(index); updateTabs(root); })
                .attr({ role: "tab", "data-pane-index": index }).appendTo(nav);
        });
        nav.on("keydown", "button", function (event) {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            var current = Number(this.getAttribute("data-pane-index"));
            var next = event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1
                : (current + (event.key === "ArrowRight" ? 1 : -1) + labels.length) % labels.length;
            nav.children().eq(next).trigger("click").trigger("focus");
        });
        nav.insertAfter(root.children(".header"));
        root.on("keydown.workflowPanes", function () { updateTabs(root); });
        updateTabs(root);
    }
    function updateTabs(root) {
        var panes = root.children(".body.paneset").children(".pane");
        var index = panes.index(panes.filter(".current"));
        root.find(".workflow-pane-tabs button").each(function (i) {
            $(this).attr({ "aria-selected": String(i === index), tabindex: i === index ? 0 : -1 });
        });
    }
    function popup(root) {
        root.find("[data-hotkey]").not("button, input").each(function () {
            var key = this.getAttribute("data-hotkey");
            if (!this.textContent.trim()) return;
            $(this).attr({ role: "button", tabindex: 0, "aria-keyshortcuts": key });
        });
    }
    return { title: title, item: item, actions: actions, advanced: advanced, button: button,
        tabs: tabs, updateTabs: updateTabs, popup: popup };
});
