define(["jquery"], function ($) {
    "use strict";

    function typing(target) {
        return $(target).is("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
            || Boolean($(target).closest("[contenteditable='true']").length);
    }
    function available(element) {
        return !element.disabled && element.getAttribute("aria-disabled") !== "true"
            && $(element).is(":visible") && getComputedStyle(element).visibility !== "hidden";
    }
    function consume(event) {
        event.preventDefault(); event.stopImmediatePropagation();
        return true;
    }
    function activate(element, key) {
        // Native Menu rows distinguish primary activation using `which`.
        // Preserve keyboard intent: Enter confirms multi-selection, Space toggles.
        $(element).trigger($.Event("click", { which: 1, key: key }));
    }
    function move(elements, target, key) {
        var entries = Array.from(elements).filter(available);
        if (!entries.length) return false;
        var index = entries.indexOf(target);
        if (key === "Home") index = 0;
        else if (key === "End") index = entries.length - 1;
        else index = (index + (key === "ArrowUp" ? -1 : 1) + entries.length) % entries.length;
        entries[index].focus({ preventScroll: true });
        entries[index].scrollIntoView({ block: "nearest", inline: "nearest" });
        return true;
    }
    function handle(root, event) {
        if (!root || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || typing(event.target)) return false;
        var focused = root.contains(document.activeElement) ? document.activeElement : null;
        if (!event.shiftKey && (event.key === "Enter" || event.key === " ") && focused
            && $(focused).is("button, [role='button'], [data-hotkey]")) {
            if (available(focused) && !event.repeat) activate(focused, event.key);
            return consume(event);
        }
        if (!event.shiftKey && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
            && $(focused).is(".menu_contents li.selectable, .grid .button")) {
            var group = $(focused).closest(".menu_contents, .grid")[0];
            if (move(group.querySelectorAll("li.selectable, .button"), focused, event.key)) return consume(event);
        }
        // Only explicit UI actions are click-routed. Native Menu letters keep
        // their server-side quantity, multi-selection and relettering semantics.
        var matches = Array.from(root.querySelectorAll("[data-hotkey]")).filter(function (element) {
            return element.getAttribute("data-hotkey") === event.key && available(element);
        });
        if (matches.length !== 1) return false;
        if (!event.repeat) activate(matches[0]);
        return consume(event);
    }
    return { handle: handle, typing: typing, available: available, consume: consume, move: move, activate: activate };
});
