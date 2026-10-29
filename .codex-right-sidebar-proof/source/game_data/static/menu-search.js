/* Presentation adapter for StashSearchMenu's native title and row grammar.
 * Unknown formats retain their original content. Commands and results stay native.
 */
define(["jquery", "comm", "client", "./util", "text-columns"], function ($, comm, client, util, columns) {
    "use strict";
    var pendingFocus = null;

    function source(text) {
        return $("<div></div>").html(util.formatted_string_to_html(text || ""))[0];
    }
    function layout(menu) {
        if (menu.tag !== "stash") return null;
        var text = source(menu.title.text).textContent.trim();
        var match = text.match(/^(\d+) match(?:es)?: (travel|view)\s+\[toggle: !\], by (type|name|dist) \[\/\], (hide|show) useless & duplicates \[=\]$/);
        if (match) return { count: match[1], mode: match[2], sort: match[3], filtered: match[4] === "hide" };
        if (/^0 matches: only useless items found; press = to show\.$/.test(text))
            return { count: "0", filtered: true, empty: true };
        return null;
    }
    function action(label, key, id, selected) {
        var button = $("<button type='button' class='workflow-button'></button>")
            .attr("data-search-control", id).prop("disabled", client.is_watching())
            .append($("<span></span>").text(label));
        if (selected !== undefined) button.attr("aria-pressed", String(selected));
        if (key) button.append($("<kbd aria-hidden='true'></kbd>").text(key));
        button.on("click", function (event) {
            event.stopPropagation();
            if (client.is_watching() || selected === true && id.startsWith("mode-")) return;
            pendingFocus = id;
            comm.send_message("key", { keycode: key.charCodeAt(0) });
        }).on("keydown keypress", function (event) {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        });
        return button;
    }
    function title(menu) {
        var root = menu.elem, spec = layout(menu);
        root.toggleClass("workflow-search-menu", Boolean(spec));
        if (!spec) { root.children(".workflow-search-tools, .workflow-search-summary, .workflow-search-empty").remove(); return; }
        var focus = root.find("[data-search-control]:focus").attr("data-search-control") || pendingFocus;
        root.children(".menu_title").text("Search results");
        var summary = root.children(".workflow-search-summary");
        if (!summary.length) summary = $("<div class='workflow-search-summary' role='status'></div>").insertAfter(root.children(".menu_title"));
        summary.empty().append($("<span></span>").text(spec.count + (spec.count === "1" ? " match" : " matches")),
            "<span class='workflow-search-hint'>Click a result or use its letter key.</span>");
        var tools = root.children(".workflow-search-tools");
        if (!tools.length) tools = $("<div class='workflow-search-tools' aria-label='Search options'></div>").insertAfter(summary);
        tools.empty();
        if (!spec.empty) {
            var modes = $("<div class='workflow-search-modes' role='group' aria-label='Result action'></div>")
                .append("<span class='workflow-search-label'>On select</span>").appendTo(tools);
            modes.append(action("Travel", "!", "mode-travel", spec.mode === "travel"), action("View", "!", "mode-view", spec.mode === "view"));
            modes.append("<kbd class='workflow-search-mode-key' title='Switch between Travel and View'>!</kbd>");
            var sorts = { type: "Item type", name: "Name", dist: "Distance" };
            action("Sort: " + sorts[spec.sort], "/", "sort").attr("title", "Cycle sort: item type, name, distance").appendTo(tools);
        }
        action("Hide useless & duplicates", "=", "filter", spec.filtered).appendTo(tools);
        root.children(".workflow-search-empty").remove();
        if (spec.empty) $("<p class='workflow-search-empty'>All matches are hidden by the filter. Turn it off to see them.</p>").insertAfter(tools);
        // Sort/filter recreate the native menu. Restore the initiating control
        // after the popup focus trap has attached, including keyboard activation.
        if (focus) setTimeout(function () {
            if (!root[0].isConnected) return;
            var target = root.find("[data-search-control]").filter(function () { return this.getAttribute("data-search-control") === focus; });
            if (target.length && !target.prop("disabled")) target[0].focus({ preventScroll: true });
            pendingFocus = null;
        }, 0);
    }
    function item(entry, element, menu) {
        if (menu.tag !== "stash" || entry.level !== 2 || !entry.hotkeys || !entry.hotkeys.length) return false;
        var content = source(entry.text), text = content.textContent;
        var prefix = text.match(/^\s*(\S)\s+[-+]\s+/);
        if (!prefix || prefix[1].charCodeAt(0) !== entry.hotkeys[0]) return false;
        var start = prefix[0].length, end = text.trimEnd().length;
        var location = text.slice(start).match(/^(?:\((\d)\) )?\[([^\]]+)\]\s+/);
        if (!location) return false;
        start += location[0].length;
        var carried = location[2] === "carried";
        var inventoryKey = carried && text.slice(start).match(/^\S\s+-\s+/);
        if (inventoryKey) start += inventoryKey[0].length;
        var state = text.slice(start, end).match(/\s+\((worn|weapon|quivered|melded)\)$/);
        if (carried && state) end -= state[0].length;
        var icon = element.children("canvas").detach(), key = element.children("kbd.workflow-key").detach();
        element.empty().addClass("workflow-search-row").append(icon);
        var copy = $("<span class='workflow-search-copy'></span>").appendTo(element);
        $("<span class='workflow-search-name'></span>").append(columns.slice(content, start, end)).appendTo(copy);
        var detail = carried ? "Carried" : location[2] === "right here" ? "At your position" : location[2];
        if (location[1]) detail += " · Waypoint " + location[1];
        $("<span class='workflow-search-location'></span>").text(detail).appendTo(copy);
        if (carried && state) $("<span class='workflow-state'></span>")
            .text({ worn: "Equipped", weapon: "Wielded", quivered: "Quivered", melded: "Melded" }[state[1]]).appendTo(element);
        element.append(key);
        return true;
    }
    return { title: title, item: item };
});
