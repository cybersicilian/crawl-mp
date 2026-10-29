/* Preserve a reader's visible entry across append, rollback and bounded pruning. */
define([], function () {
    "use strict";
    function capture(container, entries) {
        if (!container) return null;
        var top = container.getBoundingClientRect().top;
        var anchor = Array.from(entries || container.children).find(function (entry) {
            return entry.getBoundingClientRect().bottom > top;
        });
        return { follow: container.scrollHeight - container.clientHeight - container.scrollTop <= 2,
            top: container.scrollTop, anchor: anchor,
            offset: anchor ? anchor.getBoundingClientRect().top - top : 0 };
    }
    function restore(container, position) {
        if (!container) return;
        if (!position || position.follow) container.scrollTop = container.scrollHeight;
        else if (position.anchor && container.contains(position.anchor))
            container.scrollTop += position.anchor.getBoundingClientRect().top
                - container.getBoundingClientRect().top - position.offset;
        else container.scrollTop = position.anchor ? 0 : position.top;
    }
    return { capture: capture, restore: restore };
});
