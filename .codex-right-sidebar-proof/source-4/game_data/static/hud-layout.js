/* Measure DOM chrome; the native renderer still owns tiles and canvas size. */
define(["jquery"], function ($) {
    "use strict";
    var observer, changes, frame;
    var chrome = "#party_turn_banner, #dcss_quick_dock, #mobile_input, #workflow_ping_status";

    function height() {
        var total = 0;
        $(chrome).each(function () {
            if ($(this).is(":visible") && !this.classList.contains("hud-floating"))
                total += $(this).outerHeight(this.id !== "dcss_quick_dock");
        });
        return Math.ceil(total);
    }
    function messageHeight(fallback) {
        var strip = document.getElementById("hud_bottom_row");
        if (strip) return strip.getBoundingClientRect().height;
        var pane = document.getElementById("message_pane");
        return pane && pane.classList.contains("hud-floating") ? 0 : fallback;
    }
    function sidebarWidth() {
        return Math.ceil(document.getElementById("right_column").getBoundingClientRect().width);
    }
    function stop() {
        if (observer) observer.disconnect();
        if (changes) changes.disconnect();
        cancelAnimationFrame(frame);
        $(document).off("hud_workspace_changed.hudMeasure");
    }
    function observe(refresh) {
        stop();
        var root = document.getElementById("left_column");
        if (!root) return;
        function schedule() {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(refresh);
        }
        observer = new ResizeObserver(schedule);
        function watch() { $(chrome).each(function () { observer.observe(this); }); schedule(); }
        changes = new MutationObserver(watch);
        changes.observe(root, { childList: true });
        $(document).off("hud_workspace_changed.hudMeasure").on("hud_workspace_changed.hudMeasure", schedule);
        watch();
    }
    return { height: height, sidebarWidth: sidebarWidth, messageHeight: messageHeight, observe: observe, stop: stop };
});
